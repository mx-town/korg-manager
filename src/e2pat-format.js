/**
 * E2PAT Format Parser/Builder
 * Reads and writes Korg Electribe 2 / E2S pattern files.
 *
 * Single pattern: 16,641 bytes (0x4101)
 * All-patterns:   250 × 16,641 = 4,160,250 bytes + 32-byte header
 *
 * Pattern layout (16,641 bytes):
 *   [0x0000 – 0x0020]  Header (33 bytes): name, BPM, swing, etc.
 *   [0x0021 – 0x4100]  16 Parts × 1038 bytes each
 *
 * Part layout (1038 bytes):
 *   [0x00 – 0x0D]  Part params (14 bytes)
 *   [0x0E – 0x40D] 64 Steps × 16 bytes each (1024 bytes)
 */

'use strict';

// ── Constants ──────────────────────────────────────────────

const PATTERN_SIZE     = 16641;  // 0x4101
const NUM_PATTERNS     = 250;
const ALL_HEADER_SIZE  = 32;
const ALL_FILE_SIZE    = ALL_HEADER_SIZE + NUM_PATTERNS * PATTERN_SIZE;

const NUM_PARTS        = 16;
const NUM_STEPS        = 64;
const STEP_SIZE        = 16;
const PART_HEADER_SIZE = 14;
const PART_SIZE        = PART_HEADER_SIZE + NUM_STEPS * STEP_SIZE; // 14 + 1024 = 1038

const PAT_HEADER_SIZE  = 33;    // pattern header before parts

const NAME_LEN         = 16;    // pattern name length

// Device IDs for E2↔E2S conversion
const DEVICE_E2        = 0x00;
const DEVICE_E2S       = 0x01;

