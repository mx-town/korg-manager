# ESX Export Validation — Design

**Date:** 2026-07-15
**Stand (2026-08-18):** **Umgesetzt, mit einer bewussten Abweichung.** `src/esx-validate.js`
ist in beiden Export-Handlern verdrahtet (`main.js:371`, `:399`), 17 Tests.
**Der `SIZE`-Check unten ist widerlegt:** .esx-Dateien sind variabel groß
(`0x250010 + currentOffset`), nicht fix 26.542.080 — `src/esx-validate.js:34-70` prüft
richtig, der Spec-Text nicht. Ebenso `CHANNEL`: der Code verlangt
`ch1End > ch1Start + 16`. Herkunft der Fehlannahme: `CODE_REVIEW_BETA.md`, CRITICAL #1
(27.03.), korrigiert durch `09bc6bf`. Kein Plan vorhanden.
**Status:** Approved (AskUserQuestion: "Auto-fix + report", scope "Samples + file integrity")
**Motivation:** The KB1-silence bug shipped because `rebuildEsxFile()` wrote
`loopStart = 0xFFFFFFFF` into sample headers — the file looked fine but keyboard
parts were silent on hardware. Every export should be checked for this class of
error *before* the file hits disk, with safe issues auto-repaired and everything
reported to the user.

## Behavior

New module `src/esx-validate.js` exporting:

```js
validateAndRepairEsx(buffer) → { buffer, issues }
```

- `buffer` — the (possibly repaired) full ESX file buffer. If no fixes were
  needed it is byte-identical to the input.
- `issues` — array of `{ severity, code, message, sampleIndex?, sampleName? }`
  - `severity: 'fixed'` — problem found and auto-repaired in the returned buffer
  - `severity: 'warning'` — problem found but NOT safely fixable; flagged only

A clean file returns `issues: []` and an unmodified buffer.

## Checks

### File integrity — flag-only (warnings, never modified)

| Code | Check |
|------|-------|
| `SIZE` | File length must be exactly 26,542,080 bytes (`ESX_FILE_SIZE`) |
| `MAGIC_ESX` | Bytes 0–3 = "KORG", 8–10 = "ESX" |
| `MAGIC_BPS` | 0x1B0000–3 = "KORG", 0x1B0008–11 = "BPS " |
| `COUNT` | `numMono ≤ 256`, `numStereo ≤ 128` (garbage counters are flagged, iteration clamped) |
| `CHANNEL` | Per sample: `ch1End > ch1Start` and `ch1End ≤ currentOffset` — pointers into PCM we cannot reconstruct |

### Per-sample header — auto-fix (mono headers `0 … numMono-1` at 0x1B0100, 40 B each)

Checked in this order (frame fixes first so the loop check compares against
corrected values):

| Code | Check | Fix |
|------|-------|-----|
| `FRAMES` | `endFrame` must equal `(ch1End − ch1Start − 16)/2 − 1` (16 = per-block header); `startFrame ≤ endFrame` | Rewrite `endFrame` (+20); reset `startFrame` (+16) to 0 if out of range |
| `LOOP` | `loopStart` (+24) must not be `0xFFFFFFFF` and must be `≤ endFrame` — **the KB1 silence bug** | Set `loopStart = endFrame` |
| `RATE` | `sampleRate` (+28) must be sane: not 0, not > 192000. Legit nonstandard rates are left alone | Set to 44100 only if 0/absurd |
| `TRAILER` | Bytes +35…+39 must be `00 80 00 00 00` (hardware-saved trailer) | Rewrite trailer |
| `BLOCK` | PCM block header at `0x250000 + ch1Start`: signature `80 00 7F FF`, start/end offsets, index byte | Rewrite deterministic block-header fields (only if `CHANNEL` passed) |

### File integrity — auto-fix (last, after any PCM-region fixes)

| Code | Check | Fix |
|------|-------|-----|
| `OFFSET` | `CURRENT_OFFSET` (0x1B0028) must be ≥ last sample's aligned `ch1End` | Recompute |
| `CHECKSUM` | BPS checksum (0x1B000C) = byte-sum of `[0x250000, 0x250000 + currentOffset)` | Recompute |

## Wiring (main.js)

Both export handlers (`save-esx-overwrite` ~L314, `save-esx-file` ~L340):

```
building 10% → build buffer
verifying 50% → validateAndRepairEsx(buf)   ← replaces the current no-op phase
writing 80%  → write the *repaired* buffer
done 100%    → return { filePath, size, validation: issues }
```

`save-esx-overwrite` must store the repaired buffer into `esxOriginalBuffer`.

## Renderer report (src/index.html)

- `issues.length === 0` → existing success status, suffixed "· verified"
- fixed issues → status/report: "N issue(s) auto-fixed" with the list
- warnings → shown prominently (file may not load on hardware)

Kept minimal: reuse the existing export-status UI, no new modal framework.

## Tests (`tests/parsers/esx-validate.test.js`)

Build a valid file with `buildEsxFile()`, corrupt specific bytes, assert:
1. Clean file → `issues: []`, output byte-identical
2. `loopStart = 0xFFFFFFFF` → `LOOP` fixed to endFrame
3. `loopStart > endFrame` → fixed
4. Wrong trailer (old app wrote `FF` at +35) → `TRAILER` fixed
5. `sampleRate = 0` → fixed to 44100; 32000 left alone
6. Corrupt `endFrame` → `FRAMES` fixed from byte span
7. Corrupt checksum → `CHECKSUM` recomputed
8. Truncated file → `SIZE` warning, no crash
9. Corrupt magic → `MAGIC_*` warning
10. Repaired file re-validated → `issues: []` (idempotent)
