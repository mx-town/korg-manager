# Unified Sample Manager (Dual-Bank) — Design

**Date:** 2026-07-17
**Status:** Approved (brainstorming session with visual mockups; user picked
dual-pane layout "A" with pop-up editor)
**Motivation:** The app has two separate sampler tabs (ESX-1 SAMPLER, E2S
SAMPLER) with unequal features — the E2S tab lacks the modify modal (18 DSP
effects), waveform editing tools, and batch ops. The user wants ONE sample
manager window that loads *any* supported sample bank file, with full feature
parity, and — the headline feature — **two banks open side by side with
drag & drop sample copying between them** (including ESX+ESX or E2S+E2S).

## Project roadmap (decided in this session)

This spec covers **Project S** only. The remaining projects get their own
spec → plan → implementation cycles later, in this order:

| # | Project | Decisions already recorded |
|---|---------|---------------------------|
| S | **Unified Sample Manager** (this spec) | Dual-bank, pop-up editor, full parity |
| B | Sample Import 2.0 | MP3/FLAC/OGG decode, real AIFF parsing (dialog already advertises .aif but code can't parse it), stereo import for ESX stereo slots, higher-quality resampling + optional normalize, read loop points from WAV `smpl` chunk |
| C | Import comfort | Drag & drop from OS, pre-import info/warning dialog (rate, bit depth, mono/stereo, quality loss), batch folder import |
| P | E2S/E2 patterns in Pattern Viewer | Full integration: display like EMX (fix bare-bones `patternToUI()` in main.js:1341 which drops nearly all part params), sample names from loaded E2S bank, **editable + save back** to .e2pat/.e2allpat, **audio playback** via loaded E2S samples (oscType→sample, note pitch, gate/tie) |

## Scope (Project S)

- One **SAMPLER** tab replaces the two existing sampler tabs (at the end of
  the migration; see Transition plan).
- Two independent **bank slots** (A, B). Each can load **any** supported
  file: `.esx` or `e2sSample.all` — auto-detected. Any combination is valid:
  ESX+E2S, ESX+ESX, E2S+E2S, or just one bank loaded.
- Full feature parity: the 18 DSP effects, waveform editor, normalize, trim,
  cut, loop xfade, duplicate, batch ops, and per-sample undo/redo (50 deep)
  work identically on ESX and E2S samples.
- Drag & drop (and a button alternative) copies samples between banks with
  automatic conversion.

Out of scope: new import formats (Project B), OS-level drag & drop
(Project C), pattern work (Project P), any visual redesign — existing
cyberpunk theme, CSS variables, fonts, and the modify modal stay as-is.

## UI

### Layout (mockup variant A — dual-pane, Commander style)

- **Header row:** per bank — file name, device badge (ESX-1 / E2S), slot
  counter (e.g. "214/256").
- **Two full-height sample lists side by side.** Columns: slot number, name,
  rate, mono/ST, length; E2S banks additionally show category. Per row:
  ▶ (preview) and ✎ (open editor) icons.
- **Empty bank slot** renders a large dropzone: "DATEI LADEN (.esx /
  e2sSample.all)". With only one bank loaded the tab feels like today's
  single-device manager.
- **Footer toolbar:** LOAD A · LOAD B · SAVE A · SAVE B · BATCH ·
  "⇄ copy marked" (button alternative to dragging).

### Interaction

- Single click selects; **Ctrl/Shift-click multi-selects** (feeds batch ops
  and multi-drag).
