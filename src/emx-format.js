/**
 * EMX Format Parser (READ-ONLY)
 * Parses Korg Electribe EMX-1 memory dump files.
 * Supports two formats:
 *   - SysEx dump:   1,728,000 bytes (MIDI data dump)
 *   - SmartCard:    1,736,704 bytes (hardware SmartCard .emx)
 *
 * SysEx dump layout (1,728,000 bytes = 0x1A5E00):
 *   [0x000000 – 0x00001F]  Header (32 bytes)
 *   [0x000020 – 0x00011F]  Global parameters (256 bytes)
 *   [0x000120 – 0x19DFFF]  256 patterns × 6750 bytes each
 *   [0x19E000 – 0x1A5DFF]  Song data, etc.
 *
 * SmartCard layout (1,736,704 bytes = 0x1A8000):
 *   [0x000000 – 0x0001FF]  File header (512 bytes)
 *   [0x000200 – 0x12C7FF]  256 patterns × 4806 bytes each
 *   [0x12C800 – 0x1A7FFF]  Song data + global params
 */

'use strict';

// ── Constants ──────────────────────────────────────────────

// Legacy top-level constants (SysEx format — kept for backward compat)
const DUMP_SIZE          = 1728000;     // 0x1A5E00
const NUM_PATTERNS       = 256;

const ADDR = {
  HEADER:          0x000000,
  GLOBAL_PARAMS:   0x000020,
  PATTERN_DATA:    0x000120,
};

const HEADER_SIZE        = 32;
const GLOBAL_PARAMS_SIZE = 256;
const PATTERN_SIZE       = 6750;       // SysEx: (DUMP_SIZE - HEADER_SIZE - GLOBAL_PARAMS_SIZE - tail) / 256

const NUM_SYNTH_PARTS    = 5;
const NUM_DRUM_PARTS     = 4;
const NUM_TOTAL_PARTS    = NUM_SYNTH_PARTS + NUM_DRUM_PARTS + 1; // +1 for accent
const NUM_STEPS          = 16;         // EMX uses 16-step patterns (repeatable)
const NAME_LEN           = 8;

// ── SmartCard format constants ────────────────────────────

const SMARTCARD = {
  DUMP_SIZE:       1736704,    // 0x1A8000
  HEADER_SIZE:     512,        // 0x200
  PATTERN_SIZE:    4806,
  PATTERN_DATA:    0x000200,
  NUM_PATTERNS:    256,
  SONG_DATA:       0x12C800,   // post-pattern area
};

// SmartCard pattern header offsets (24 bytes, within each 4806-byte block)
const SC_PAT = {
  NAME:            0x00,       // char[8], ASCII space-padded
  TEMPO:           0x08,       // uint16BE, BPM = value / 128
  SWING:           0x0A,       // uint8, 0-25
  LENGTH_ETC:      0x0B,       // bitfield: [7]=flag, [6:5]=fxChain, [4:3]=roll, [2:0]=bars-1
  BEAT:            0x0C,       // uint8, 0=16th, 1=32nd, 2=8tri, 3=16tri
  LAST_STEP:       0x0D,       // uint8, 0-based (0x0F = 16 steps)
  FX_TYPES:        0x0E,       // packed nibbles: hi=FX1, lo=FX2
  ACCENT_LVL:      0x0F,       // uint8
  MUTE_STATUS:     0x10,       // uint16BE bitmask
  MOTION_SEQ_STAT: 0x12,       // uint16BE
  SWING_STATUS:    0x14,       // uint16BE (always 0x3FFF)
  BUS_STATUS:      0x16,       // uint16BE
};

const SC_PAT_HEADER_SIZE = 24; // 0x18

// SmartCard per-part layout: 9 parts × 26 bytes (10 params + 16 step bytes)
const SC_NUM_PARTS       = 9;  // 5 synth + 4 drum
const SC_PART_SIZE       = 26;
const SC_PART_PARAMS     = 10;
const SC_STEP_BYTES      = 16; // 128 steps bit-packed

