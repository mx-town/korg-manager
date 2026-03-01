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

module.exports = {
  generateMinimalEMX,
  generateEMXWithPattern,
};
