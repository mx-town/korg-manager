# Import Comfort (Project C) — Design

**Date:** 2026-07-21
**Status:** Draft (derived from roadmap in the Unified Sample Manager spec,
2026-07-17). Depends on Project S (bank model + import path) and benefits from
Project B (decode/resample) but can ship independently of B for WAV-only.
**Motivation:** Importing is currently one-file-at-a-time through a native
dialog with no preview of what will happen to the sample. Users want to drag
files from the OS, see quality/format info before committing, and import whole
folders at once.

## Scope (Project C)

- **OS drag & drop:** drop audio files from the file manager directly onto a
  bank's sample list (or a slot) → import. Complements S's between-bank drag.
- **Pre-import info/warning dialog:** before writing, show per file: detected
  rate, bit depth, mono/stereo, duration, and **what conversion will happen**
  (e.g. "48→44.1 kHz resample, stereo→mono downmix, quality loss") with a
  confirm/cancel. Applies to single and batch imports.
- **Batch folder import:** pick a folder → import all supported audio files,
  allocating to the next free (type-compatible) slots, with the pre-import
  summary listing every file and its planned conversion.

Out of scope: new codec support itself (Project B — C shows the info B's
decoder provides), pattern work (Project P), UI redesign.

## Architecture

- **Renderer drag & drop:** listen for OS `drop` events on the bank list
  container; read dropped file paths; forward to main via
  `bank:importFiles(idx, paths[], targetSlot?)`. Guard against the
  between-bank internal drag (Project S) vs. an external OS drop.
- **Dry-run inspection:** `bank:inspectImport(idx, paths[]) → [{ file, rate,
  bits, channels, durationSec, plan: {resample?, downmix?, qualityLoss} ,
  targetSlot, warnings[] }]`. Pure analysis, writes nothing — feeds the dialog.
- **Confirm → commit:** the same paths go to `bank:importFiles` only after the
  user confirms. All-or-nothing per the S pre-flight budget/slot check.
- Dialog is a renderer modal reusing the existing cyberpunk modal styling;
  a scrollable per-file table with a summary footer.

## Error handling

- Dropped non-audio / unsupported file → shown in the dialog as skipped with a
  reason, not a hard failure.
- Not enough free/compatible slots or memory → dialog blocks confirm with a
  clear message (reuse S budget check); no partial import.
- Mixed folder (audio + junk) → only supported files listed.

## Testing

- `bank:inspectImport` returns correct plan (resample/downmix/qualityLoss
  flags) for representative inputs without mutating the bank.
- Slot allocation for batch: N files → N next-free compatible slots; stereo
  rules respected; over-budget → blocked.
- Skipped-file reporting: unsupported file in a batch is listed, others proceed.
- Existing 240+ tests stay green. (OS drag & drop itself is exercised manually
  in the running app; the inspect/commit logic is unit-tested.)