const SC_PART_START      = 0x18; // first part offset within pattern

// SmartCard per-part parameter offsets (within 10-byte param block)
const SC_PART = {
  OSC_TYPE:        0,          // synth: 0x00-0x0F; drum: ROM PCM index
  PAN:             1,          // 0x40 = center
  LEVEL:           2,          // 0-127
  CUTOFF:          3,          // filter cutoff
  RESONANCE:       4,          // filter resonance/EG
  MOD:             5,          // mod type/depth
  FILT_TYPE:       6,          // filter type
  EG:              7,          // EG/pitch
  PITCH:           8,          // pitch/glide
  FX_SEND:         9,          // FX send/roll
};

// EMX SysEx constants
const SYSEX = {
  KORG_ID:         0x42,              // Korg manufacturer ID
  EMX_DEVICE_ID:   0x50,              // EMX-1 device
  HEADER_BYTE:     0xF0,
  END_BYTE:        0xF7,
  DUMP_REQUEST:    0x10,              // Data dump request
  DUMP_DATA:       0x4C,              // Data dump
  WRITE_REQUEST:   0x11,              // Write request
  GLOBAL_CHANNEL:  0x30,              // + channel (0-15)
};

// Pattern header offsets (within each 6750-byte pattern block)
const PAT = {
  NAME:            0x0000,            // char[8] – ASCII name
  TEMPO:           0x0008,            // uint16BE – BPM × 10 (EMX is big-endian)
  SWING:           0x000A,            // uint8 – 0-127
  LENGTH:          0x000B,            // uint8 – pattern length
  BEAT:            0x000C,            // uint8 – beat setting
  ROLL_TYPE:       0x000D,            // uint8
  FX_CHAIN:        0x000E,            // uint8
  LAST_STEP:       0x000F,            // uint8 – last step (0-15)
  ACCENT_STATUS:   0x0010,            // uint16BE – accent bit flags
  MUTE_STATUS:     0x0012,            // uint16BE – mute bit flags
  SWING_STATUS:    0x0014,            // uint16BE – per-part swing flags
  MOTION_SEQ_STAT: 0x0016,            // uint16BE – motion seq enable flags
  // 0x0018 – 0x001F: reserved
};

const PAT_HEADER_SIZE = 32;

// Synth part layout (within pattern, after header)
// Each synth part is ~600 bytes (params + motion + steps)
const SYNTH_PART_SIZE = 600;

// Drum part layout
// Each drum part is ~150 bytes
const DRUM_PART_SIZE  = 150;

// Accent part
const ACCENT_PART_SIZE = 100;

// Synth part parameter offsets (relative to synth part start)
const SYNTH = {
  SAMPLE_PTR:    0x00,   // uint16BE – sample/osc pointer
  OSC_TYPE:      0x02,   // uint8
  OSC_EDIT1:     0x03,   // uint8
  OSC_EDIT2:     0x04,   // uint8
  FILTER_TYPE:   0x05,   // uint8
  FILTER_CUTOFF: 0x06,   // uint8 – 0-127
  FILTER_RES:    0x07,   // uint8
  FILTER_EG:     0x08,   // uint8
  MOD_TYPE:      0x09,   // uint8
  MOD_SPEED:     0x0A,   // uint8
  MOD_DEPTH:     0x0B,   // uint8
  EG_ATTACK:     0x0C,   // uint8
  EG_DECAY:      0x0D,   // uint8
  PITCH:         0x0E,   // uint8
  GLIDE:         0x0F,   // uint8
  LEVEL:         0x10,   // uint8
  PAN:           0x11,   // uint8
  AMP_EG:        0x12,   // uint8
  ROLL:          0x13,   // uint8
  FX_SEND:       0x14,   // uint8
  // Steps: 16 × 8 bytes each, starting after params
  PARAMS_SIZE:   0x20,   // 32 bytes of params before step data
};

