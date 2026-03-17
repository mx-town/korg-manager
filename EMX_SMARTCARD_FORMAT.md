# Korg EMX-1 SmartCard (.emx) Binary Format Specification

Reverse-engineered from 3 real hardware dumps: BEST.EMX (factory), DA4TOFE.EMX, ZRITERLY.EMX.
All files are exactly **1,736,704 bytes** (0x1A8000).

---

## 1. File Structure

```
Offset       Size              Content
──────────────────────────────────────────────────────────
0x000000     512 bytes         File header
0x000200     1,230,336 bytes   256 pattern blocks × 4,806 bytes
0x12C800     505,856 bytes     Song data + global params + tail
──────────────────────────────────────────────────────────
Total:       1,736,704 bytes
```

### 1.1 File Header (512 bytes)

```
Offset  Size  Field            Value (BEST.EMX)           Notes
──────────────────────────────────────────────────────────────────
0x000   4     Magic            "KORG" (4B 4F 52 47)      Same across all files
0x004   4     Version          0x00000069                 Same across all files
0x008   4     Type             "EMX\0"                    Format identifier
0x00C   4     Checksum/Serial  varies per file            BEST: 9F86A0BA, DA4TO: 7E80F5AF
0x010   4     Flags            varies per file            BEST: 00010000, DA4TO: 00020001
0x014   12    Reserved         all zeros
0x020   96    Global tables    varies (osc/wave maps)     133 byte differences between files
0x080   96    Character map    BEST: ASCII 0x20-0x7F      DA4TOFE: all 0xFF
0x0E0   288   Reserved/padding
```

**Format detection**: Check `magic == "KORG"` AND `type == "EMX"` AND `size == 1,736,704`.

---

## 2. Pattern Block (4,806 bytes)

Each pattern starts at `0x200 + index × 4806`. There are 256 patterns (A01-P16).

### 2.1 Pattern Header (24 bytes: +0x00 to +0x17)

| Offset | Size | Field | Type | Encoding | Evidence |
|--------|------|-------|------|----------|----------|
| +0x00 | 8 | **Name** | char[8] | ASCII, space-padded (0x20) | CONFIRMED — all 344 patterns |
| +0x08 | 2 | **Tempo** | uint16BE | BPM = value / 128 (0.5 BPM resolution) | CONFIRMED — all 256 factory presets match manual |
| +0x0A | 1 | **Swing** | uint8 | 0-25 (0 = no swing) | HIGH — default 0 |
| +0x0B | 1 | **Bitfield** | bitfield | See below | CONFIRMED |
| +0x0C | 1 | **Beat** | uint8 | 0=16th, 1=32nd, 2=8tri, 3=16tri | CONFIRMED |
| +0x0D | 1 | **Last Step** | uint8 | 0-based (0x0F = 16 steps) | CONFIRMED |
| +0x0E | 1 | **FX Types** | packed nibbles | hi=FX1 type, lo=FX2 type (0-15) | HIGH |
| +0x0F | 1 | **Accent/FX3** | uint8 | Accent level or FX3 type + param | MEDIUM |
| +0x10 | 2 | **Mute Status** | uint16BE | Bitmask: bit=1 → part muted | HIGH |
| +0x12 | 2 | **Motion Seq Status** | uint16BE | Bitmask: bit=1 → motion enabled | MEDIUM |
| +0x14 | 2 | **Swing Status** | uint16BE | Always 0x3FFF | MEDIUM |
| +0x16 | 2 | **Output Bus** | uint16BE | Bitmask: per-part routing | MEDIUM |

**Byte +0x0B bitfield decomposition:**
```
Bit 7     [UNCONFIRMED] Unknown flag (rarely set)
Bits 6-5  FX Chain mode: 0=parallel, 1=FX1→FX2, 2=FX2→FX3, 3=serial
Bits 4-3  Roll Type: 0=2×, 1=3×, 2=4×
Bits 2-0  Pattern Length: bars = value + 1 (range 1-8)
```

### 2.2 Part Data (234 bytes: +0x18 to +0x101)

