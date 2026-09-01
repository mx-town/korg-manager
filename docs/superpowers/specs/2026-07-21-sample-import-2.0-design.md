# Sample Import 2.0 (Project B) — Design

**Date:** 2026-07-21
**Stand (2026-08-18):** **Grundlage entfallen, Ziele gültig.** Die unten genannte
Voraussetzung — Project S mit dem `bank:*`-Layer — existiert nicht und kommt nicht
(`docs/adr/0002-dateien-als-tabs-statt-zweier-baenke.md`). Fachlich weiterhin gewollt
(`ROADMAP.md:29`): MP3/FLAC/OGG, echtes AIFF, Stereo-Import, besseres Resampling,
`smpl`-Loop-Punkte. **Der Architekturteil ist gegenstandslos** und gegen `file:*` plus
den vorhandenen Import-Pfad (`import-samples`, `import-wav-files`, `import-zip`,
`e2s:import-wav`) neu zu schreiben. Kein Plan vorhanden.
**Status:** Draft (derived from roadmap in the Unified Sample Manager spec,
2026-07-17). Depends on Project S (Unified Sample Manager) being in place —
imports land into a bank via the `bank:*` layer.
**Motivation:** The current import path only handles a narrow set of WAV files.
The load dialog already advertises `.aif`, but the code can't actually parse
AIFF. There is no support for compressed audio, no stereo import into ESX
stereo slots, resampling quality is basic, and WAV loop metadata is ignored.

## Scope (Project B)

- **Compressed decode:** import MP3, FLAC, OGG (Vorbis) in addition to WAV/AIFF.
- **Real AIFF parsing:** honor the dialog's `.aif` promise (AIFF + AIFF-C
  `sowt`/`fl32` common cases); currently unparsed.
- **Stereo import:** stereo source → ESX stereo slot (max 128) or E2S; today
  stereo is downmixed/rejected inconsistently.
- **Higher-quality resampling:** replace naive rate conversion with a windowed
  interpolation (e.g. sinc/linear-phase) for 44.1↔48 kHz and arbitrary input
  rates; optional **normalize** on import.
- **WAV loop points:** read the `smpl` chunk → populate `loopStart`/`loopEnd`
  so imported one-shots carry their loop (prevents the ESX KB-silence class of
  bug where a keyboard part needs a loop point).

Out of scope: OS-level drag & drop and the pre-import info dialog (Project C),
any UI redesign, pattern work (Project P).

## Architecture

- New **decoder layer** `src/audio-decode.js`: `decode(buffer, ext) →
  { pcmFloat, channels, sampleRate }`. One entry point, format detected by
  magic bytes then extension. Pure-JS/WebAudio decoders preferred to avoid
  native deps; heavy formats (MP3/FLAC/OGG) decoded in the main process.
- **Resampler** `src/resample.js`: `resample(pcm, fromRate, toRate) → pcm`.
  Device-neutral (reused by Project S copy/convert). No hardcoded rates.
- Import flow: decode → (optional normalize) → resample to target device rate
  → channel-fit (mono/stereo per target slot) → hand to
  `bank:importSample(idx, slot?, {pcm, meta})`.
- Loop metadata: `parseWavSmpl(buffer) → { loopStart, loopEnd } | null`,
  carried through into the bank sample's `loopStart`/`loopEnd`.

## Error handling

- Unsupported/corrupt file → toast, bank unchanged.
- Sample too long for remaining ESX memory budget → clear abort message
  (reuse S's pre-flight budget check).
- Decode failure on one file in a batch → skip that file, report which.

## Testing

- Decoder: WAV (PCM 16/24, float), AIFF/AIFF-C, MP3, FLAC, OGG fixtures →
  correct channels/rate/length.
- Resampler: 44.1→48 and 48→44.1 round-trip length + no clipping; arbitrary
  rate (22.05k, 96k) → target.
- `smpl`-chunk loop parsing: file with loop → loopStart/End; file without → null.
- Stereo fit: stereo source → ESX stereo slot; mono source unaffected.
- Existing 240+ tests stay green.
