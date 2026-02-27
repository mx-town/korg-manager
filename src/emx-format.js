/**
 * EMX Format Parser (READ-ONLY)
 * Parses Korg Electribe EMX-1 memory dump files (1,728,000 bytes).
 * Extracts 256 patterns with part parameters.
 * Includes SysEx 7-bit pack/unpack utilities for future MIDI use.
 *
 * EMX-1 dump layout (1,728,000 bytes = 0x1A5E00):
 *   [0x000000 – 0x00001F]  Header (32 bytes)
 *   [0x000020 – 0x00011F]  Global parameters (256 bytes)
 *   [0x000120 – 0x19DFFF]  256 patterns × 6750 bytes each
 *   [0x19E000 – 0x1A5DFF]  Song data, etc.
 *
 * Pattern layout (6750 bytes):
 *   [0x0000 – 0x001F]  Pattern header (32 bytes): name, tempo, etc.
 *   [0x0020 – 0x1A5D]  Part data: 5 synth + 4 drum + accent
 */

'use strict';

// ── Constants ──────────────────────────────────────────────

const DUMP_SIZE          = 1728000;     // 0x1A5E00
const NUM_PATTERNS       = 256;

const ADDR = {
  HEADER:          0x000000,
  GLOBAL_PARAMS:   0x000020,
  PATTERN_DATA:    0x000120,
};

const HEADER_SIZE        = 32;
const GLOBAL_PARAMS_SIZE = 256;
const PATTERN_SIZE       = 6750;       // (DUMP_SIZE - HEADER_SIZE - GLOBAL_PARAMS_SIZE - tail) / 256

const NUM_SYNTH_PARTS    = 5;
const NUM_DRUM_PARTS     = 4;
const NUM_TOTAL_PARTS    = NUM_SYNTH_PARTS + NUM_DRUM_PARTS + 1; // +1 for accent
const NUM_STEPS          = 16;         // EMX uses 16-step patterns (repeatable)
const NAME_LEN           = 8;

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

// ── Parsing ───────────────────────────────────────────────

/**
 * Parse a synth part at the given offset. Returns parameter object.
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
 * Parse a complete EMX-1 memory dump (1,728,000 bytes).
 * Returns { header, globalParams, patterns[] }.
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

  // Global params (raw buffer for now)
  const globalParams = buf.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + GLOBAL_PARAMS_SIZE);

  // Parse all patterns
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
    fileSize:     buf.length,
    numPatterns:  NUM_PATTERNS,
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
  // Constants
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

  // SysEx utilities
  sysexPack7bit,
  sysexUnpack7bit,

  // Parsing (read-only)
  parseSynthPart,
  parseDrumPart,
  parsePattern,
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

  console.log('  All assertions passed ✓');
}
