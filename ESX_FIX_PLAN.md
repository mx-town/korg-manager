# ESX Export — Fix Plan (2026-07-28)

**Status: all six fixes implemented. 331/331 tests pass (16 new regression tests).**

Verified by round-tripping all four reference files through `rebuildEsxFile`:

| File | In | Out | Audio lost |
|------|-----|-----|------------|
| ESX-Factory-Data.esx | 20,721,848 | 20,721,848 | 0 / 200 |
| FANGEL2.ESX | 26,683,908 | 26,683,908 | 0 / 146 |
| Chronic-Interactive.esx | 8,537,724 | 8,537,724 | 0 / 100 (+ 40 stereo kept) |
| ES1-Factory-Data.esx | 4,518,448 | 4,518,448 | 0 / 54 |

Every file now comes back at exactly its original size — before these fixes the first
was inflated by 5.8 MB, the second truncated by 141,812 bytes, and the third lost all
40 stereo samples.


Audit of `src/esx-format.js` against **4 real .esx files** downloaded from the web
(not repo test-data, which may already be korg-manager output) plus Korg's official
MIDI implementation chart (`ESX1midiimp.txt`, TABLE13/26/27/28).

Reference files used:
| File | Size | Contents |
|------|------|----------|
| ESX-Factory-Data.esx | 20,721,848 | 200 mono |
| FANGEL2.ESX | 26,683,908 | 146 mono (hardware-saved, fragmented) |
| Chronic-Interactive.esx | 8,537,724 | 100 mono + 40 stereo |
| ES1-Factory-Data.esx | 4,518,448 | 54 mono |

---

## Verified NOT broken (do not "fix" these)

- **MIDI globals in export.** `createEmptyEsx` output is byte-identical to the factory
  file across GP+0x00..+0x37. `rebuildEsxFile` preserves globals/patterns/songs with
  **0 differing bytes**. There is no MIDI corruption in exported files.
- **Block alignment padding.** `(currentOffset + 4) & ~3` reproduces 194/200 real start
  offsets; `(off + 3) & ~3` only 91/200. The existing formula is correct — the rule is
  "advance to the next 4-byte boundary, and if already aligned advance a full 4 bytes".
- **PCM audio integrity.** All 200 sample payloads survive a save round-trip bit-exact.

---

## Fix 1 — File size is not fixed  *(data loss)*

`ESX_FILE_SIZE = 26,542,080` is commented "hardware-required fixed file size". It is not.
Verified on all 4 files, exactly:

```
filesize = 0x250010 + currentOffset(@0x1B0028)
```

**Impact:** files whose sample data exceeds 24,117,248 bytes are silently truncated.
FANGEL2.ESX loses 141,812 bytes and 1 sample on save. Smaller files are padded with up
to ~6 MB of zeros for nothing.

**Fix:** size the output buffer from the packed sample data instead of the constant.
Keep the constant only as a capacity ceiling, and throw a clear error on overflow rather
than truncating.

## Fix 2 — Stereo samples are destroyed  *(data loss)*

`rebuildEsxFile` and `buildEsxFile` iterate only `monoSamples` and hardcode
`writeUInt32BE(0, ADDR.NUM_STEREO_SAMPLES)`. Chronic-Interactive.esx loses all 40 stereo
samples on save.

**Fix:** carry stereo samples through, write the stereo header table at
`ADDR.SAMPLE_HDR_STEREO` (128 × 44 bytes) and the real stereo count.

## Fix 3 — Slice data is wiped  *(data loss)*

`headerBuffer.fill(0, ADDR.SLICE_DATA, ADDR.SAMPLE_DATA)` clears the whole slice region.
The factory file carries 9,256 non-zero bytes there; after save it is 0.

**Fix:** in `rebuildEsxFile`, keep the original slice region (it was already copied from
the source buffer) instead of zeroing it. Only clear slots whose sample was removed.

## Fix 4 — `createEmptyEsx` overlapping writes  *(latent)*

Lines ~538-553 write 16 MIDI channel bytes to GP+0x07..+0x16, then the `partNotes` loop
overwrites GP+0x0A..+0x16 with note numbers. Output happens to be correct, but the dead
writes encode a wrong mental model.

**Fix:** write only the 3 channel bytes Korg documents, then the 13 note numbers.
Also populate Pattern Set Parameters (GP+0x40..+0xBF), currently all zeros vs. a
populated factory table.

## Fix 5 — Documentation  *(explicitly requested)*

`ESX_FILE_STRUCTURE.md` §2 claims **16** "MIDI Channel Assignments" at +0x07..+0x16.
That table is fiction and overlaps the note-number table. Korg TABLE13 is authoritative:

```
 7~9    MIDI Channel (3 bytes)  -> Keyboard1, Keyboard2, Drum/Stretch/Slice/AudioIn
10~22   Drum Note Number (13 bytes)
23~55   MIDI CC Assign (33 bytes)
56~63   reserved
64~191  Pattern Set Parameters (128 bytes)
```

**Fix:** correct §2, document the file-size formula and the padding rule.

## Fix 6 — Surface the global MIDI settings  *(the user's actual problem)*

The app reads, displays and edits **nothing** in the global parameter block. A user whose
`.esx` carries bad MIDI globals has no way to see or repair it — and since loading an
`.esx` overwrites the device's global settings, every load re-breaks a hand-fixed device.

**Design constraint (important):** never write these bytes silently. Hardcoding channels
would break every user who wires MIDI differently. Preserve by default; change only what
the user explicitly edits.

**Implemented:**
- `parseGlobalParams` / `validateGlobalParams` / `writeGlobalParams` / `findEmxChannelCollisions`
- IPC `esx:get-global-params` + `esx:set-global-params`, bridged in `preload.js`
- A **MIDI GLOBALS** modal in the ESX sidebar: three channel selects, thirteen drum-note
  inputs, a read-only block (clock / bend / filters), changed controls highlighted, and
  an EMX-1 collision warning. `writeGlobalParams` patches only fields that actually
  differ — applying a channel change touches exactly one byte of the file.

### Known collision case this exists to catch

EMX-1 factory channels (owner's manual p.79) are Synth 1-5 on Ch.1-5 and Drum 1-7B on
Ch.10. A factory ESX sits on Ch.1 / Ch.2 / Ch.10 — all three collide. Moving "the" MIDI
channel in the ESX global menu only edits **Keyboard 1**, leaving Keyboard 2 on Ch.2 and
the entire drum section on Ch.10. Free channels for the ESX: **6-9 and 11-16**.
