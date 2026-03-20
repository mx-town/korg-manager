# ESX File Structure - Complete Binary Layout

## File Overview

**Total Size:** 26,542,080 bytes (exactly, hardware enforced)  
**Format:** Binary, big-endian (Motorola/network byte order)  
**Magic:** "KORG" at offset 0x00

---

## Memory Map
```
┌─────────────────────────────────────────────────────────────────┐
│ OFFSET       SIZE        SECTION                                │
├─────────────────────────────────────────────────────────────────┤
│ 0x00000000   32 bytes    Main Header ("KORG....ESX")            │
│ 0x00000020   192 bytes   Global Parameters                      │
│ 0x00000200   1,096,320   Pattern Data (256 × 4,280 bytes)       │
│ 0x00130000   33,792      Song Data (64 × 528 bytes)             │
│ 0x00138400   160,000     Song Events (20,000 × 8 bytes)         │
│ 0x001B0000   32 bytes    BPS Header ("KORG....BPS ")            │
│ 0x001B0020   12 bytes    Sample Counters                        │
│ 0x001B0100   10,240      Mono Sample Headers (256 × 40 bytes)   │
│ 0x001B2900   5,632       Stereo Sample Headers (128 × 44 bytes) │
│ 0x001B4200   524,288     Slice Data (256 × 2,048 bytes)         │
│ 0x00250000   ~24MB       PCM Sample Data (variable)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 1: Main Header (0x00000000, 32 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
0x00    4     ASCII       Magic: "KORG"
0x04    4     uint32BE    Version marker: 0x00000071
0x08    4     ASCII       Format: "ESX\0"
0x0C    4     uint32BE    Format version: 0x052679A4 (required by hardware)
0x10    2     uint16BE    Flags: 0x0001 (has data)
0x12    14    bytes       Reserved (zeros)
```

---

## Section 2: Global Parameters (0x00000020, 192 bytes)

### MIDI & System Settings
```
Offset  Size  Type     Description
──────────────────────────────────────────────────────────────
+0x00   1     uint8    Memory protect (0x00 = disabled)
+0x01   1     uint8    Reserved
+0x02   1     uint8    Arpeggiator control (0x00 = NORMAL)
+0x03   1     uint8    Audio in mode (0x00 = MONO)
+0x04   1     uint8    MIDI clock (0x00 = INT)
+0x05   1     uint8    MIDI bitflags (0x0F = note/sysex/cc/pc enabled)
+0x06   1     uint8    Pitch bend range (0x0E = +2 semitones)
```

### MIDI Channel Assignments (16 parts)
```
Offset  Part            Default Value   Description
─────────────────────────────────────────────────────────────────
+0x07   Keyboard 1      0x00            Channel 1 (0x00-0x0F = Ch1-16)
+0x08   Keyboard 2      0x00            Channel 1
+0x09   Drum 1          0x09            Channel 10 (GM drums)
+0x0A   Drum 2          0x09            Channel 10
+0x0B   Drum 3          0x09            Channel 10
+0x0C   Drum 4          0x09            Channel 10
+0x0D   Drum 5          0x09            Channel 10
+0x0E   Drum 6          0x09            Channel 10
+0x0F   Drum 7          0x09            Channel 10
+0x10   Drum 8          0x09            Channel 10
+0x11   Drum 9          0x09            Channel 10
+0x12   Stretch 1       0x09            Channel 10
+0x13   Stretch 2       0x09            Channel 10
+0x14   Slice           0x09            Channel 10
+0x15   Audio In        0x09            Channel 10
+0x16   Accent          0x00            Channel 1
```

### MIDI Note Assignments (13 parts)
```
Offset  Part            MIDI Note   Korg Note   Description
───────────────────────────────────────────────────────────────────
+0x0A   Drum 1          36          C2          Kick/bass drum
+0x0B   Drum 2          38          D2          Snare
+0x0C   Drum 3          40          E2          
+0x0D   Drum 4          41          F2          
+0x0E   Drum 5          43          G2          
+0x0F   Drum 6          42          F#2         
+0x10   Drum 7          46          A#2         
+0x11   Drum 8          49          C#3         
+0x12   Drum 9          51          D#3         
+0x13   Stretch 1       9           A-1         
+0x14   Stretch 2       10          A#-1        
+0x15   Slice           11          B-1         
+0x16   Audio In        12          C0          
```

