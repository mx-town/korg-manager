# Modern Korg Manager (Tauri) — reverse engineering findings

Analysis of `korgmanager.exe` (4,311,831 bytes), a Windows installer built 2026-07-27.

**Relationship to this repo:** the analysed binary is *not* a build of this repository. This repo
is the Electron app (`NBG-GESCHRUBBE`); the binary is a separate **Tauri** application,
"Modern Korg Manager", identity `com.kozy.modernkorgmanager`. These findings are recorded here
because the two projects target the same hardware and the backend design is directly relevant.

**Scope note:** the recovered frontend assets are deliberately **not** included in this repo.
The extraction workspace, tooling scripts, and raw analysis artefacts live outside version
control in a local `korgmanager-reverse` directory. Only the findings are committed here.

## What the binary is

| | |
|---|---|
| Outer layer | NSIS 3.11 installer (Unicode, LZMA solid) |
| Payload | `Modern Korg Manager.exe` — PE32+ x86-64, 10,343,424 bytes |
| Framework | **Tauri 2.11.5** (Rust backend + WebView2 frontend) |
| Frontend | **React + Vite** (production build, no sourcemaps) |
| App identity | `com.kozy.modernkorgmanager` / "Modern Korg Manager 2.0" (title), v2.1 (about string) |
| Rust crate | `modern_korg_manager` (lib target `modern_korg_manager_lib`) |
| Built | 2026-07-27 18:21 |
| Build machine | `C:\Users\jerem\` |
| Upstream repo | `https://github.com/kozywav/modernkorgmanager` (referenced in updater URLs) |
| UI language | German |

## Recoverability

| Layer | Status |
|---|---|
| Frontend HTML/CSS/JS | **Recovered verbatim** — embedded brotli-compressed in the PE, extracted intact |
| ESX bank format logic | **Recovered** — it lives in the frontend JS, not in Rust |
| Rust backend source | **Not recoverable verbatim** (native code, no PDB shipped) |
| Rust backend behaviour | **Reconstructable** — command surface, all string literals, and exact subprocess argv are recoverable |

Component and variable names in the frontend were mangled by esbuild and cannot be restored; the
logic and all UI text are intact.

### Architectural finding worth noting

The Tauri app puts **ESX bank parsing and serialisation in the frontend JavaScript**, not in Rust
(112 `DataView`/`Uint8Array` operations in the app bundle, alongside all Korg/Electribe/Pattern
symbols). Rust is used only for I/O, MIDI, subprocess orchestration, backups and shell
integration. That is the inverse of this repo's split, where all format logic lives in the main
process.

## Rust backend: Tauri command surface

Recovered from the `invoke_handler` registration table, with argument names:

```
create_backup(app, payload, label, keepCount)
create_all_backup(bytes)
create_esx_backup(...)
list_backups()
list_backup_entries()
read_backup(name)
read_backup_bytes(name)
delete_backup(name)
open_backup_folder()
open_external_url(url)
cancel_audio_job(jobId)
open_audio_file(path)
reveal_audio_path(path)
midi_connect(state, inputIndex, outputIndex)
midi_send(data)
midi_disconnect()
midi_bridge_status()
pick_save_path(suggestedName, extension, filterLabel)
write_binary_file_to_path(...)
save_binary_file(...)
eject_removable_drive(driveRoot)
```

Leaked Rust type name: `modern_korg_manager_lib::MidiBridgeState`.

MIDI port names exposed to the OS: `Modern Korg Manager Electribe Input` / `... Electribe Output`.

## Rust backend: crate dependencies

From embedded cargo registry paths (crates that emitted panic locations):

```
tauri 2.11.5, tauri-runtime-wry 2.11.4, tauri-utils 2.9.3, wry 0.55.1, tao 0.35.3,
muda 0.19.3, softbuffer 0.4.8, dpi 0.1.2, webview2-com 0.38.2, windows 0.61.3,
midir 0.11.0, cfb 0.7.3, infer 0.19.0, glob 0.3.3, regex 1.13.0, url 2.5.8,
serde 1.0.228, serde_json 1.0.150, anyhow 1.0.103, tokio 1.52.3, time 0.3.53,
bytes 1.12.1, http 1.4.2, cookie 0.18.1, semver 1.0.28, brotli-decompressor 5.0.3,
crossbeam-channel 0.5.16, parking_lot_core 0.9.12, once_cell 1.21.4, ...
```

`midir` = MIDI I/O (WinMM backend). `cfb` = OLE compound file reader.

## Audio engine — Demucs stem separation

Fully characterised. The engine is a self-installing Python 3.11 + PyTorch CPU + Demucs 4.1
runtime that the app provisions on first use.

### Models (function `0x140214ef0`)

| UI tier | Model |
|---|---|
| Fast / Balanced | `htdemucs` |
| Studio | `htdemucs_ft` |
| 6 Stems | `htdemucs_6s` |

### Demucs argv (exact literals, function `0x140214ef0`)

```
--out  --int24  --clip-mode rescale  -n <model>  --jobs <n>
--shifts <n>  --overlap 0.10  --two-stems vocals  --device <cpu|cuda>
```

Working-dir / output tokens: `MKM Stems`, `_STEMS_`, `.engine21`, `song`.

### Stem name mapping (raw → display)

```
vocals -> Vocals      drums  -> Drums     bass  -> Bass
other  -> Other       guitar -> Guitar    piano -> Piano
no_vocals -> instrumental -> Instrumental
```

