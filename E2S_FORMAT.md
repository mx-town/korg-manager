# E2S `e2sSample.all` Format

Reverse-engineered from real Korg Electribe 2 Sampler hardware dumps (a 202-sample
`e2sSample.all`, 17,120,800 bytes). Implemented in `src/e2s-format.js`.

The app's earlier map was **self-consistent but wrong vs hardware** — it round-tripped
with itself (tests passed) yet crashed on, and mis-decoded, real files. Everything
below is validated against the real dump.

## File layout

```
[0x0000 – 0x000F]  16-byte magic:  "e2s sample all" 0x1A 0x00
[0x0010 – 0x0FFF]  Offset table:   510 entries × 8 bytes
[0x1000 …]         Concatenated RIFF WAV data (one WAV per used slot)
```

### Offset table (the crash bug)

- **510 entries**, 8 bytes each → the table is `0x10 … 0x1000`, so **sample data
  begins at offset 0x1000 (4096)**. (The old code assumed 1000 entries / data at
  0x1F50 — wrong.)
- Each entry is **`[uint32LE startOffset, uint32LE endOffset]`** — the second field
  is an **absolute end offset, NOT a length**. Sample length = `endOffset − startOffset`.
  Computing `start + endOffset` overruns the file and was the original crash.
- The **last used slot stores `0` in its end-offset field**. Don't treat that as an
  empty slot — derive the length from the RIFF header instead.
- Empty slots are `(0, 0)`. Entries beyond the used range can be garbage; a robust
  reader skips any entry that isn't a valid in-bounds `RIFF` and never throws.
- **Reader rule:** trust the RIFF header for length (`riffSize + 8`), bounds-check it,
  and use the table only for the start offset. This survives the `endOffset == 0`
  last slot and stray garbage.

## WAV payload

Standard RIFF/WAVE: `fmt ` (PCM, 16-bit LE, mono), a `korg` chunk containing an
`esli` sub-chunk (1172 bytes), and `data` (the PCM). Per-sample `sampleRate` lives in
the `fmt` chunk and varies (samples are not all 48 kHz).

## ESLI metadata block (1172 bytes)

Field offsets **within the esli data** (after the 8-byte `esli` sub-chunk header):

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| 0x00 | u16 | (internal id) | NOT the addressing slot — that is the table position. Leave as-is. |
| 0x02 | char[16] | **name** | ASCII, null-padded. (Old code read 0x04 → dropped first 2 chars.) |
| 0x12 | u16 | **category** | `E2S_CATS` index |
| 0x19 | u8 | **loudness** | 0–127 (drives the app's "boost") |
| 0x20 | u32 | playLogPeriod | playback tuning (rate-derived); best-effort |
| 0x28 | u32 | **startPoint** | in **BYTES** (frame × 2) |
| 0x2C | u32 | **loopStart** | in **BYTES** (frame × 2) |
| 0x30 | u32 | **endPoint** | last frame, in **BYTES** (frame × 2) |
| 0x3C | u32 | **length** | total, in **BYTES** (frame × 2) |
| 0x48 | u32 | **sampleRate** | Hz (old code read 0x30) |

Key points:

- **Sample points are byte offsets (frame × 2).** `parseEsliData` exposes them to the
  rest of the app as **frame counts** (÷2); `buildEsliData` converts back (×2).
- **There is no loop-type byte.** A loop is active iff `loopStart < endPoint`;
  one-shots store `loopStart == endPoint`. `loopType` is derived, not stored. (The
  value that looked like a loop-type enum at 0x2E was just byte 2 of the `loopStart`
  u32 for long samples.)
- **No checksums** — files can be freely written.

## Writing: preserve-and-patch

The 1172-byte block has many fields we have not fully decoded. To stay
hardware-faithful:

- Samples loaded from a real file keep their original block as `esli._raw`.
  `buildEsliData` uses it as the base and patches only known fields, so every
  undocumented per-sample byte is written back **byte-identical**. A load→save of the
  real dump reproduces all 202 ESLI blocks exactly.
- Freshly imported / cross-device-converted samples have no `_raw`, so they start from
  `ESLI_TEMPLATE` — the bytes that are identical across all 202 real samples (structural
  constants) with per-sample fields zeroed and then set.
- `main.js` threads `esli._raw` through `e2sStoredSamples` so preserve-and-patch works
  in the running app, not just in tests.

## Not yet hardware-confirmed

Verified against one real dump (read path fully; write path as a byte-identical
round-trip). Not loaded back onto physical hardware. `playLogPeriod` (tune), the 0x00
id field, and a few constant structural bytes are plausibly mapped but unconfirmed by a
knob-change differential — preserve-and-patch protects them for edited samples; fresh
imports use template defaults there. The writer also repacks samples contiguously
(dropping the original's inter-sample gaps), so a written file is smaller than the
source; valid via the offset table, but worth a throwaway hardware check before trusting
writes broadly.