// Drum part parameter offsets
const DRUM = {
  SAMPLE_PTR:    0x00,   // uint16BE – sample pointer
  FILTER_TYPE:   0x02,   // uint8
  FILTER_CUTOFF: 0x03,   // uint8
  FILTER_RES:    0x04,   // uint8
  FILTER_EG:     0x05,   // uint8
  PITCH:         0x06,   // uint8
  LEVEL:         0x07,   // uint8
  PAN:           0x08,   // uint8
  EG_TIME:       0x09,   // uint8
  FX_SEND:       0x0A,   // uint8
  MOD_TYPE:      0x0B,   // uint8
  MOD_SPEED:     0x0C,   // uint8
  MOD_DEPTH:     0x0D,   // uint8
  ROLL:          0x0E,   // uint8
  PARAMS_SIZE:   0x10,   // 16 bytes of params before step data
};

// ── SysEx 7-bit pack / unpack ─────────────────────────────

/**
 * Pack 8-bit data into 7-bit MIDI SysEx format.
 * Every 7 input bytes → 8 output bytes (flag byte + 7 data bytes with MSB cleared).
 *
 * @param {Buffer} data – 8-bit binary data
 * @returns {Buffer} 7-bit packed data
 */
function sysexPack7bit(data) {
  const groups = Math.ceil(data.length / 7);
  const out = Buffer.alloc(groups * 8);
  let outPos = 0;

  for (let g = 0; g < groups; g++) {
    const srcOff = g * 7;
    const count  = Math.min(7, data.length - srcOff);
    let flagByte = 0;

    // Build flag byte from MSBs
    for (let i = 0; i < count; i++) {
      if (data[srcOff + i] & 0x80) {
        flagByte |= (1 << i);
      }
    }

    out[outPos++] = flagByte;
    for (let i = 0; i < 7; i++) {
      out[outPos++] = i < count ? (data[srcOff + i] & 0x7F) : 0x00;
    }
  }

  return out.slice(0, outPos);
}

/**
 * Unpack 7-bit MIDI SysEx data back to 8-bit.
 * Every 8 input bytes → 7 output bytes.
 *
 * @param {Buffer} packed – 7-bit packed data
 * @param {number} [expectedLen] – expected output length (truncates padding)
 * @returns {Buffer} 8-bit binary data
 */
function sysexUnpack7bit(packed, expectedLen) {
  const groups = Math.floor(packed.length / 8);
  const out = Buffer.alloc(groups * 7);
  let outPos = 0;

  for (let g = 0; g < groups; g++) {
    const srcOff   = g * 8;
    const flagByte = packed[srcOff];

    for (let i = 0; i < 7; i++) {
      let byte = packed[srcOff + 1 + i];
      if (flagByte & (1 << i)) {
        byte |= 0x80;
      }
      out[outPos++] = byte;
    }
  }

  if (expectedLen && expectedLen < out.length) {
    return out.slice(0, expectedLen);
  }
  return out.slice(0, outPos);
}

// ── Format detection ──────────────────────────────────────

/**
 * Detect which EMX dump format a buffer is.
 * @param {Buffer} buf
 * @returns {'smartcard'|'sysex'|null}
 */
function detectEmxFormat(buf) {
  if (!buf || buf.length < 512) return null;
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'KORG') return null;

  if (buf.length === SMARTCARD.DUMP_SIZE) {
    // SmartCard: check for "EMX" at bytes 8-10
    if (buf.toString('ascii', 8, 11) === 'EMX') return 'smartcard';
    return 'smartcard'; // size match is strong enough
  }
  if (buf.length === DUMP_SIZE) return 'sysex';

  return null;
}

// ── SmartCard parsing ─────────────────────────────────────

/**
 * Parse a SmartCard part (26 bytes: 10 params + 16 step trigger bytes).
 * Used for both synth and drum parts in SmartCard format.
 */