// All-patterns file magic
const ALL_MAGIC = Buffer.from([
  0x4B, 0x4F, 0x52, 0x47, // "KORG"
  0x00, 0x00, 0x00, 0x72, // version/type marker
  0x45, 0x32, 0x50, 0x00, // "E2P\0"
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

// Pattern-header field offsets
const PAT = {
  NAME:       0x00,   // char[16] – ASCII, null-padded
  TEMPO:      0x10,   // uint16LE – BPM × 10 (e.g. 1200 = 120.0)
  SWING:      0x12,   // uint8    – 0-127, 64 = centre
  LENGTH:     0x13,   // uint8    – pattern length in bars - 1 (0 = 1 bar)
  BEAT:       0x14,   // uint8    – 0 = 16th, 1 = 32nd, 2 = 8th, 3 = 8-tri
  KEY:        0x15,   // uint8    – 0 = C … 11 = B
  SCALE:      0x16,   // uint8    – 0 = Chromatic, 1 = Ionian …
  CHORD_SET:  0x17,   // uint8
  LEVEL:      0x18,   // uint8    – master level 0-127
  GATE_ARP:   0x19,   // uint8    – gate arpeggiator type
  MFX_TYPE:   0x1A,   // uint8    – master FX type
  MFX_PAD_X:  0x1B,   // uint16LE
  MFX_PAD_Y:  0x1D,   // uint16LE
  MFX_HOLD:   0x1F,   // uint8    – 0 = off, 1 = on
  DEVICE_ID:  0x20,   // uint8    – 0x00 = E2, 0x01 = E2S
};

// Part-param field offsets (relative to part start)
const PART = {
  OSC_TYPE:      0x00,  // uint8
  OSC_EDIT:      0x01,  // uint8
  FILTER_TYPE:   0x02,  // uint8
  FILTER_CUTOFF: 0x03,  // uint8
  FILTER_RES:    0x04,  // uint8
  FILTER_EG:     0x05,  // uint8
  MOD_TYPE:      0x06,  // uint8
  MOD_SPEED:     0x07,  // uint8
  MOD_DEPTH:     0x08,  // uint8
  LEVEL:         0x09,  // uint8    – 0-127
  PAN:           0x0A,  // uint8    – 0 = L, 64 = C, 127 = R
  IFX_TYPE:      0x0B,  // uint8    – insert effect
  IFX_PARAM:     0x0C,  // uint8
  LAST_STEP:     0x0D,  // uint8    – 0-63
};

// Step field offsets (relative to step start)
const STEP = {
  GATE:       0x00,  // uint8  – 0 = off, 1 = on, 2 = tie
  VELOCITY:   0x01,  // uint8  – 0-127
  NOTE:       0x02,  // uint8  – MIDI note 0-127
  TRIG_PROB:  0x03,  // uint8  – trigger probability 0-127
  MOTION_1:   0x04,  // uint16LE – motion seq value
  MOTION_2:   0x06,  // uint16LE
  MOTION_3:   0x08,  // uint16LE
  MOTION_4:   0x0A,  // uint16LE
  RESERVED:   0x0C,  // uint32LE
};

// ── Parsing ───────────────────────────────────────────────

/**
 * Parse a single step (16 bytes) into an object.
 */
function parseStep(buf, offset) {
  return {
    gate:     buf.readUInt8(offset + STEP.GATE),
    velocity: buf.readUInt8(offset + STEP.VELOCITY),
    note:     buf.readUInt8(offset + STEP.NOTE),
    trigProb: buf.readUInt8(offset + STEP.TRIG_PROB),
    motion: [
      buf.readUInt16LE(offset + STEP.MOTION_1),
      buf.readUInt16LE(offset + STEP.MOTION_2),
      buf.readUInt16LE(offset + STEP.MOTION_3),
      buf.readUInt16LE(offset + STEP.MOTION_4),
    ],
  };
}

/**
 * Parse a single part (1038 bytes): 14-byte header + 64 steps.
 */
function parsePart(buf, offset) {
  const params = {
    oscType:      buf.readUInt8(offset + PART.OSC_TYPE),
    oscEdit:      buf.readUInt8(offset + PART.OSC_EDIT),
    filterType:   buf.readUInt8(offset + PART.FILTER_TYPE),
    filterCutoff: buf.readUInt8(offset + PART.FILTER_CUTOFF),
    filterRes:    buf.readUInt8(offset + PART.FILTER_RES),
    filterEG:     buf.readUInt8(offset + PART.FILTER_EG),
    modType:      buf.readUInt8(offset + PART.MOD_TYPE),
    modSpeed:     buf.readUInt8(offset + PART.MOD_SPEED),
    modDepth:     buf.readUInt8(offset + PART.MOD_DEPTH),
    level:        buf.readUInt8(offset + PART.LEVEL),
    pan:          buf.readUInt8(offset + PART.PAN),
    ifxType:      buf.readUInt8(offset + PART.IFX_TYPE),
    ifxParam:     buf.readUInt8(offset + PART.IFX_PARAM),
    lastStep:     buf.readUInt8(offset + PART.LAST_STEP),
  };

  const steps = [];
  const stepsStart = offset + PART_HEADER_SIZE;
  for (let s = 0; s < NUM_STEPS; s++) {
    steps.push(parseStep(buf, stepsStart + s * STEP_SIZE));
  }

  return { params, steps };
}

/**
 * Parse a single pattern (16,641 bytes).
 */
function parsePattern(buf, offset) {
  if (buf.length < offset + PATTERN_SIZE) {
    throw new Error(`Buffer too small for pattern at offset ${offset}`);
  }

  // Header
  const nameRaw = buf.slice(offset + PAT.NAME, offset + PAT.NAME + NAME_LEN);
  let name = '';
  for (let i = 0; i < NAME_LEN; i++) {
    if (nameRaw[i] === 0) break;
    name += String.fromCharCode(nameRaw[i]);
  }

  const header = {
    name:     name.trim(),
    tempo:    buf.readUInt16LE(offset + PAT.TEMPO) / 10,
    swing:    buf.readUInt8(offset + PAT.SWING),
    length:   buf.readUInt8(offset + PAT.LENGTH) + 1,   // bars
    beat:     buf.readUInt8(offset + PAT.BEAT),
    key:      buf.readUInt8(offset + PAT.KEY),
    scale:    buf.readUInt8(offset + PAT.SCALE),
    chordSet: buf.readUInt8(offset + PAT.CHORD_SET),
    level:    buf.readUInt8(offset + PAT.LEVEL),
    gateArp:  buf.readUInt8(offset + PAT.GATE_ARP),
    mfxType:  buf.readUInt8(offset + PAT.MFX_TYPE),
    mfxPadX:  buf.readUInt16LE(offset + PAT.MFX_PAD_X),
    mfxPadY:  buf.readUInt16LE(offset + PAT.MFX_PAD_Y),
    mfxHold:  buf.readUInt8(offset + PAT.MFX_HOLD),
    deviceId: buf.readUInt8(offset + PAT.DEVICE_ID),
  };

  // Parts
  const parts = [];
  const partsStart = offset + PAT_HEADER_SIZE;
  for (let p = 0; p < NUM_PARTS; p++) {
    parts.push(parsePart(buf, partsStart + p * PART_SIZE));
  }

  return { header, parts };
}

// ── Building ──────────────────────────────────────────────

/**
 * Write a step (16 bytes) into a buffer.
 */
function buildStep(buf, offset, step) {
  buf.writeUInt8(step.gate       || 0,   offset + STEP.GATE);
  buf.writeUInt8(step.velocity   || 0,   offset + STEP.VELOCITY);
  buf.writeUInt8(step.note       || 0,   offset + STEP.NOTE);
  buf.writeUInt8(step.trigProb   || 0,   offset + STEP.TRIG_PROB);
  const m = step.motion || [0, 0, 0, 0];
  buf.writeUInt16LE(m[0] || 0, offset + STEP.MOTION_1);
  buf.writeUInt16LE(m[1] || 0, offset + STEP.MOTION_2);
  buf.writeUInt16LE(m[2] || 0, offset + STEP.MOTION_3);
  buf.writeUInt16LE(m[3] || 0, offset + STEP.MOTION_4);
  buf.writeUInt32LE(0,         offset + STEP.RESERVED);
}

/**
 * Write a part (1038 bytes) into a buffer.
 */
function buildPart(buf, offset, part) {
  const p = part.params || {};
  buf.writeUInt8(p.oscType      || 0,   offset + PART.OSC_TYPE);
  buf.writeUInt8(p.oscEdit      || 0,   offset + PART.OSC_EDIT);
  buf.writeUInt8(p.filterType   || 0,   offset + PART.FILTER_TYPE);
  buf.writeUInt8(p.filterCutoff ?? 127, offset + PART.FILTER_CUTOFF);
  buf.writeUInt8(p.filterRes    || 0,   offset + PART.FILTER_RES);
  buf.writeUInt8(p.filterEG     ?? 64,  offset + PART.FILTER_EG);
  buf.writeUInt8(p.modType      || 0,   offset + PART.MOD_TYPE);
  buf.writeUInt8(p.modSpeed     || 0,   offset + PART.MOD_SPEED);
  buf.writeUInt8(p.modDepth     ?? 64,  offset + PART.MOD_DEPTH);
  buf.writeUInt8(p.level        ?? 100, offset + PART.LEVEL);
  buf.writeUInt8(p.pan          ?? 64,  offset + PART.PAN);
  buf.writeUInt8(p.ifxType      || 0,   offset + PART.IFX_TYPE);
  buf.writeUInt8(p.ifxParam     || 0,   offset + PART.IFX_PARAM);
  buf.writeUInt8(p.lastStep     ?? 15,  offset + PART.LAST_STEP);

  const stepsStart = offset + PART_HEADER_SIZE;
  const steps = part.steps || [];
  for (let s = 0; s < NUM_STEPS; s++) {
    buildStep(buf, stepsStart + s * STEP_SIZE, steps[s] || {});
  }
}

/**
 * Build a single pattern (16,641 bytes).
 */
function buildPattern(pattern) {
  const buf = Buffer.alloc(PATTERN_SIZE, 0);
  const h = pattern.header || {};

  // Name
  const nameStr = (h.name || '').substring(0, NAME_LEN);
  buf.write(nameStr, PAT.NAME, 'ascii');

  // Global params
  buf.writeUInt16LE(Math.round((h.tempo || 120) * 10), PAT.TEMPO);
  buf.writeUInt8(h.swing    ?? 0,  PAT.SWING);
  buf.writeUInt8((h.length  || 1) - 1, PAT.LENGTH);
  buf.writeUInt8(h.beat     || 0,  PAT.BEAT);
  buf.writeUInt8(h.key      || 0,  PAT.KEY);
  buf.writeUInt8(h.scale    || 0,  PAT.SCALE);
  buf.writeUInt8(h.chordSet || 0,  PAT.CHORD_SET);
  buf.writeUInt8(h.level    ?? 100, PAT.LEVEL);
  buf.writeUInt8(h.gateArp  || 0,  PAT.GATE_ARP);
  buf.writeUInt8(h.mfxType  || 0,  PAT.MFX_TYPE);
  buf.writeUInt16LE(h.mfxPadX || 0, PAT.MFX_PAD_X);
  buf.writeUInt16LE(h.mfxPadY || 0, PAT.MFX_PAD_Y);
  buf.writeUInt8(h.mfxHold  || 0,  PAT.MFX_HOLD);
  buf.writeUInt8(h.deviceId || DEVICE_E2, PAT.DEVICE_ID);

  // Parts
  const parts = pattern.parts || [];
  for (let p = 0; p < NUM_PARTS; p++) {
    buildPart(buf, PAT_HEADER_SIZE + p * PART_SIZE, parts[p] || { params: {}, steps: [] });
  }

  return buf;
}

/**
 * Build a default (empty) pattern with sensible defaults.
 */
function createDefaultPattern(deviceId) {
  const parts = [];
  for (let p = 0; p < NUM_PARTS; p++) {
    const steps = [];
    for (let s = 0; s < NUM_STEPS; s++) {
      steps.push({ gate: 0, velocity: 0, note: 60, trigProb: 127, motion: [0, 0, 0, 0] });
    }
    parts.push({
      params: {
        oscType: 0, oscEdit: 0,
        filterType: 0, filterCutoff: 127, filterRes: 0, filterEG: 64,
        modType: 0, modSpeed: 0, modDepth: 64,
        level: 100, pan: 64,
        ifxType: 0, ifxParam: 0,
        lastStep: 15,
      },
      steps,
    });
  }
  return {
    header: {
      name: '', tempo: 120.0, swing: 0, length: 1, beat: 0,
      key: 0, scale: 0, chordSet: 0, level: 100,
      gateArp: 0, mfxType: 0, mfxPadX: 0, mfxPadY: 0, mfxHold: 0,
      deviceId: deviceId || DEVICE_E2,
    },
    parts,
  };
}

// ── All-patterns file ─────────────────────────────────────

/**
 * Parse an all-patterns file (250 patterns + 32-byte header).
 */
function parseAllPatterns(buf) {
  if (buf.length < ALL_FILE_SIZE) {
    throw new Error(
      `File too small for all-patterns: ${buf.length} < ${ALL_FILE_SIZE}`
    );
  }
  // Validate magic
  if (buf.toString('ascii', 0, 4) !== 'KORG') {
    throw new Error('Invalid all-patterns file (missing KORG signature)');
  }

  const patterns = [];
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const offset = ALL_HEADER_SIZE + i * PATTERN_SIZE;
    patterns.push(parsePattern(buf, offset));
  }
  return { patterns };
}

/**
 * Build an all-patterns file from an array of pattern objects.
 */
function buildAllPatterns(patterns, deviceId) {
  const buf = Buffer.alloc(ALL_FILE_SIZE, 0);

  // Write magic header
  ALL_MAGIC.copy(buf, 0);

  for (let i = 0; i < NUM_PATTERNS; i++) {
    const pat = patterns[i] || createDefaultPattern(deviceId);
    const patBuf = buildPattern(pat);
    patBuf.copy(buf, ALL_HEADER_SIZE + i * PATTERN_SIZE);
  }

  return buf;
}

// ── E2 ↔ E2S conversion ──────────────────────────────────

/**
 * Convert a pattern between E2 and E2S by swapping the device ID.
 * Returns a new pattern object (deep copy).
 */
function convertDeviceId(pattern, targetDevice) {
  const json = JSON.parse(JSON.stringify(pattern));
  json.header.deviceId = targetDevice;
  return json;
}

function e2ToE2s(pattern) { return convertDeviceId(pattern, DEVICE_E2S); }
function e2sToE2(pattern) { return convertDeviceId(pattern, DEVICE_E2);  }

// ── Split / Merge utilities ───────────────────────────────

/**
 * Extract a single pattern from an all-patterns file buffer.
 * Returns the raw 16,641-byte buffer.
 */
function splitPattern(allBuf, index) {
  if (index < 0 || index >= NUM_PATTERNS) {
    throw new Error(`Pattern index ${index} out of range (0-${NUM_PATTERNS - 1})`);
  }
  const offset = ALL_HEADER_SIZE + index * PATTERN_SIZE;
  return allBuf.slice(offset, offset + PATTERN_SIZE);
}

/**
 * Replace a single pattern inside an all-patterns file buffer.
 * Mutates the allBuf.
 */
function mergePattern(allBuf, index, patBuf) {
  if (index < 0 || index >= NUM_PATTERNS) {
    throw new Error(`Pattern index ${index} out of range (0-${NUM_PATTERNS - 1})`);
  }
  if (patBuf.length !== PATTERN_SIZE) {
    throw new Error(`Pattern buffer size ${patBuf.length} !== ${PATTERN_SIZE}`);
  }
  const offset = ALL_HEADER_SIZE + index * PATTERN_SIZE;
  patBuf.copy(allBuf, offset);
}

// ── Exports ───────────────────────────────────────────────

module.exports = {
  // Constants
  PATTERN_SIZE,
  NUM_PATTERNS,
  ALL_HEADER_SIZE,
  ALL_FILE_SIZE,
  NUM_PARTS,
  NUM_STEPS,
  DEVICE_E2,
  DEVICE_E2S,
  ALL_MAGIC,
  PAT,
  PART,
  STEP,

  // Parsing
  parseStep,
  parsePart,
  parsePattern,
  parseAllPatterns,

  // Building
  buildStep,
  buildPart,
  buildPattern,
  buildAllPatterns,
  createDefaultPattern,

  // Conversion
  e2ToE2s,
  e2sToE2,

  // Split/Merge
  splitPattern,
  mergePattern,
};

// ── Self-test ─────────────────────────────────────────────

if (require.main === module) {
  console.log('── e2pat-format self-test ──');

  // 1. Build a pattern with some data
  const pat = createDefaultPattern(DEVICE_E2);
  pat.header.name  = 'TEST-PAT';
  pat.header.tempo = 140.0;
  pat.header.swing = 30;
  pat.header.key   = 5;   // F
  pat.header.scale = 1;   // Ionian
  pat.parts[0].params.oscType = 3;
  pat.parts[0].params.level   = 110;
  pat.parts[0].steps[0]  = { gate: 1, velocity: 100, note: 36, trigProb: 127, motion: [0, 0, 0, 0] };
  pat.parts[0].steps[4]  = { gate: 1, velocity: 80,  note: 38, trigProb: 64,  motion: [100, 0, 0, 0] };
  pat.parts[0].steps[8]  = { gate: 1, velocity: 100, note: 36, trigProb: 127, motion: [0, 0, 0, 0] };
  pat.parts[0].steps[12] = { gate: 2, velocity: 90,  note: 42, trigProb: 127, motion: [0, 0, 0, 0] };

  // 2. Build → parse roundtrip (single pattern)
  const patBuf = buildPattern(pat);
  console.log(`  Single pattern size: ${patBuf.length} bytes (expected ${PATTERN_SIZE})`);
  console.assert(patBuf.length === PATTERN_SIZE, 'Pattern size mismatch');

  const parsed = parsePattern(patBuf, 0);
  console.assert(parsed.header.name  === 'TEST-PAT', `Name: "${parsed.header.name}"`);
  console.assert(parsed.header.tempo === 140.0,      `Tempo: ${parsed.header.tempo}`);
  console.assert(parsed.header.swing === 30,          `Swing: ${parsed.header.swing}`);
  console.assert(parsed.header.key   === 5,           `Key: ${parsed.header.key}`);
  console.assert(parsed.header.scale === 1,           `Scale: ${parsed.header.scale}`);
  console.assert(parsed.header.deviceId === DEVICE_E2, `Device: ${parsed.header.deviceId}`);
  console.assert(parsed.parts[0].params.oscType === 3, `OscType: ${parsed.parts[0].params.oscType}`);
  console.assert(parsed.parts[0].params.level === 110, `Level: ${parsed.parts[0].params.level}`);
  console.assert(parsed.parts[0].steps[0].gate === 1,  `Step 0 gate: ${parsed.parts[0].steps[0].gate}`);
  console.assert(parsed.parts[0].steps[0].velocity === 100, `Step 0 vel`);
  console.assert(parsed.parts[0].steps[4].trigProb === 64,  `Step 4 trigProb`);
  console.assert(parsed.parts[0].steps[12].gate === 2, `Step 12 tie`);

  // 3. All-patterns roundtrip
  const allPatterns = [];
  allPatterns[0]   = pat;
  allPatterns[42]  = createDefaultPattern(DEVICE_E2);
  allPatterns[42].header.name  = 'PAT-42';
  allPatterns[42].header.tempo = 90.0;

  const allBuf = buildAllPatterns(allPatterns, DEVICE_E2);
  console.log(`  All-patterns size: ${allBuf.length} bytes (expected ${ALL_FILE_SIZE})`);
  console.assert(allBuf.length === ALL_FILE_SIZE, 'All-patterns size mismatch');

  const parsedAll = parseAllPatterns(allBuf);
  console.assert(parsedAll.patterns.length === NUM_PATTERNS, 'Pattern count');
  console.assert(parsedAll.patterns[0].header.name === 'TEST-PAT', 'Pattern 0 name');
  console.assert(parsedAll.patterns[42].header.name === 'PAT-42',  'Pattern 42 name');
  console.assert(parsedAll.patterns[42].header.tempo === 90.0,     'Pattern 42 tempo');

  // 4. E2 ↔ E2S conversion
  const e2sPat = e2ToE2s(parsed);
  console.assert(e2sPat.header.deviceId === DEVICE_E2S, 'E2→E2S device ID');
  console.assert(e2sPat.header.name === 'TEST-PAT',     'E2→E2S name preserved');

  const backE2 = e2sToE2(e2sPat);
  console.assert(backE2.header.deviceId === DEVICE_E2,   'E2S→E2 device ID');

  // 5. Split / Merge
  const splitBuf = splitPattern(allBuf, 42);
  console.assert(splitBuf.length === PATTERN_SIZE, 'Split size');
  const splitParsed = parsePattern(splitBuf, 0);
  console.assert(splitParsed.header.name === 'PAT-42', 'Split pattern name');

  // Merge modified pattern into slot 100
  const modBuf = buildPattern(pat);
  const allCopy = Buffer.from(allBuf);
  mergePattern(allCopy, 100, modBuf);
  const reParsed = parseAllPatterns(allCopy);
  console.assert(reParsed.patterns[100].header.name === 'TEST-PAT', 'Merged pattern name');

  console.log('  All assertions passed ✓');
}
