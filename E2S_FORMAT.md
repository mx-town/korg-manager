# E2S `e2sSample.all` Format

Reverse-engineered and validated against a real 403-sample **Hacktribe** hardware
dump (17,120,800 bytes, `test-data/e2s/hacktribe.e2sSample.all`, gitignored) and
cross-checked against the Oe2sSLE reference implementation. Implemented in
`src/e2s-format.js`.

> **History:** two earlier maps were self-consistent but wrong vs hardware.
> The first assumed 1000×8-byte entries with data at 0x1F50 (crashed on real
> files). The second read 510×8-byte `[start, end]` pairs — double the real
> stride — and therefore saw only **every second sample** ("202" of the 403 in
> the dump). All its observed quirks (end offset = absolute, "last slot stores
> 0", "garbage entries") were artifacts of reading consecutive 4-byte start
> offsets in pairs.

## File layout

```
[0x0000 – 0x000F]  16-byte magic:  "e2s sample all" 0x1A 0x00
[0x0010 – 0x0FFF]  Offset table:   1020 entries × uint32LE START offset
[0x1000 …]         Concatenated RIFF WAV data, back-to-back in slot order
```

### Offset table

- **1020 entries × 4 bytes**, one `uint32LE` start offset per entry; `0` = empty
  slot. Table spans `0x10…0x1000`, so data begins at **0x1000 (4096)**.
- **Table index == hardware sample number − 1** (entry 518 → sample “519”).
- WAV length is **self-describing** (`RIFF size + 8`); the table stores start
  offsets only. A robust reader bounds-checks and skips any entry that isn't a
  valid in-bounds `RIFF`, and never throws on one bad entry.
- Real files store the WAVs contiguously in slot order; the writer reproduces
  that (a load→save of the real dump is **byte-identical**, whole file).

## Firmware sample-number layout

| Range (numbers) | Stock E2S | Hacktribe (E2 firmware on E2S) |
|---|---|---|
| 1–18 | synth waveforms / audio-in (firmware) | E2 oscillators (firmware) |
| 19–421 | factory samples | E2 factory waves (firmware, **not in the file**) |
| 422–500 | user samples | **still firmware — table entries below index 500 are IGNORED** |
| 501–999 | user samples | user samples (`e2sSample.all`) |

- **Hacktribe ignores every table entry below index 500.** A sample written
  there never appears on the device (the firmware wave shows instead). New
  samples must be placed at indices 500–998 (numbers 501–999).
- The app models this per file (`bank.hacktribe`, auto-detected: any used slot
  below index 500 ⇒ stock): new samples are **appended after the highest used
  slot**, floor `E2S_HACKTRIBE_BASE` (500) or `E2S_STOCK_BASE` (421), cap
  `E2S_MAX_SAMPLE_INDEX` (998). Existing slots are **never renumbered** — E2S
  patterns reference sample numbers.

## WAV payload

Standard RIFF/WAVE, chunk order **`fmt ` → `data` → `korg`** (korg at the END —
matching this order keeps saves byte-identical). The `korg` chunk contains an
`esli` sub-chunk (1172 bytes). Per-sample `sampleRate` lives in the `fmt` chunk
and varies (samples are not all 48 kHz). A few real samples are **stereo**
(`numChannels` 2, interleaved data) — the channel count is carried through
parse/build (`sample.channels`) so their fmt chunks round-trip byte-identically.

## ESLI metadata block (1172 bytes)

Field offsets **within the esli data** (after the 8-byte `esli` sub-chunk header):

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| 0x00 | u16 | **osc index** | == the offset-table index (0-based sample number). Verified identical across all 403 dump samples. Stamped on write when a slot is assigned. |
| 0x02 | char[16] | **name** | ASCII, null-padded. (Old code read 0x04 → dropped first 2 chars.) |
| 0x12 | u16 | **category** | `E2S_CATS` index. Only **2–17** occur on user samples; 0 (`Analog`) and 1 (`Audio In`) are firmware oscillator slots. Imports use 17 (`User`). |
| 0x14 | u16 | **import number** | == slot **+ 50** in 403/403 dump samples |
| 0x19 | u8 | **loudness** | 0–127 (drives the app's "boost") |
| 0x22 | u16 | **playLogPeriod** | `round(63132 − 3072·log₂(sampleRate))`, **exact for 403/403**. 48 kHz → `0x3C00`. Never 0. (Old code wrote a u32 at 0x20; the u16 at 0x20 is 0 in every real sample.) |
| 0x24 | u16 | **playVolume** | level, `0xFFFF` = 100%; real values are 5% steps down to `0x7FFF`. **Never 0.** |
| 0x28 | u32 | **startPoint** | in **BYTES** (frame × 2) |
| 0x2C | u32 | **loopStart** | in **BYTES** (frame × 2) |
| 0x30 | u32 | **endPoint** | last frame, in **BYTES** (frame × 2) |
| 0x34 | u32 | **one-shot flag** | **1 = one-shot, 0 = loop.** 403/403 agreement with `loopStart < endPoint`. |
| 0x3C | u32 | **length** | total, in **BYTES** (frame × 2) |
| 0x48 | u32 | **sampleRate** | Hz (old code read 0x30) |
| 0x4E | u16 | **original index** | the index a sample was *first* assigned, and never rewritten afterwards — so on a relocated sample it is stale. See below. |

Key points:

- **Sample points are byte offsets (frame × 2).** `parseEsliData` exposes them to the
  rest of the app as **frame counts** (÷2); `buildEsliData` converts back (×2).
- **The loop flag at 0x34 is explicit** (an earlier revision of this doc claimed
  there was none). It always agrees with `loopStart < endPoint`, so the app derives
  both from one loop state and writes them together — they can never contradict.
- Everything from **0x50 on is zero** for an ordinary sample; only sliced samples
  carry data there (out to ~0x493).
- **No checksums** — files can be freely written.

### Fields a freshly built sample must fill in

`0x12`, `0x14`, `0x22`, `0x24`, `0x34` and `0x4E` are absent from any "known
fields" list based only on what the app displays, but all six are non-zero (or
slot-derived) in every real sample. Leaving them at 0 produced files the hardware
rejects with **File Error** on LOAD ALL SAMPLES — see the regression note below.
`buildEsliData` treats 0 as *unset* in `category`, `playLogPeriod`, `playVolume`
and the two index fields and fills in the derived value, so re-saving a bank
written before this was known repairs it in place rather than preserving the
damage.

> **Slot-derived caveat:** the dump occupies a contiguous slot run, so `slot + K`
> and `file-ordinal + K'` fit 0x14/0x4E equally well. The slot-derived reading is
> used (it needs no file-wide context and reproduces the dump exactly).

### 0x4E is build residue, not a firmware convention

Two real files hold the *same* 403 samples and disagree on 0x4E alone — 2 bytes
per sample, nothing else:

| File | 0x4E for slot 518 |
|------|-------------------|
| `electribe sampler/Sample/e2sSample.all` | `18` — slot − 500 |
| `hacktribe/Sample/e2sSample.all` | `518` — the slot itself |

**An earlier revision of this document read that as a per-card *firmware*
convention — stock writes `slot − 500`, a Hacktribe card writes the slot. That
reading is refuted** (issue #6, 2026-09-02); it is kept here so it does not get
re-derived.

0x4E is **build residue**. Oe2sSLE writes it (`OSC_0index1`) only when a sample's
number is first assigned — `self.OSC_0index = self.OSC_0index1 = num-1` — and its
`save()` recomputes **0x14 only**. A *relocated* sample therefore keeps a stale
0x4E pointing at its original index while 0x14 follows the new slot. Measured on
the 403-sample dump (slots 518–920):

| Field | Value across the dump | Reading |
|-------|----------------------|---------|
| 0x4E | `18` … `420` | the original factory indices, never rewritten |
| 0x14 | `568` … `970` | `slot + 50`, rewritten on every save |
| names | `Hippy`, `BigBreaks`, `Vinyl`, `GamelanWave` | Korg factory sample names |

Oe2sSLE's `factory_importNums` covers `OSC_0index` **18–420 — 403 entries**, exactly
this range. The file is the **stock factory set relocated by +500** into the
Hacktribe user area, and `slot − 500` is arithmetic coincidence: the relocation
offset happened to be 500.

> **No byte in a `.e2sSample.all` identifies the firmware that wrote it.** No
> primary source — Oe2sSLE, Hacktribe's code, wiki or maintainer — documents one
> (issue #5). The app does not detect the mode; the user declares it. See
> `docs/adr/0003-firmware-modus-wird-erklaert-nicht-erkannt.md`.

*Residual uncertainty, stated plainly:* the two-card byte diff was never
performed. This rests on the reference implementation's behaviour plus the exact
factory-index match on one file, and would be overturned by a genuine Hacktribe
dump whose 0x4E holds something no tool would have written.

**The behaviour this justified is unchanged.** Both encodings are device-accepted,
so a fresh sample must copy the convention of the file it joins rather than a
hardcoded constant.

`deriveEsliNumbering(samples)` therefore reads the offsets for 0x14 and 0x4E back
off the file being written and `buildE2sAllFile` passes them down, so a fresh
sample copies the convention of the file it joins. An offset is adopted only when
every sample that has the field set agrees on it; a self-inconsistent file falls
back to the dump constants (`+50` / `−500`). Neither field may come out **0** —
that is the value the hardware rejects with *File Error* — so when `slot + K`
would fall below 1 the **slot itself** is written instead, the encoding the
Hacktribe card is confirmed to load. Only the stock offset on a slot under 501
reaches this, which is exactly the stock user area (base 421).

## Writing: preserve-and-patch

The 1172-byte block has many fields we have not fully decoded. To stay
hardware-faithful:

- Samples loaded from a real file keep their original block as `esli._raw`.
  `buildEsliData` uses it as the base and patches only known fields, so every
  undocumented per-sample byte is written back **byte-identical**. A load→save
  of the real dump reproduces the entire file exactly.
- Freshly imported / cross-device-converted samples have no `_raw`, so they start from
  `ESLI_TEMPLATE` — the bytes that are identical across the real samples (structural
  constants) with per-sample fields zeroed and then set.
- `_raw` and `channels` are threaded through BOTH app paths: the old
  `e2sStoredSamples` handlers and the unified file-tabs store
  (`_e2s._raw`/`_e2s.channels` in `src/file-tabs.js`, `src/bank.js`).

## Regression: "File Error" on LOAD ALL SAMPLES

Reported 2026-07-30 (Hacktribe, file correctly named `e2sSample.all` at the card
root, so neither a path nor a memory problem). Reproduced by importing an ESX
sample into the real 403-sample dump and saving: the file layout came out
correct — offset table, 2-byte alignment, no gaps, and all 403 pre-existing
samples byte-identical — but the one imported sample had six ESLI fields at 0.
The most damaging was **0x34 = 0**, which claims a loop while `loopStart ==
endPoint` marks an empty loop region: a contradiction no hardware-written sample
contains. Fixed by filling all six from the invariants above.

## Not yet hardware-confirmed

Read path and byte-identical write round-trip are verified against the real
Hacktribe dump, and the six invariants above hold across all 403 of its samples.
What is **not** confirmed is which of them the firmware actually validates — the
fix makes an imported sample structurally indistinguishable from a hardware-written
one rather than isolating the single field that trips the loader. If a bank with
an appended sample (slot ≥ 501) still fails to load, bisect by writing test banks
that repair one field at a time. A few constant structural bytes remain unmapped;
preserve-and-patch protects them for edited samples.