function parseSmartCardPart(buf, offset, partIndex) {
  const isSynth = partIndex < NUM_SYNTH_PARTS;

  // 10 parameter bytes
  const oscType    = buf.readUInt8(offset + SC_PART.OSC_TYPE);
  const pan        = buf.readUInt8(offset + SC_PART.PAN);
  const level      = buf.readUInt8(offset + SC_PART.LEVEL);
  const cutoff     = buf.readUInt8(offset + SC_PART.CUTOFF);
  const resonance  = buf.readUInt8(offset + SC_PART.RESONANCE);
  const mod        = buf.readUInt8(offset + SC_PART.MOD);
  const filtType   = buf.readUInt8(offset + SC_PART.FILT_TYPE);
  const eg         = buf.readUInt8(offset + SC_PART.EG);
  const pitch      = buf.readUInt8(offset + SC_PART.PITCH);
  const fxSend     = buf.readUInt8(offset + SC_PART.FX_SEND);

  // 16 step trigger bytes (128 steps bit-packed, MSB-first)
  const stepData = buf.slice(offset + SC_PART_PARAMS, offset + SC_PART_PARAMS + SC_STEP_BYTES);
  const steps = [];
  for (let byteIdx = 0; byteIdx < SC_STEP_BYTES; byteIdx++) {
    for (let bit = 7; bit >= 0; bit--) {
      steps.push((stepData[byteIdx] >> bit) & 1);
    }
  }

  const base = {
    pan, level, filterCutoff: cutoff, filterRes: resonance,
    mod, filterType: filtType, eg, pitch, fxSend, steps,
  };

  if (isSynth) {
    return { type: 'synth', oscType, ...base };
  }
  return { type: 'drum', samplePtr: oscType, ...base };
}

/**
 * Parse a single SmartCard pattern (4806 bytes).
 */
function parseSmartCardPattern(buf, offset) {
  // Name (8 bytes, ASCII space-padded)
  const nameRaw = buf.slice(offset + SC_PAT.NAME, offset + SC_PAT.NAME + NAME_LEN);
  let name = '';
  for (let i = 0; i < NAME_LEN; i++) {
    if (nameRaw[i] === 0) break;
    name += String.fromCharCode(nameRaw[i]);
  }

  // Tempo: uint16BE / 128
  const tempoRaw = buf.readUInt16BE(offset + SC_PAT.TEMPO);
  const tempo = tempoRaw / 128;

  // Bitfield at +0x0B
  const bf = buf.readUInt8(offset + SC_PAT.LENGTH_ETC);
  const bars    = (bf & 0x07) + 1;        // bits 2:0
  const roll    = (bf >> 3) & 0x03;        // bits 4:3
  const fxChain = (bf >> 5) & 0x03;        // bits 6:5

  // FX types packed nibbles
  const fxByte = buf.readUInt8(offset + SC_PAT.FX_TYPES);
  const fx1Type = (fxByte >> 4) & 0x0F;
  const fx2Type = fxByte & 0x0F;

  const header = {
    name:          name.trim(),
    tempo,
    swing:         buf.readUInt8(offset + SC_PAT.SWING),
    bars,
    beat:          buf.readUInt8(offset + SC_PAT.BEAT),
    rollType:      roll,
    fxChain,
    lastStep:      buf.readUInt8(offset + SC_PAT.LAST_STEP),
    fx1Type,
    fx2Type,
    accentLevel:   buf.readUInt8(offset + SC_PAT.ACCENT_LVL),
    muteStatus:    buf.readUInt16BE(offset + SC_PAT.MUTE_STATUS),
    motionSeqStat: buf.readUInt16BE(offset + SC_PAT.MOTION_SEQ_STAT),
    swingStatus:   buf.readUInt16BE(offset + SC_PAT.SWING_STATUS),
    busStatus:     buf.readUInt16BE(offset + SC_PAT.BUS_STATUS),
  };

  // Parse 9 parts (5 synth + 4 drum), each 26 bytes
  const synthParts = [];
  const drumParts  = [];
  for (let i = 0; i < SC_NUM_PARTS; i++) {
    const partOff = offset + SC_PART_START + i * SC_PART_SIZE;
    const part = parseSmartCardPart(buf, partOff, i);
    if (i < NUM_SYNTH_PARTS) {
      synthParts.push(part);
    } else {
      drumParts.push(part);
    }
  }

  return { header, synthParts, drumParts };
}