**9 parts × 26 bytes** (10 param bytes + 16 step trigger bytes).

| Part | Type | Start | End | Evidence |
|------|------|-------|-----|----------|
| Synth 1 | synth | +0x018 | +0x031 | CONFIRMED — pan byte at +0x19 is 0x40 (29/30 patterns) |
| Synth 2 | synth | +0x032 | +0x04B | CONFIRMED |
| Synth 3 | synth | +0x04C | +0x065 | CONFIRMED |
| Synth 4 | synth | +0x066 | +0x07F | CONFIRMED |
| Synth 5 | synth | +0x080 | +0x099 | CONFIRMED |
| Drum 1 (6A/6B) | drum | +0x09A | +0x0B3 | CONFIRMED |
| Drum 2 (7A/7B) | drum | +0x0B4 | +0x0CD | CONFIRMED |
| Drum 3 (8A/8B) | drum | +0x0CE | +0x0E7 | CONFIRMED |
| Drum 4 (9A/9B) | drum | +0x0E8 | +0x101 | CONFIRMED |

### 2.3 Per-Part Layout (26 bytes)

Each part block is structured identically:

```
Offset  Size  Field              Evidence
───────────────────────────────────────────
+0      1     OscType/SamplePtr  Synth: 0x00-0x0F range; Drum: higher ROM PCM indices
+1      1     Pan                Mode 0x40 (center) across 70%+ of patterns
+2      1     Level              High values (0x7F = 127 common) for active parts
+3      1     FilterCutoff       Mode ~0x40; wide range 0x00-0x7F
+4      1     FilterRes/EG       Wide range
+5      1     ModType/Depth      Low values dominant (0x00-0x14)
+6      1     FilterType         Values: 0x00, 0x20, 0x40, 0x44, 0xC0, 0xC4
+7      1     EG/Pitch           Wide range
+8      1     Pitch/Glide        Wide range
+9      1     FxSend/Roll        Almost always 0x00 (0 or 1)
+10     16    Step triggers      128 steps bit-packed into 16 bytes (1 bit/step)
───────────────────────────────────────────
Total: 26 bytes
```

**Step trigger encoding**: 128 steps packed MSB-first into 16 bytes.
Each bit = one step (1 = active trigger, 0 = no trigger).
Byte 0 bits 7-0 = steps 0-7, Byte 1 = steps 8-15, etc.

### 2.4 Extended Data Area (+0x102 to ~+0x667)

~1,381 bytes containing:

1. **Accent/FX parameters** (~20 bytes at +0x102): Contains FX edit parameters and accent part settings. Consistent `0x32` byte found at +0x43F across all patterns.

2. **Keyboard note sequences** (~640 bytes): Per-step note data for synth parts (5 parts × 128 steps). Default value 0xBC = no note/sustain. Non-0xBC values encode pitch.

3. **Additional part parameters**: Extended synth/drum parameters not in the 10-byte basic block.

4. **Accent step triggers** (at ~+0x666): Two 16-byte blocks for accent step data, preceded by a level byte.

[UNCONFIRMED] Exact boundaries between sub-sections need further analysis.

### 2.5 Motion Sequence Area (+0x668 to +0x12C5)

**~3,165 bytes** for 24 motion sequence slots.

- **Default value**: 0x80 (center/neutral for parameter automation)
- **Active sequences**: Non-0x80 values represent per-step parameter changes
- **FFFF marker**: Always present at +0x1244-0x1245 (structural end marker)
- **Start offset varies**: Depending on how many motion sequences are recorded:
  - Simple patterns: first 0x80 block at +0x698
  - Complex patterns (Minimal1): first 0x80 block at +0xD32
- **Unused tail**: All 0x80 from end of active sequences to pattern end

### 2.6 FX Type Reference

| Index | Effect Type |
|-------|------------|
| 0 | Reverb |
| 1 | BPM Sync Delay |
| 2 | Short Delay |
| 3 | Mod Delay |
| 4 | Grain Shifter |
| 5 | Chorus/Flanger |
| 6 | Phaser |
| 7 | Ring Modulator |
| 8 | Distortion |
| 9 | Decimator |
| 10 | EQ |
| 11 | Comp/Limiter |
| 12-15 | [UNCONFIRMED] |