### MIDI CC Assignments (33 CCs)
```
Offset  CC#   Parameter
─────────────────────────────────────────────
+0x17   89    Mod Speed
+0x18   90    Mod Depth
+0x19   87    Mod Type
+0x1A   88    Mod Dest
+0x1B   82    Mod BPM Sync
+0x1C   74    Cutoff
+0x1D   71    Resonance
+0x1E   79    EG Int
+0x1F   83    Filter Type
+0x20   5     Glide
+0x21   10    Pan
+0x22   75    EG Time
+0x23   7     Level
+0x24   18    Start Point
+0x25   86    Amp EG
+0x26   85    Roll
+0x27   19    Reverse
+0x28   91    Effect Send
+0x29   81    Effect Select
+0x2A   80    Part Motion Seq
+0x2B   12    FX1 Type
+0x2C   92    FX1 Edit1
+0x2D   93    FX1 Edit2
+0x2E   20    FX1 Motion Seq
+0x2F   13    FX2 Type
+0x30   94    FX2 Edit1
+0x31   95    FX2 Edit2
+0x32   21    FX2 Motion Seq
+0x33   24    FX3 Type
+0x34   25    FX3 Edit1
+0x35   26    FX3 Edit2
+0x36   22    FX3 Motion Seq
+0x37   23    FX Chain
```

**Remaining Global Params (+0x38 to +0xBF):** Pattern set params, reserved (zeros)

---

## Section 3: Pattern Data (0x00000200, 1,096,320 bytes)

**Structure:** 256 patterns × 4,280 bytes each

### Single Pattern Layout (4,280 bytes)
```
Offset  Size   Description
──────────────────────────────────────────────────────────────
0       24     Pattern Header
24      306    9 Drum Parts (34 bytes each)
330     274    Keyboard Part 1
604     274    Keyboard Part 2
878     32     Stretch Part 1
910     32     Stretch Part 2
942     32     Slice Part
974     156    Audio In Part
1130    18     Accent Part
1148    12     FX Parameters (3 × 4 bytes)
1160    3120   Motion Sequences (24 × 130 bytes)
```

### Pattern Header (24 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      8     ASCII       Name (space-padded, e.g., "Init    ")
+8      2     uint16BE    Tempo (BPM × 128, e.g., 0x3C00 = 120.0)
+10     1     uint8       Swing (0x00 = 50%)
+11     1     uint8       Flags
+12     1     uint8       FX chain select
+13     1     uint8       Last step (0x00-0x0F = steps 1-16)
+14     1     uint8       Arp flags
+15     1     uint8       Arp center note (MIDI note)
+16     2     uint16BE    Mute status (bitfield, 16 parts)
+18     2     uint16BE    Swing status (bitfield)
+20     2     uint16BE    Output bus status (bitfield)
+22     2     uint16BE    Accent status (bitfield)
```

### Drum Part (34 bytes, 9 parts)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      2     uint16BE    Sample pointer (0-255, or 0x8000 = no sample)
+2      2     uint16BE    Slice number (0x8000 = no slice)
+4      1     uint8       Filter type (0=LPF, 1=HPF, 2=BPF)
+5      1     uint8       Cutoff (0-127)
+6      1     uint8       Resonance (0-127)
+7      1     uint8       EG int (0-127)
+8      1     uint8       Pitch (0-127, 0x40 = center)
+9      1     uint8       Level (0-127)
+10     1     uint8       Pan (0-127, 0x40 = center)
+11     1     uint8       EG time (0-127)
+12     1     uint8       Start point (0-127)
+13     1     uint8       FX flags
+14     1     uint8       Mod flags
+15     1     uint8       Mod speed
+16     1     uint8       Mod depth (0x40 = center)
+17     1     uint8       Motion seq status
+18     16    uint8[]     Step data (0x00 = OFF, non-zero = ON)
```

### Keyboard Part (274 bytes, 2 parts)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      2     uint16BE    Sample pointer
+2      1     uint8       Slice (0xFF = no slice, plays whole sample)
+3      1     uint8       Reserved
+4      1     uint8       Glide
+5-17   13    uint8[]     Same params as drum (filter, cutoff, etc.)
+18     128   uint8[]     Note data (bit 7 = gate flag, bits 0-6 = note)
                          Encoding: 0x3C = C4 ON, 0xBC = C4 OFF
+146    128   uint8[]     Gate time per note (0-127)
```

**Keyboard Note Decoding:**
```
byte & 0x80 = gate flag (0 = ON, 1 = OFF)
byte & 0x7F = MIDI note (0-127)