// ── SysEx parsing ─────────────────────────────────────────

/**
 * Parse a synth part at the given offset (SysEx format). Returns parameter object.
 */
function parseSynthPart(buf, offset) {
  return {
    type:         'synth',
    samplePtr:    buf.readUInt16BE(offset + SYNTH.SAMPLE_PTR),
    oscType:      buf.readUInt8(offset + SYNTH.OSC_TYPE),
    oscEdit1:     buf.readUInt8(offset + SYNTH.OSC_EDIT1),
    oscEdit2:     buf.readUInt8(offset + SYNTH.OSC_EDIT2),
    filterType:   buf.readUInt8(offset + SYNTH.FILTER_TYPE),
    filterCutoff: buf.readUInt8(offset + SYNTH.FILTER_CUTOFF),
    filterRes:    buf.readUInt8(offset + SYNTH.FILTER_RES),
    filterEG:     buf.readUInt8(offset + SYNTH.FILTER_EG),
    modType:      buf.readUInt8(offset + SYNTH.MOD_TYPE),
    modSpeed:     buf.readUInt8(offset + SYNTH.MOD_SPEED),
    modDepth:     buf.readUInt8(offset + SYNTH.MOD_DEPTH),
    egAttack:     buf.readUInt8(offset + SYNTH.EG_ATTACK),
    egDecay:      buf.readUInt8(offset + SYNTH.EG_DECAY),
    pitch:        buf.readUInt8(offset + SYNTH.PITCH),
    glide:        buf.readUInt8(offset + SYNTH.GLIDE),
    level:        buf.readUInt8(offset + SYNTH.LEVEL),
    pan:          buf.readUInt8(offset + SYNTH.PAN),
    ampEG:        buf.readUInt8(offset + SYNTH.AMP_EG),
    roll:         buf.readUInt8(offset + SYNTH.ROLL),
    fxSend:       buf.readUInt8(offset + SYNTH.FX_SEND),
  };
}

/**
 * Parse a drum part at the given offset. Returns parameter object.
 */
function parseDrumPart(buf, offset) {
  return {
    type:         'drum',
    samplePtr:    buf.readUInt16BE(offset + DRUM.SAMPLE_PTR),
    filterType:   buf.readUInt8(offset + DRUM.FILTER_TYPE),
    filterCutoff: buf.readUInt8(offset + DRUM.FILTER_CUTOFF),
    filterRes:    buf.readUInt8(offset + DRUM.FILTER_RES),
    filterEG:     buf.readUInt8(offset + DRUM.FILTER_EG),
    pitch:        buf.readUInt8(offset + DRUM.PITCH),
    level:        buf.readUInt8(offset + DRUM.LEVEL),
    pan:          buf.readUInt8(offset + DRUM.PAN),
    egTime:       buf.readUInt8(offset + DRUM.EG_TIME),
    fxSend:       buf.readUInt8(offset + DRUM.FX_SEND),
    modType:      buf.readUInt8(offset + DRUM.MOD_TYPE),
    modSpeed:     buf.readUInt8(offset + DRUM.MOD_SPEED),
    modDepth:     buf.readUInt8(offset + DRUM.MOD_DEPTH),
    roll:         buf.readUInt8(offset + DRUM.ROLL),
  };
}