- **Double-click OR ✎** opens the editor (user picked "both").
- **Drag & drop between lists:** drop on a specific slot targets that slot
  (occupied slot → overwrite confirm showing both sample names); drop on
  empty area → next free slots. Drop target highlights while dragging.
  After the drop: toast summarizing the result ("3 samples copied,
  44.1→48 kHz converted").

### Editor pop-up

The existing MODIFY modal (src/index.html:1615) is reused **unchanged**
except for two additions:

1. **Origin badge** in the modal header: bank + device, e.g.
   "BANK A · ESX-1".
2. **E2S param row** (Category / Tune / Boost) shown only when the open
   sample belongs to an E2S bank — these controls move here from the old
   E2S tab.

## Architecture

### Main-process data model (main.js)

```javascript
banks = [ bankOrNull, bankOrNull ]   // index 0 = A, 1 = B

// One bank:
{
  device: 'esx' | 'e2s',   // auto-detected on load (file-io.js)
  filePath, fileName,
  samples: [ { name, pcmData, sampleRate, stereo,
               category?, tune?, boost?,          // E2S only
               loopStart?, loopEnd?,              // preserved everywhere
               undoStack, redoStack } ],          // 50 deep, per sample
  originalBuffer,          // ESX only: original bytes for rebuildEsxFile()
  dirty: boolean
}
```

### IPC layer — new `bank:*` namespace

All handlers take `bankIndex` as first parameter. Renderer calls
`window.api.bank.*` (preload.js bridge added accordingly).

| Handler | Behavior |
|---------|----------|
| `bank:load(idx)` | File dialog → auto-detect format → populate bank. Dirty bank prompts first. |
| `bank:save(idx)` / `bank:saveAs(idx)` | ESX: via `rebuildEsxFile()` + export validation/auto-repair (src/esx-validate.js, commit 336d2b6) so patterns/songs are preserved and checked. E2S: write fresh file (format has no checksums). |
| `bank:sampleOp(idx, slot, op, params)` | Single dispatch for all tools: 18 FX, normalize, trim, cut, loop xfade, duplicate, undo, redo. |
| `bank:copySamples(fromIdx, slots[], toIdx, targetSlot?)` | Copy + convert in the main process (details below). |
| `bank:list(idx)`, `bank:waveform(idx, slot)`, `bank:preview(idx, slot)` | Read APIs for the renderer. |

### Device-neutral DSP (the key to feature parity)

All DSP/tool functions are refactored to operate on `(pcm, sampleRate)`
instead of implicitly assuming ESX 44.1 kHz. PCM is PCM — the same effect
code then serves both devices at their native rates. Only load/save/convert
stays device-specific. No hardcoded `44100` may remain in effect code.

## Copy & conversion rules (`bank:copySamples`)

- **Same device** (ESX→ESX, E2S→E2S): PCM + metadata copied 1:1, lossless.
- **ESX→E2S:** resample 44.1→48 kHz (reuse existing cross-device conversion
  code), category defaults to "User", name carried over.
- **E2S→ESX:** resample 48→44.1 kHz. Stereo samples may only land in ESX
  stereo slots (max 128) — slot allocation enforces this automatically.
- **Loop points are always copied.** (ESX keyboard parts go silent without
  `loopStart` — the historical KB1-silence bug class.)
- **Pre-flight check before copying anything:** enough free (and
  type-compatible) slots? ESX sample-memory budget sufficient? If not →
  abort with a clear message; the operation is all-or-nothing, never a
  partial copy.

## Error handling

- **Dirty bank:** prompt on loading another file into that slot and on app
  close.
- **Drop on occupied slot:** overwrite confirm dialog naming both samples.
- **Corrupt/unknown file:** toast, bank state unchanged.
- **ESX save:** always runs through export validation + auto-repair;
  pattern/song data cannot be silently lost.

## Transition plan

1. Build the new SAMPLER tab **alongside** the two existing tabs; old
   `esx:*`/`e2s:*` IPC handlers stay functional during the build.
2. Feature parity confirmed + all tests green + hands-on check in the
   running app.
3. Dedicated cleanup commit: remove the two old tabs, their dead renderer
   code, and old IPC handlers that the new `bank:*` layer fully replaces.

## Testing

All 240+ existing tests must stay green throughout. New coverage:

- **Bank model:** load with auto-detection (.esx, e2sSample.all), copy in
  all four directions, slot allocation (stereo rules, bank-full,
  memory-budget abort), per-sample undo/redo.
- **Device-neutral DSP:** each effect produces consistent results at 44.1
  and 48 kHz; no hardcoded sample rate.
- **Conversion round-trips:** ESX→E2S→ESX preserving loop points and names.
- **ESX rebuild:** pattern/song bytes identical after arbitrary sample
  operations in the bank model.
- Fixtures via existing generators in `tests/fixtures/generators/`.