Examples:
0x3C = 0b00111100 → Note C4 (60), Gate ON
0xBC = 0b10111100 → Note C4 (60), Gate OFF
0x00 = 0b00000000 → Note C-1 (0), Gate ON
0x80 = 0b10000000 → Note C-1 (0), Gate OFF
```

### Stretch/Slice Part (32 bytes, 3 parts)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      2     uint16BE    Sample pointer
+2-15   14    uint8[]     Params (filter, cutoff, pitch, level, etc.)
+16     16    uint8[]     Step data (0x00 = OFF, non-zero = ON)
```

### Audio In Part (156 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0-11   12    uint8[]     Params (filter, cutoff, level, pan, etc.)
+12     16    uint8[]     Step data
+28     128   uint8[]     Gate times
```

### Accent Part (18 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      1     uint8       Level (0-127)
+1      1     uint8       Reserved
+2      16    uint8[]     Step data (INVERTED: 0xFF = OFF, 0x00 = ON)
```

**Accent Decoding (INVERTED LOGIC):**
```
0xFF = Accent OFF (factory default)
0x00 = Accent ON
```

### FX Parameters (12 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      4     uint8[4]    FX1 (type, param1, param2, param3)
+4      4     uint8[4]    FX2
+8      4     uint8[4]    FX3
```

### Motion Sequences (3,120 bytes)

**Structure:** 24 motion sequences × 130 bytes each
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      2     uint16BE    Op number (0xFFFF = disabled)
+2      128   uint8[]     Motion data (128 steps)
```

---

## Section 4: Song Data (0x00130000, 33,792 bytes)

**Structure:** 64 songs × 528 bytes each

### Single Song Layout (528 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      8     ASCII       Song name (space-padded)
+8      2     uint16BE    Tempo (BPM × 128)
+10     1     uint8       Tempo lock (0x00 = disabled)
+11     1     uint8       Length
+12     1     uint8       Mute hold
+13     1     uint8       Next song number (0x00 = OFF)
+14     2     uint16BE    Num song events
+16     512   bytes       Song event data (variable)
```

---

## Section 5: Song Events (0x00138400, 160,000 bytes)

**Structure:** 20,000 events × 8 bytes each
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      4     uint32BE    Event timestamp
+4      1     uint8       Event type
+5      3     uint8[]     Event data (type-dependent)
```

---

## Section 6: BPS Header (0x001B0000, 32 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
0x00    4     ASCII       Magic: "KORG"
0x04    4     uint32BE    Version: 0x00000071
0x08    4     ASCII       Format: "BPS " (note trailing space)
0x0C    4     uint32BE    Checksum (sum of all sample data bytes)
0x10    16    bytes       Reserved (zeros)
```

---

## Section 7: Sample Counters (0x001B0020, 12 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
0x00    4     uint32BE    Number of mono samples (0-256)
0x04    4     uint32BE    Number of stereo samples (0-128)
0x08    4     uint32BE    Current offset (total sample data bytes used)
```

---

## Section 8: Mono Sample Headers (0x001B0100, 10,240 bytes)

**Structure:** 256 sample headers × 40 bytes each

### Mono Sample Header (40 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      8     ASCII       Name (space-padded, 8 chars max)
+8      4     uint32BE    Offset channel 1 start (0xFFFFFFFF = empty)
+12     4     uint32BE    Offset channel 1 end
+16     4     uint32BE    Start frame (0-based)
+20     4     uint32BE    End frame (inclusive)
+24     4     uint32BE    Loop start frame (0xFFFFFFFF = no loop)
+28     4     uint32BE    Sample rate (44100, 22050, or 11025)
+32     2     uint16BE    Sample tune (0x0000 = center)
+34     1     uint8       Play level (0-127)
+35     1     uint8       Stretch step (0xFF = off)
+36     1     uint8       Reserved (0x80 in empty slots)
+37     3     uint8[]     Reserved (zeros)
```

**Empty Slot Marker:**
```
offsetChannel1Start = 0xFFFFFFFF
All other fields = 0 (except byte +36 = 0x80)
Name = 8 spaces (0x20)
```

---

## Section 9: Stereo Sample Headers (0x001B2900, 5,632 bytes)

**Structure:** 128 sample headers × 44 bytes each

### Stereo Sample Header (44 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      8     ASCII       Name (space-padded)
+8      4     uint32BE    Offset channel 1 start (0xFFFFFFFF = empty)
+12     4     uint32BE    Offset channel 1 end
+16     4     uint32BE    Offset channel 2 start (0xFFFFFFFF = empty)
+20     4     uint32BE    Offset channel 2 end
+24     4     uint32BE    Start frame
+28     4     uint32BE    End frame
+32     4     uint32BE    Sample rate
+36     2     uint16BE    Sample tune
+38     1     uint8       Play level
+39     1     uint8       Reserved
+40     1     uint8       Reserved (0x80 in empty slots)
+41     3     uint8[]     Reserved (zeros)
```