/**
 * Parse a single EMX pattern at the given buffer offset.
 */
function parsePattern(buf, offset) {
  // Name
  const nameRaw = buf.slice(offset + PAT.NAME, offset + PAT.NAME + NAME_LEN);
  let name = '';
  for (let i = 0; i < NAME_LEN; i++) {
    if (nameRaw[i] === 0) break;
    name += String.fromCharCode(nameRaw[i]);
  }

  const header = {
    name:          name.trim(),
    tempo:         buf.readUInt16BE(offset + PAT.TEMPO) / 10,
    swing:         buf.readUInt8(offset + PAT.SWING),
    length:        buf.readUInt8(offset + PAT.LENGTH),
    beat:          buf.readUInt8(offset + PAT.BEAT),
    rollType:      buf.readUInt8(offset + PAT.ROLL_TYPE),
    fxChain:       buf.readUInt8(offset + PAT.FX_CHAIN),
    lastStep:      buf.readUInt8(offset + PAT.LAST_STEP),
    accentStatus:  buf.readUInt16BE(offset + PAT.ACCENT_STATUS),
    muteStatus:    buf.readUInt16BE(offset + PAT.MUTE_STATUS),
    swingStatus:   buf.readUInt16BE(offset + PAT.SWING_STATUS),
    motionSeqStat: buf.readUInt16BE(offset + PAT.MOTION_SEQ_STAT),
  };

  // Parse parts
  const partsOffset = offset + PAT_HEADER_SIZE;
  const synthParts = [];
  for (let i = 0; i < NUM_SYNTH_PARTS; i++) {
    synthParts.push(parseSynthPart(buf, partsOffset + i * SYNTH_PART_SIZE));
  }

  const drumPartsOffset = partsOffset + NUM_SYNTH_PARTS * SYNTH_PART_SIZE;
  const drumParts = [];
  for (let i = 0; i < NUM_DRUM_PARTS; i++) {
    drumParts.push(parseDrumPart(buf, drumPartsOffset + i * DRUM_PART_SIZE));
  }

  return { header, synthParts, drumParts };
}

/**
 * Parse a complete EMX-1 memory dump.
 * Auto-detects SysEx (1,728,000 bytes) or SmartCard (1,736,704 bytes) format.
 * Returns { format, fileSize, numPatterns, globalParams, patterns[] }.
 */
function parseEmxDump(buf) {
  if (buf.length < DUMP_SIZE) {
    throw new Error(`EMX dump too small: ${buf.length} < ${DUMP_SIZE}`);
  }

  // Validate header (first 4 bytes should be "KORG")
  const sig = buf.toString('ascii', 0, 4);
  if (sig !== 'KORG') {
    throw new Error('Invalid EMX dump (missing KORG signature)');
  }

  const fmt = detectEmxFormat(buf) || 'sysex';

  if (fmt === 'smartcard') {
    return parseSmartCardDump(buf);
  }

  // SysEx format (original path)
  const globalParams = buf.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + GLOBAL_PARAMS_SIZE);

  const patterns = [];
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const offset = ADDR.PATTERN_DATA + i * PATTERN_SIZE;
    try {
      patterns.push(parsePattern(buf, offset));
    } catch (err) {
      patterns.push({ index: i, error: err.message });
    }
  }

  return {
    format:       'sysex',
    fileSize:     buf.length,
    numPatterns:  NUM_PATTERNS,
    globalParams,
    patterns,
  };
}

/**
 * Parse a SmartCard EMX dump (1,736,704 bytes).
 */
function parseSmartCardDump(buf) {
  const globalParams = buf.slice(0x20, 0x20 + GLOBAL_PARAMS_SIZE);

  const patterns = [];
  for (let i = 0; i < SMARTCARD.NUM_PATTERNS; i++) {
    const offset = SMARTCARD.PATTERN_DATA + i * SMARTCARD.PATTERN_SIZE;
    try {
      patterns.push(parseSmartCardPattern(buf, offset));
    } catch (err) {
      patterns.push({ index: i, error: err.message });
    }
  }

  return {
    format:       'smartcard',
    fileSize:     buf.length,
    numPatterns:  SMARTCARD.NUM_PATTERNS,
    globalParams,
    patterns,
  };
}