---

## 3. Post-Pattern Area (0x12C800 to 0x1A8000)

505,856 bytes containing song data and global parameters.

- **BEST.EMX**: Substantial non-zero data (factory songs)
- **ZRITERLY.EMX**: Mostly zeros with sparse non-zero bytes (no songs)
- **Structure**: [UNCONFIRMED] Likely 64 songs × ~7,900 bytes each

---

## 4. SysEx vs SmartCard Relationship

### Different representations of the same data

| Property | SysEx Dump | SmartCard |
|----------|-----------|-----------|
| File size | 1,728,000 | 1,736,704 |
| Header size | 288 bytes | 512 bytes |
| Pattern stride | 6,750 bytes | 4,806 bytes |
| Pattern start | 0x000120 | 0x000200 |
| Num patterns | 256 | 256 |
| Song data | Included in 6750/pat | Separate post-pattern area |

### Key insight
The formats are **NOT simple 7-bit/8-bit transforms** of each other:
- 4806 × 8/7 = 5,492 ≠ 6,750
- 6750 × 7/8 = 5,906 ≠ 4,806

The SysEx pattern size (6,750 bytes) likely includes song/global data that the SmartCard format stores in a separate post-pattern area. The per-pattern data layout also differs between formats — SysEx uses Korg-specific framing within each pattern block.

**Implication**: SysEx field offsets from the existing parser CANNOT be directly used for SmartCard parsing. A dedicated SmartCard parser is required.

---

## 5. Summary for Parser Implementation

### Minimum viable SmartCard parser needs:

```javascript
const SMARTCARD = {
  DUMP_SIZE:     1736704,
  HEADER_SIZE:   512,
  PATTERN_SIZE:  4806,
  PATTERN_DATA:  0x000200,
  NUM_PATTERNS:  256,
};

// Pattern header offsets (within each 4806-byte block)
const SC_PAT = {
  NAME:       0x00,    // char[8]
  TEMPO:      0x08,    // uint16BE / 128 = BPM
  SWING:      0x0A,    // uint8, 0-25
  LENGTH_ETC: 0x0B,    // bitfield: [7]=flag, [6:5]=fxChain, [4:3]=roll, [2:0]=bars-1
  BEAT:       0x0C,    // uint8, 0-3
  LAST_STEP:  0x0D,    // uint8, 0-based
  FX_TYPES:   0x0E,    // packed nibbles: hi=FX1, lo=FX2
  ACCENT_LVL: 0x0F,    // uint8
  MUTE_STAT:  0x10,    // uint16BE bitmask
  MOTION_STAT:0x12,    // uint16BE
  SWING_STAT: 0x14,    // uint16BE (always 0x3FFF)
  BUS_STAT:   0x16,    // uint16BE
};

// Part data starts at +0x18, 9 parts × 26 bytes
const SC_PART_START = 0x18;
const SC_PART_SIZE  = 26;   // 10 params + 16 step bytes
const SC_PART_PARAMS = 10;
const SC_STEP_BYTES  = 16;  // 128 steps bit-packed

// Per-part param offsets (within 10-byte param block)
const SC_PART = {
  OSC_TYPE:   0,  // or sample pointer for drums
  PAN:        1,  // 0x40 = center
  LEVEL:      2,  // 0-127
  CUTOFF:     3,  // filter cutoff
  RESONANCE:  4,  // filter resonance/EG
  MOD:        5,  // mod type/depth
  FILT_TYPE:  6,  // filter type
  EG:         7,  // EG/pitch
  PITCH:      8,  // pitch/glide
  FX_SEND:    9,  // FX send/roll
};
```

### Format detection:
```javascript
function isEmxSmartCard(buf) {
  return buf.length === 1736704 &&
         buf.toString('ascii', 0, 4) === 'KORG' &&
         buf.toString('ascii', 8, 11) === 'EMX';
}
```