---

## Section 10: Slice Data (0x001B4200, 524,288 bytes)

**Structure:** 256 slice blocks × 2,048 bytes each

### Slice Block (2,048 bytes)
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      4     uint32BE    Num slices (0-64)
+4      2044  bytes       Slice point data (variable, 64 slices max)
```

**Slice Point Structure (per slice):**
```
4 bytes: uint32BE start frame
4 bytes: uint32BE end frame
```

---

## Section 11: PCM Sample Data (0x00250000, variable)

**Maximum Size:** ~24MB (0xC00000 × 2 = 25,165,824 bytes)

### Sample Data Block Structure

Each sample is stored as a data block with a 16-byte header:
```
Offset  Size  Type        Description
──────────────────────────────────────────────────────────────
+0      4     bytes       Signature: 0x80007FFF
+4      4     uint32BE    Start offset (relative to section start)
+8      4     uint32BE    End offset (relative to section start)
+12     1     uint8       Sample index (0-255)
+13     1     uint8       Zero
+14     2     uint16BE    0xFFFF
+16     N     int16BE[]   PCM data (16-bit signed big-endian)
```

**PCM Format:**
- **Encoding:** 16-bit signed PCM
- **Byte Order:** Big-endian (Motorola)
- **Channels:** 1 (mono) or 2 (stereo)
- **Sample Rates:** 44100 Hz, 22050 Hz, or 11025 Hz
- **Range:** -32768 to +32767

**Block Alignment:**
- Blocks are aligned to 4-byte boundaries
- Padding added between blocks as needed
- Next block starts at: `((currentOffset + 4) & ~3)`

---

## Key Formulas & Conversions

### Tempo Encoding/Decoding
```javascript
// Encoding
uint16BE_value = BPM × 128

// Decoding
BPM = uint16BE_value / 128

// Examples:
// 120.0 BPM → 0x3C00 (15360)
// 140.5 BPM → 0x4610 (17936)
```

### Sample Duration Calculation
```javascript
duration_seconds = numFrames / sampleRate

// Example:
// 44,100 frames at 44.1kHz = 1.0 second
// 88,200 frames at 44.1kHz = 2.0 seconds
```

### Memory Usage
```javascript
bytes_per_frame = 2 // 16-bit mono
total_bytes = numFrames × 2
max_time = 24MB / (44100 × 2) = ~285 seconds = ~4min 45sec
```

### Checksum Calculation (BPS)
```javascript
let checksum = 0;
for (let i = 0; i < sampleDataLength; i++) {
  checksum = (checksum + buffer[SAMPLE_DATA_START + i]) >>> 0;
}
buffer.writeUInt32BE(checksum, BPS_HEADER + 0x0C);
```

---

## Hardware Constraints

- **File size:** Must be exactly 26,542,080 bytes
- **Magic bytes:** "KORG" at 0x00 and 0x1B0000 required
- **Format version:** 0x052679A4 at 0x0C must match
- **Sample memory:** Max ~24MB PCM data
- **Sample slots:** 256 mono + 128 stereo
- **Patterns:** Exactly 256 (cannot exceed)
- **Songs:** Exactly 64 (cannot exceed)
- **Byte order:** Big-endian throughout

---

## Common Gotchas

1. **Accent Inverted Logic:** 0xFF = OFF (not ON)
2. **Keyboard Gate Bits:** Bit 7 = 0 means ON (not OFF)
3. **Empty Sample Marker:** 0xFFFFFFFF for offsets (not 0x00000000)
4. **Tempo Encoding:** Must multiply/divide by 128
5. **Block Alignment:** 4-byte padding between sample blocks
6. **Checksum:** Sum of all sample data bytes (not including headers)
7. **Fixed File Size:** Always 26,542,080 bytes (hardware checks this)

---

## References

- **Source:** Reverse-engineered from open-electribe-editor and lammas/electribe
- **Hardware:** Korg Electribe ESX-1 sampler
- **File Extension:** `.esx`
- **Created:** 2025-03-02
- **Version:** 1.0