/**
 * List non-empty patterns from a dump (patterns with a non-empty name).
 */
function listPatterns(dump) {
  return dump.patterns
    .map((p, i) => ({ index: i, ...p }))
    .filter(p => p.header && p.header.name && p.header.name.length > 0);
}

// ── Exports ───────────────────────────────────────────────

module.exports = {
  // Constants (SysEx format — legacy)
  DUMP_SIZE,
  NUM_PATTERNS,
  PATTERN_SIZE,
  NUM_SYNTH_PARTS,
  NUM_DRUM_PARTS,
  NUM_STEPS,
  ADDR,
  SYSEX,
  PAT,
  SYNTH,
  DRUM,

  // SmartCard constants
  SMARTCARD,
  SC_PAT,
  SC_PART,
  SC_PART_SIZE,
  SC_NUM_PARTS,
  SC_STEP_BYTES,

  // Format detection
  detectEmxFormat,

  // SysEx utilities
  sysexPack7bit,
  sysexUnpack7bit,

  // Parsing (read-only)
  parseSynthPart,
  parseDrumPart,
  parsePattern,
  parseSmartCardPart,
  parseSmartCardPattern,
  parseEmxDump,
  listPatterns,
};

// ── Self-test ─────────────────────────────────────────────

if (require.main === module) {
  console.log('── emx-format self-test ──');

  // 1. SysEx 7-bit pack/unpack roundtrip
  const testData = Buffer.from([0x00, 0x7F, 0x80, 0xFF, 0x55, 0xAA, 0x42]);
  const packed   = sysexPack7bit(testData);
  const unpacked = sysexUnpack7bit(packed, testData.length);
  console.assert(unpacked.equals(testData),
    'SysEx pack/unpack roundtrip failed');
  console.log(`  SysEx 7-bit: ${testData.length} bytes → ${packed.length} packed → ${unpacked.length} unpacked ✓`);

  // 2. SysEx with larger data
  const bigData = Buffer.alloc(21);
  for (let i = 0; i < 21; i++) bigData[i] = i * 13;
  const bigPacked   = sysexPack7bit(bigData);
  const bigUnpacked = sysexUnpack7bit(bigPacked, bigData.length);
  console.assert(bigUnpacked.equals(bigData), 'Large SysEx roundtrip failed');
  console.log(`  SysEx large: ${bigData.length} → ${bigPacked.length} → ${bigUnpacked.length} ✓`);

  // 3. Build a minimal EMX dump and parse it
  const dump = Buffer.alloc(DUMP_SIZE, 0);
  dump.write('KORG', 0, 'ascii');

  // Write a pattern with a name and tempo
  const patOffset = ADDR.PATTERN_DATA + 0 * PATTERN_SIZE;
  dump.write('TESTPAT', patOffset + PAT.NAME, 'ascii');
  dump.writeUInt16BE(1400, patOffset + PAT.TEMPO);  // 140.0 BPM
  dump.writeUInt8(10, patOffset + PAT.SWING);
  dump.writeUInt8(15, patOffset + PAT.LAST_STEP);

  // Set some synth part params
  const synthOff = patOffset + PAT_HEADER_SIZE;
  dump.writeUInt8(3, synthOff + SYNTH.OSC_TYPE);
  dump.writeUInt8(100, synthOff + SYNTH.FILTER_CUTOFF);
  dump.writeUInt8(80, synthOff + SYNTH.LEVEL);
  dump.writeUInt8(64, synthOff + SYNTH.PAN);

  // Set a drum part
  const drumOff = patOffset + PAT_HEADER_SIZE + NUM_SYNTH_PARTS * SYNTH_PART_SIZE;
  dump.writeUInt16BE(0x0042, drumOff + DRUM.SAMPLE_PTR);
  dump.writeUInt8(127, drumOff + DRUM.LEVEL);

  // Parse it
  const parsed = parseEmxDump(dump);
  console.assert(parsed.numPatterns === 256, 'Pattern count');
  console.assert(parsed.patterns[0].header.name === 'TESTPAT', 'Pattern 0 name');
  console.assert(parsed.patterns[0].header.tempo === 140.0, 'Pattern 0 tempo');
  console.assert(parsed.patterns[0].header.swing === 10, 'Pattern 0 swing');
  console.assert(parsed.patterns[0].header.lastStep === 15, 'Pattern 0 lastStep');
  console.assert(parsed.patterns[0].synthParts[0].oscType === 3, 'Synth 0 oscType');
  console.assert(parsed.patterns[0].synthParts[0].filterCutoff === 100, 'Synth 0 cutoff');
  console.assert(parsed.patterns[0].synthParts[0].level === 80, 'Synth 0 level');
  console.assert(parsed.patterns[0].drumParts[0].samplePtr === 0x0042, 'Drum 0 sample');
  console.assert(parsed.patterns[0].drumParts[0].level === 127, 'Drum 0 level');
  console.log(`  EMX dump parse: ${parsed.numPatterns} patterns ✓`);

  // 4. List non-empty patterns
  const nonEmpty = listPatterns(parsed);
  console.assert(nonEmpty.length === 1, `Non-empty patterns: ${nonEmpty.length}`);
  console.assert(nonEmpty[0].header.name === 'TESTPAT', 'Listed pattern name');
  console.log(`  Non-empty patterns: ${nonEmpty.length} ✓`);

  // 5. SmartCard format detection
  const scBuf = Buffer.alloc(SMARTCARD.DUMP_SIZE, 0);
  scBuf.write('KORG', 0, 'ascii');
  scBuf.writeUInt32BE(0x00000069, 4);
  scBuf.write('EMX', 8, 'ascii');
  console.assert(detectEmxFormat(scBuf) === 'smartcard', 'SmartCard detection');
  console.assert(detectEmxFormat(dump) === 'sysex', 'SysEx detection');
  console.log('  Format detection ✓');

  // 6. SmartCard pattern parse
  const scPatOff = SMARTCARD.PATTERN_DATA;
  scBuf.write('SCTEST', scPatOff + SC_PAT.NAME, 'ascii');
  scBuf.writeUInt16BE(Math.round(135.0 * 128), scPatOff + SC_PAT.TEMPO);
  scBuf.writeUInt8(5, scPatOff + SC_PAT.SWING);
  scBuf.writeUInt8(15, scPatOff + SC_PAT.LAST_STEP);
  // Write synth part 0: level=100, pan=0x40
  const scPartOff = scPatOff + 0x18;
  scBuf.writeUInt8(2, scPartOff + 0);   // oscType
  scBuf.writeUInt8(0x40, scPartOff + 1); // pan
  scBuf.writeUInt8(100, scPartOff + 2);  // level

  const scParsed = parseEmxDump(scBuf);
  console.assert(scParsed.format === 'smartcard', 'SmartCard format tag');
  console.assert(scParsed.patterns[0].header.name === 'SCTEST', 'SC pattern name');
  console.assert(scParsed.patterns[0].header.tempo === 135.0, `SC tempo: ${scParsed.patterns[0].header.tempo}`);
  console.assert(scParsed.patterns[0].synthParts[0].level === 100, 'SC synth level');
  console.assert(scParsed.patterns[0].synthParts[0].pan === 0x40, 'SC synth pan');
  console.log(`  SmartCard parse: ${scParsed.numPatterns} patterns ✓`);

  console.log('  All assertions passed ✓');
}
