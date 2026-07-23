# Roadmap

Forward-looking work for the NBG-GESCHRUBBE Korg Electribe manager. Kept deliberately
lean: build **one small, standalone feature at a time**, additively, and **verify each
step in the running app** — not just `npm test` (the suite covers the binary parsers,
not the Electron UI).

> **Note on "Project S" (Unified Sample Manager):** an attempt to merge the ESX-1 and
> E2S samplers into one dual-file manager was made and then **parked** — it drifted into
> an app-wide redesign and introduced UI regressions. Its code lives only on the branch
> `feat/project-s-dual-bank` (never merged), for reference. The reusable, self-contained
> pieces from it are already on `main` (below).

## Reusable building blocks (already on `main`)

- **`src/bank.js`** (+ `tests/parsers/bank.test.js`, 23 tests) — a pure, Electron-free
  library to **convert/copy samples between ESX-1 and E2S** (44.1↔48 kHz resample, byte
  order, slot allocation, all-or-nothing preflight). Reuse this for any cross-device feature.
- **`esx-pattern-diff.js`** + **`ESX_PATTERN_MAPPING_TESTING.md`** — a byte-diff harness to
  **verify/fix the ESX-1 pattern byte-mapping** against real hardware dumps (change one knob →
  diff → see which byte moved). Independent of everything else.
- **`test-data/e2s/TEST.e2sSample.all`** — a real E2S fixture (5 named samples) for testing
  E2S loading/conversion.

## Candidate features (small, standalone — pick one, spec it tightly, then build)

- **B · Sample Import 2.0** — MP3/FLAC/OGG decode, real AIFF parsing, stereo import,
  higher-quality resampling + optional normalize, read WAV `smpl` loop points.
  Spec: `docs/superpowers/specs/2026-07-21-sample-import-2.0-design.md`
- **C · Import comfort** — OS drag & drop from the file manager, a pre-import info/warning
  dialog (rate/bits/mono-stereo + planned conversion), batch folder import.
  Spec: `docs/superpowers/specs/2026-07-21-import-comfort-design.md`
- **P · E2/E2S patterns in the Pattern Viewer** — full display like EMX, sample names from a
  loaded E2S bank, editable + save back, audio playback.
- **ESX pattern-mapping verification** — use `esx-pattern-diff.js` with hardware dumps to find
  and correct any wrong entries in `src/esx-format.js` + `ESX_FILE_STRUCTURE.md`, with a test
  per fixed knob↔byte relation.
- **E2S save fidelity (format-level, pre-existing)** — `buildE2sAllFile` rebuilds each
  ESLI block from zeros and only writes the ~11 known fields; unknown hardware metadata
  (e.g. slice/marker data past offset 0x34) is lost on every save, slots whose embedded
  WAV the parser can't read are silently dropped (the unified manager now warns on open),
  and stereo E2S samples are flattened to a mono flag. Fix: preserve the raw 1,172-byte
  ESLI block per sample and patch known fields into a copy; keep raw WAV bytes for
  unparseable slots; carry `numChannels`. Needs a real hardware dump with slices/stereo
  to verify against.

## Working agreement (lessons from the parked attempt)

1. **Additive, not redesign.** Don't touch the existing look/flow unless explicitly asked.
2. **One tiny spec, agreed first.** No design marathons; scope stays small.
3. **Verify in the real app each step.** `node --check` + parser tests are necessary but not
   sufficient for UI/main-process changes — a human hands-on check is part of "done".
4. **Prefer fresh sessions per task**, working from `main`.
