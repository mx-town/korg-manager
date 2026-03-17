/**
 * EMX fixture generators.
 * EMX is read-only, so we build raw buffers matching the dump format.
 */
'use strict';

const {
  DUMP_SIZE,
  ADDR,
  PATTERN_SIZE,
  PAT,
  SYNTH,
  DRUM,
  NUM_SYNTH_PARTS,
  SMARTCARD,
  SC_PAT,
  SC_PART,
  SC_PART_SIZE,
} = require('../../../src/emx-format');

// Internal constants not exported by emx-format.js
const PAT_HEADER_SIZE = 32;
const SYNTH_PART_SIZE = 600;

/**
 * Generate a minimal valid EMX dump (all zeros + KORG header).
 */
function generateMinimalEMX() {
  const buf = Buffer.alloc(DUMP_SIZE, 0);
  buf.write('KORG', 0, 'ascii');
  return buf;
}

/**
 * Generate an EMX dump with one named pattern containing part data.
 */
function generateEMXWithPattern(name = 'TESTPAT', tempo = 140.0) {
  const buf = generateMinimalEMX();
  const patOff = ADDR.PATTERN_DATA;

  buf.write(name.substring(0, 8), patOff + PAT.NAME, 'ascii');
  buf.writeUInt16BE(Math.round(tempo * 10), patOff + PAT.TEMPO);
  buf.writeUInt8(10, patOff + PAT.SWING);
  buf.writeUInt8(15, patOff + PAT.LAST_STEP);

  // Write some synth part data
  const synthOff = patOff + PAT_HEADER_SIZE;
  buf.writeUInt8(3, synthOff + SYNTH.OSC_TYPE);
  buf.writeUInt8(100, synthOff + SYNTH.FILTER_CUTOFF);
  buf.writeUInt8(80, synthOff + SYNTH.LEVEL);
  buf.writeUInt8(64, synthOff + SYNTH.PAN);

  // Write a drum part
  const drumOff = patOff + PAT_HEADER_SIZE + NUM_SYNTH_PARTS * SYNTH_PART_SIZE;
  buf.writeUInt16BE(0x0042, drumOff + DRUM.SAMPLE_PTR);
  buf.writeUInt8(127, drumOff + DRUM.LEVEL);

  return buf;
}

/**
 * Generate a minimal valid EMX SmartCard dump (1,736,704 bytes).
 */
function generateMinimalEMXSmartCard() {
  const buf = Buffer.alloc(SMARTCARD.DUMP_SIZE, 0);
  buf.write('KORG', 0, 'ascii');
  buf.writeUInt32BE(0x00000069, 4);
  buf.write('EMX', 8, 'ascii');
  return buf;
}

/**
 * Generate an EMX SmartCard dump with one named pattern.
 */
function generateEMXSmartCardWithPattern(name = 'TESTSC', tempo = 135.0) {
  const buf = generateMinimalEMXSmartCard();
  const patOff = SMARTCARD.PATTERN_DATA;

  // Pattern header
  buf.write(name.substring(0, 8), patOff + SC_PAT.NAME, 'ascii');
  buf.writeUInt16BE(Math.round(tempo * 128), patOff + SC_PAT.TEMPO);
  buf.writeUInt8(5, patOff + SC_PAT.SWING);
  buf.writeUInt8(0x02, patOff + SC_PAT.LENGTH_ETC); // bars=3, roll=0, fxChain=0
  buf.writeUInt8(0, patOff + SC_PAT.BEAT);          // 16th
  buf.writeUInt8(15, patOff + SC_PAT.LAST_STEP);

  // Synth part 0
  const partOff = patOff + 0x18;
  buf.writeUInt8(5, partOff + SC_PART.OSC_TYPE);
  buf.writeUInt8(0x40, partOff + SC_PART.PAN);
  buf.writeUInt8(100, partOff + SC_PART.LEVEL);
  buf.writeUInt8(80, partOff + SC_PART.CUTOFF);
  // Step triggers: steps 0,4,8,12 active (4-on-the-floor)
  buf.writeUInt8(0x88, partOff + 10);  // steps 0,4
  buf.writeUInt8(0x88, partOff + 11);  // steps 8,12

  // Drum part 0 (part index 5)
  const drumOff = patOff + 0x18 + 5 * SC_PART_SIZE;
  buf.writeUInt8(0x42, drumOff + SC_PART.OSC_TYPE);
  buf.writeUInt8(0x40, drumOff + SC_PART.PAN);
  buf.writeUInt8(127, drumOff + SC_PART.LEVEL);

  return buf;
}

module.exports = {
  generateMinimalEMX,
  generateEMXWithPattern,
  generateMinimalEMXSmartCard,
  generateEMXSmartCardWithPattern,
};
