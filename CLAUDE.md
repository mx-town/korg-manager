# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**NBG-GESCHRUBBE** — an Electron 28 desktop app for managing Korg Electribe hardware: ESX-1 (sampler), E2S (sampler), EMX-1 (synth), and E2 (synth/sampler). Pure JavaScript, no UI framework, vanilla CSS with cyberpunk/hardware aesthetic.

The app has three main sections:
1. **ESX-1 Sample Manager** — full read/write with 18 DSP effects, waveform editor, batch ops
2. **E2S Sample Manager** — full read/write with cross-device conversion (ESX↔E2S)
3. **Pattern Viewer** — unified viewer for ESX-1, EMX-1, E2/E2S patterns with audio playback (ESX only)

## Commands

```bash
npm start              # Run app in dev mode (Electron)
npm test               # Run all tests once (Vitest) — 455 tests, ALL must pass
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (V8 provider)
npm run build          # Build Windows NSIS installer
npm run pack           # Portable build (no installer)
npx vitest run tests/parsers/esx.test.js  # Single test file
```

## Architecture

### Electron IPC Pattern (understand this first)

All file system and audio operations go through a strict IPC bridge:

1. **Renderer** (`src/index.html`) calls `window.api.*` methods
2. **Preload** (`preload.js`) maps those to `ipcRenderer.invoke()` via `contextBridge`
3. **Main process** (`main.js`) handles them via `ipcMain.handle()` — all business logic lives here

Context isolation is enabled. The renderer cannot access Node.js or the file system directly.

### Main Process State (`main.js`)

Global mutable state:
- `currentSamples[]` — ESX-1 in-memory sample array with per-sample undo/redo stacks (50 deep)
- `esxOriginalBuffer` — preserved original .esx bytes for pattern-safe rebuilds via `rebuildEsxFile()`
- `esxPatternSamples` — cache of pattern-loaded samples for audio playback
- `e2sStoredSamples[]` — E2S in-memory sample array

### Binary Format Parsers (`src/`)

| File | Device | Read | Write | Key Details |
|------|--------|------|-------|-------------|
| `esx-format.js` | ESX-1 | ✅ | ✅ | **Variable size** (`0x250010 + curOff`), 26,542,080 is only the maximum. 16-bit BE PCM, 256 mono/128 stereo. See `ESX_FILE_STRUCTURE.md` |
| `e2s-format.js` | E2S | ✅ | ✅ | RIFF WAV + Korg ESLI chunks, 499 user slots, 48kHz native |
| `emx-format.js` | EMX-1 | ✅ | ❌ | Dual-mode: SysEx (1,728,000 bytes) or SmartCard (1,736,704 bytes). See `EMX_SMARTCARD_FORMAT.md` |
| `e2pat-format.js` | E2/E2S | ✅ | ✅ | Single pattern (16,641 bytes) or all-patterns format |
| `file-io.js` | All | — | — | Auto-detection: magic bytes → file size → extension fallback |

### Format Documentation (in repo root)

- **`ESX_FILE_STRUCTURE.md`** — Complete ESX-1 binary spec (592 lines, every byte mapped)
- **`EMX_SMARTCARD_FORMAT.md`** — EMX-1 SmartCard format spec (reverse-engineered from hardware dumps)

Read these files before modifying any parser code.

### UI (`src/index.html`)

Single HTML file (~5000+ lines) containing all CSS and JS inline. Three sidebar tabs:
- ESX-1 SAMPLER — sample list, waveform, modify modal (18 effects), batch ops
- E2S SAMPLER — sample list, waveform, category/tune/boost controls
- PATTERNS VIEWER — unified for all devices, three view modes (PARTS/STEPS/GRID)

Uses CSS custom properties for theming (`--hi`, `--led`, `--cyan`, `--void`, `--panel`, `--brd`, etc.).
Fonts: Orbitron (headings), Share Tech Mono (LCD values), Rajdhani (labels).

### Test Structure

- `tests/parsers/` — unit tests per parser (round-trip integrity, edge cases)
- `tests/integration/` — file I/O routing and format detection
- `tests/fixtures/generators/` — functions that generate minimal valid test buffers
- `test-data/emx/` — real .emx hardware dumps (BEST.EMX, DA4TOFE.EMX, ZRITERLY.EMX)

## Critical Domain Knowledge