### Engine verification probe (function `0x1400341e0`)

```
python -c "import torch, demucs, sphn; from demucs.pretrained import get_model;
           print('torch='+torch.__version__); print(...)"
```

### Python runtime provisioning (function `0x140036340`)

Direct download: `https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe`

```
/quiet InstallAllUsers=0 Include_launcher=0 Include_pip=1 Include_test=0
Include_doc=0 Include_tcltk=0 Shortcuts=0 PrependPath=0
```

WinGet fallback: `winget install --id Python.Python.3.11 --exact
--accept-package-agreements --accept-source-agreements --silent --disable-interactivity`

Install location: `…\Programs\Python\Python311`. Log: `component-install.log`.

### Python package install (function `0x140039f70`)

```
python -m venv …
python -m ensurepip
pip install --upgrade pip --disable-pip-version-check --no-input
    --retries 5 --timeout 90 --index-url https://pypi.org/simple
    setuptools wheel packaging
pip install --only-binary=:all: numpy==1.26.4 sphn==0.1.12   (timeout 120)
pip install torch …                                          (timeout 180)
pip install demucs==4.1.0                                    ("Demucs 4.1")
pip check                                                     ("Pip Check")
```

Setup phase labels (German, in order): *Audio-Komponenten werden vorbereitet* → *FFmpeg und
ffprobe werden eingerichtet* → *Eigene Modern-Korg-Manager-Runtime / Python 3.11 wird
eingerichtet* → *PyTorch CPU + Demucs 4.1 Windows / Stem-Engine wird installiert* → *AI-Modelle
werden heruntergeladen* → *Installation wird geprüft*.

Model-ready marker file: `models-ready-v3.txt`.

### FFmpeg (function `0x140034ce0`)

Download: `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip`
Extract via `tar.exe -xf <zip> -C <dir>`. WinGet fallback id `Gyan.FFmpeg`.

Decode-to-PCM argv: `-nostdin -i <in> -t <dur> -vn -ac <n> -ar <rate> -f f32le pipe:1`

Tempo/pitch render argv:

```
-y -hide_banner -nostdin -nostats -progress pipe:1 -stats_period 0.25
-i <in> -vn -af "asetrate=<r>,aresample=44100" -ar 44100 -c:a <pcm_s24le|pcm_s16le>
```

### ffprobe metadata probes

Stream info (`0x140031390`): `-v … -show_entries … -of json -select_streams a:0`
requesting `codec_name, sample_rate, channels, bits_per_sample, bits_per_raw_sample, duration, size`.

Embedded BPM tags (`0x14002b5a0`):
`-show_entries format_tags=BPM,TBPM,bpm,tbpm:stream_tags=BPM,TBPM,bpm,tbpm -of json`

### yt-dlp

Binary: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`

```
--print after_move:filepath -f bestaudio/best --ffmpeg-location <dir>
-o "%(title).160B [%(id)s].%(ext)s" --no-playlist --max-downloads 1
--match-filter "!is_live" --no-progress --no-warnings --windows-filenames
```

## Analysis result payloads (serde field names)

```
durationSeconds, sampleRate, channels, codec, bitDepth, fileSizeBytes,
bpm, confidence, candidates, method, analysedSeconds,
key, scale, camelot, keyConfidence, keyAlternatives
```

Component status payload:

```
ffmpeg, ffmpegPath, demucs, demucsRunner, python, pythonVersion,
cudaAvailable, gpuHint, modelsReady, modelNames, autoSetupAudio, logPath,
ytDlp, ytDlpPath, ytDlpVersion, ready
```

MIDI/device payload: `index, id, name, kind, isKorg, connected, inputName, outputName, timestamp`

Job progress payload: `jobId, progress, message, detail, done, cancelled, fileName, phase, error`
with phases `downloading` / `separating`.

Save payload: `bytesWritten, verified, removableMedia, recoveryBackupCreated, driveRoot, ejected`

## Windows shell integration

File dialogs are driven through PowerShell rather than the Tauri dialog plugin:

```
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.{Save|Open}FileDialog | FolderBrowserDialog
  $owner.Text = 'Modern Korg Manager'
```

Removable-drive detection uses `Get-Disk` / `BusType` ∈ `USB, SD, MMC`, excluding
`IsBoot`/`IsSystem` disks — this backs `eject_removable_drive` and the write-cache flush
(*Schreibcache wird synchronisiert*) safety step before ejecting an Electribe SD card.

Updater checks `Get-AuthenticodeSignature` on downloaded installers and pulls releases from
`https://github.com/kozywav/modernkorgmanager/releases/download/`.

## Method

Four scripts were written to produce the above (kept outside this repo):

| Script | Purpose |
|---|---|
| `extract_assets.py` | Walks the Tauri `phf` asset map in `.rdata`, brotli-decompresses each embedded frontend file |
| `func_strings.py` | Parses `.pdata` for exact function bounds, scans `.text` for `lea rip+disp32` string refs paired with imm32 lengths, buckets literals per function |
| `rdata_strtab.py` | Recovers `&str` statics stored as 16-byte `(ptr,len)` records in `.rdata` |
| `dump_rdata.py` | Prints raw `.rdata` at a VA to read merged literal runs |

The `func_strings.py` approach is what made the subsystem attribution possible: 3,009 string
literals with exact boundaries, grouped by the function that references them, across 1,639
functions. Plain `strings(1)` merges adjacent Rust literals and loses both boundaries and the
function they belong to.
