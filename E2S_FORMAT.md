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
  one-shots store `loopStart == endPoint`. `loopType` is derived, not stored.
- **No checksums** — files can be freely written.

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

## Not yet hardware-confirmed

Read path and byte-identical write round-trip are verified against the real
Hacktribe dump. `playLogPeriod` (tune) and a few constant structural bytes are
plausibly mapped but unconfirmed by a knob-change differential —
preserve-and-patch protects them for edited samples. Next hardware test:
write a bank with an appended sample (slot ≥ 501) and confirm it appears on the
device at that number.