### ESX-1 Gotchas
- **Drum steps are bit-packed LSB-first**: 8 steps per byte, 16 bytes = 128 step slots. NOT byte-per-step.
- **Keyboard gate bits**: Bit 7 = 0 means ON (inverted from what you'd expect)
- **Accent logic inverted**: 0xFF = OFF
- **Tempo encoding**: uint16BE / 128 = BPM (same for ESX and EMX SmartCard)
- **Export must use `rebuildEsxFile()`**: Preserves patterns/songs/global params while rewriting only sample data. Naive re-export wipes all pattern data.
- **`esxPatternToUI()` must spread entire part objects**: `{...part, steps, velocities}` — cherry-picking fields causes missing parameters in the UI.

### EMX-1 Gotchas
- **SmartCard ≠ SysEx format**: Different file sizes (1,736,704 vs 1,728,000), pattern sizes (4,806 vs 6,750), header sizes (512 vs 288). NOT a simple 7/8-bit transform.
- **EMX is read-only**: No audio in the file — synthesis-based. Sounds live in hardware ROM.
- **`detectEmxFormat(buf)`** returns `'smartcard'` or `'sysex'` based on file size.
- **SmartCard pattern parts**: 9 parts × 26 bytes (10 params + 16 step bytes), MSB-first bit packing.
- **`emxPatternToUI()` must also spread part objects**: Same pattern as ESX — spread `...sp` or `...dp` to pass all parsed fields through to the UI.

### E2S Gotchas
- Native sample rate is 48kHz (vs ESX's 44.1kHz) — conversion needed for cross-device
- No checksums in the format — files can be freely written
- ESLI metadata chunk is 1,172 bytes inside a `korg` RIFF chunk
- **Offset table = 1020 entries × uint32LE START offset, data starts at 0x1000.** One start offset per entry, `0` = empty — NOT 510×8-byte `[start, end]` pairs; that reading was refuted (`E2S_FORMAT.md:10`) and corrected in `5636c89`. Derive a sample's length from its RIFF header, not from the table. Skip garbage entries; never throw.
- **ESLI field map is NON-obvious**: name @0x02 (16B, not 24), category @0x12, sampleRate @0x48, points (start/loop/end/length) @0x28/0x2C/0x30/0x3C stored as **BYTES (frame×2)**. The loop flag at 0x34 is **explicit** (1 = one-shot, 0 = loop) and always agrees with `loopStart < endPoint`, so the app derives both from one loop state and writes them together. (An earlier revision of `E2S_FORMAT.md` claimed there was no such byte; that was wrong — see `E2S_FORMAT.md:87`.)
- **0x14 and 0x4E must never be written as 0.** Both are slot-derived, and 0 is the value the hardware rejects with *File Error*. When `slot + K` would fall below 1 the slot itself is written instead — never a clamp into 0.
- **Writer uses preserve-and-patch**: samples loaded from a real file keep `esli._raw` (the full 1172-byte block); `buildEsliData` patches only known fields so undocumented bytes stay hardware-identical. `main.js` must thread `esli._raw` through `e2sStoredSamples` for this to work in the app.
- **Read `E2S_FORMAT.md` before touching `e2s-format.js`** — full spec, reverse-engineered from real hardware dumps.

## Pattern Viewer Architecture

The pattern viewer normalizes all device formats into a unified UI format:

```javascript
// Unified pattern format (output of esxPatternToUI / emxPatternToUI / patternToUI)
{
  name: string,         // Pattern name
  bpm: number,          // Tempo
  swing: number,        // Swing amount
  steps: number,        // Total steps
  beat: string,         // '16th' | '32nd' | '8th' | '8-tri'
  deviceId: string,     // 'esx' | 'emx' | 'e2' | 'e2s'
  format: string,       // 'ESX-1' | 'EMX-1' | 'E2' | 'E2S'
  parts: [{
    type: string,       // 'drum' | 'synth' | 'keyboard' | 'stretch' | 'slice' | 'audioin' | 'accent'
    name: string,       // Display name
    steps: boolean[],   // Step on/off (128 entries)
    velocities: number[], // Velocity per step
    level, pan, filterType, filterCutoff, filterRes, pitch, // ... all parsed params
  }]
}
```

**ESX patterns have audio playback** via Web Audio API — samples loaded from .esx PCM data into `patSampleCache`. EMX patterns are visual-only (no audio data in file). The `patFormat` variable drives conditional behavior (hide PLAY button for EMX, show synth panel for EMX, etc.).

## Development Workflow

- **Large comprehensive prompts preferred** — not incremental small fixes
- **All 455 tests MUST pass** after every change — `npm test`
- **Git tags** mark milestones
- **Read format docs before touching parsers** — check `ESX_FILE_STRUCTURE.md` and `EMX_SMARTCARD_FORMAT.md`
- **When adding IPC handlers**: update main.js handler + preload.js bridge + renderer call site
- **When modifying pattern toUI converters**: spread full part objects, don't cherry-pick fields

## Agent skills

Configuration the `mattpocock-skills` engineering skills read. Written by
`/setup-matt-pocock-skills` on 2026-09-02; edit these files directly rather than
re-running the setup.

### Issue tracker

GitHub Issues in the private `mx-town/korg-manager`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`); only `wontfix` exists so far. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (glossary) plus `docs/adr/`, and the per-device format
specs a parser change must be read against. See `docs/agents/domain.md`.
