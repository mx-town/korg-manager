/**
 * EMX-1 Format Tests
 * Covers dump parsing, SysEx 7-bit pack/unpack, pattern listing,
 * and edge cases.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parseEmxDump,
  listPatterns,
  parseSynthPart,
  parseDrumPart,
  sysexPack7bit,
  sysexUnpack7bit,
  detectEmxFormat,
  DUMP_SIZE,
  NUM_PATTERNS,
  PATTERN_SIZE,
  NUM_SYNTH_PARTS,
  NUM_DRUM_PARTS,
  ADDR,
  PAT,
  SYNTH,
  DRUM,
  SMARTCARD,
  SC_PAT,
  SC_PART,
} = require('../../src/emx-format');
const {
  generateMinimalEMX,
  generateEMXWithPattern,
  generateMinimalEMXSmartCard,
  generateEMXSmartCardWithPattern,
} = require('../fixtures/generators/minimal-emx');

// ── SysEx 7-bit pack/unpack ──────────────────────────────

describe('EMX - SysEx 7-bit encoding', () => {
  it('should round-trip a 7-byte block exactly', () => {
    const data = Buffer.from([0x00, 0x7F, 0x80, 0xFF, 0x55, 0xAA, 0x42]);
    const packed = sysexPack7bit(data);
    const unpacked = sysexUnpack7bit(packed, data.length);
    expect(unpacked.equals(data)).toBe(true);
  });

  it('should handle data smaller than 7 bytes', () => {
    const data = Buffer.from([0x01, 0x80, 0xFF]);
    const packed = sysexPack7bit(data);
    const unpacked = sysexUnpack7bit(packed, data.length);
    expect(unpacked.equals(data)).toBe(true);
  });

  it('should handle data larger than 7 bytes (multiple groups)', () => {
    const data = Buffer.alloc(21);
    for (let i = 0; i < 21; i++) data[i] = i * 13;
    const packed = sysexPack7bit(data);
    const unpacked = sysexUnpack7bit(packed, data.length);
    expect(unpacked.equals(data)).toBe(true);
  });

  it('should expand 7 bytes to 8 bytes per group', () => {
    const data = Buffer.alloc(7, 0x42);
    const packed = sysexPack7bit(data);
    expect(packed.length).toBe(8); // 1 flag + 7 data
  });

  it('should handle all-zero data', () => {
    const data = Buffer.alloc(14, 0);
    const packed = sysexPack7bit(data);
    const unpacked = sysexUnpack7bit(packed, data.length);
    expect(unpacked.equals(data)).toBe(true);
  });

  it('should handle all-0xFF data', () => {
    const data = Buffer.alloc(7, 0xFF);
    const packed = sysexPack7bit(data);
    const unpacked = sysexUnpack7bit(packed, data.length);
    expect(unpacked.equals(data)).toBe(true);
  });
});

// ── Dump parsing ─────────────────────────────────────────

describe('EMX - Dump parsing', () => {
  it('should parse a minimal valid dump', () => {
    const buf = generateMinimalEMX();
    const dump = parseEmxDump(buf);

    expect(dump.fileSize).toBe(DUMP_SIZE);
    expect(dump.numPatterns).toBe(NUM_PATTERNS);
    // SysEx: 288 header + 256×6750 = 1,728,288 > 1,728,000, so pattern 255 overflows
    expect(dump.patterns).toHaveLength(NUM_PATTERNS - 1);
  });

  it('should parse pattern with name and tempo', () => {
    const buf = generateEMXWithPattern('MYBEAT', 160.0);
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].header.name).toBe('MYBEAT');
    expect(dump.patterns[0].header.tempo).toBe(160.0);
  });

  it('should parse synth part parameters', () => {
    const buf = generateEMXWithPattern();
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].synthParts).toHaveLength(NUM_SYNTH_PARTS);
    expect(dump.patterns[0].synthParts[0].oscType).toBe(3);
    expect(dump.patterns[0].synthParts[0].filterCutoff).toBe(100);
    expect(dump.patterns[0].synthParts[0].level).toBe(80);
    expect(dump.patterns[0].synthParts[0].pan).toBe(64);
  });

  it('should parse drum part parameters', () => {
    const buf = generateEMXWithPattern();
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].drumParts).toHaveLength(NUM_DRUM_PARTS);
    expect(dump.patterns[0].drumParts[0].samplePtr).toBe(0x0042);
    expect(dump.patterns[0].drumParts[0].level).toBe(127);
  });

  it('should reject buffer that is too small', () => {
    expect(() => parseEmxDump(Buffer.alloc(100))).toThrow('too small');
  });

  it('should reject buffer with bad magic', () => {
    const buf = Buffer.alloc(DUMP_SIZE, 0);
    buf.write('NOPE', 0, 'ascii');
    expect(() => parseEmxDump(buf)).toThrow('KORG');
  });
});

// ── Pattern listing ──────────────────────────────────────

describe('EMX - Pattern listing', () => {
  it('should list only non-empty patterns', () => {
    const buf = generateEMXWithPattern('TESTPAT');
    const dump = parseEmxDump(buf);
    const nonEmpty = listPatterns(dump);

    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].header.name).toBe('TESTPAT');
  });

  it('should return empty list for blank dump', () => {
    const buf = generateMinimalEMX();
    const dump = parseEmxDump(buf);
    const nonEmpty = listPatterns(dump);

    expect(nonEmpty).toHaveLength(0);
  });

  it('should include pattern index', () => {
    const buf = generateMinimalEMX();
    // Write a pattern at index 42
    const patOff = ADDR.PATTERN_DATA + 42 * PATTERN_SIZE;
    buf.write('PAT42', patOff + PAT.NAME, 'ascii');
    buf.writeUInt16BE(1200, patOff + PAT.TEMPO);

    const dump = parseEmxDump(buf);
    const nonEmpty = listPatterns(dump);

    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].index).toBe(42);
    expect(nonEmpty[0].header.name).toBe('PAT42');
  });
});

// ── Edge cases ───────────────────────────────────────────

describe('EMX - Edge cases', () => {
  it('should handle pattern with all-zero data gracefully', () => {
    const buf = generateMinimalEMX();
    const dump = parseEmxDump(buf);

    // All patterns should parse without errors
    for (const pat of dump.patterns) {
      expect(pat.header).toBeDefined();
      expect(pat.synthParts).toBeDefined();
      expect(pat.drumParts).toBeDefined();
    }
  });

  it('should extract global parameters as raw buffer', () => {
    const buf = generateMinimalEMX();
    const dump = parseEmxDump(buf);

    expect(dump.globalParams).toBeInstanceOf(Buffer);
    expect(dump.globalParams.length).toBe(256);
  });
});

// ── SmartCard format ────────────────────────────────────

describe('EMX - SmartCard format detection', () => {
  it('should detect SmartCard format by size 1736704', () => {
    const buf = generateMinimalEMXSmartCard();
    expect(detectEmxFormat(buf)).toBe('smartcard');
  });

  it('should detect SysEx format by size 1728000', () => {
    const buf = generateMinimalEMX();
    expect(detectEmxFormat(buf)).toBe('sysex');
  });

  it('should return null for unknown sizes', () => {
    const buf = Buffer.alloc(100000, 0);
    buf.write('KORG', 0, 'ascii');
    expect(detectEmxFormat(buf)).toBe(null);
  });

  it('should return null for non-KORG buffers', () => {
    const buf = Buffer.alloc(SMARTCARD.DUMP_SIZE, 0);
    buf.write('NOPE', 0, 'ascii');
    expect(detectEmxFormat(buf)).toBe(null);
  });
});

describe('EMX - SmartCard parsing', () => {
  it('should parse a minimal SmartCard dump', () => {
    const buf = generateMinimalEMXSmartCard();
    const dump = parseEmxDump(buf);

    expect(dump.format).toBe('smartcard');
    expect(dump.fileSize).toBe(SMARTCARD.DUMP_SIZE);
    expect(dump.numPatterns).toBe(256);
    expect(dump.patterns).toHaveLength(256);
  });

  it('should parse SmartCard pattern name and tempo', () => {
    const buf = generateEMXSmartCardWithPattern('MYSC', 135.0);
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].header.name).toBe('MYSC');
    expect(dump.patterns[0].header.tempo).toBe(135.0);
  });

  it('should parse SmartCard synth part parameters', () => {
    const buf = generateEMXSmartCardWithPattern();
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].synthParts).toHaveLength(5);
    expect(dump.patterns[0].synthParts[0].oscType).toBe(5);
    expect(dump.patterns[0].synthParts[0].filterCutoff).toBe(80);
    expect(dump.patterns[0].synthParts[0].level).toBe(100);
    expect(dump.patterns[0].synthParts[0].pan).toBe(0x40);
  });

  it('should parse SmartCard drum part parameters', () => {
    const buf = generateEMXSmartCardWithPattern();
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].drumParts).toHaveLength(4);
    expect(dump.patterns[0].drumParts[0].samplePtr).toBe(0x42);
    expect(dump.patterns[0].drumParts[0].level).toBe(127);
  });

  it('should parse SmartCard step triggers', () => {
    const buf = generateEMXSmartCardWithPattern();
    const dump = parseEmxDump(buf);

    const steps = dump.patterns[0].synthParts[0].steps;
    expect(steps).toHaveLength(128);
    // 4-on-the-floor: steps 0,4,8,12 active
    expect(steps[0]).toBe(1);
    expect(steps[1]).toBe(0);
    expect(steps[4]).toBe(1);
    expect(steps[8]).toBe(1);
    expect(steps[12]).toBe(1);
  });

  it('should parse SmartCard pattern header bitfield', () => {
    const buf = generateEMXSmartCardWithPattern();
    const dump = parseEmxDump(buf);

    expect(dump.patterns[0].header.bars).toBe(3);    // 0x02 & 0x07 + 1 = 3
    expect(dump.patterns[0].header.swing).toBe(5);
    expect(dump.patterns[0].header.lastStep).toBe(15);
    expect(dump.patterns[0].header.beat).toBe(0);     // 16th
  });

  it('should list non-empty SmartCard patterns', () => {
    const buf = generateEMXSmartCardWithPattern('SCPAT');
    const dump = parseEmxDump(buf);
    const nonEmpty = listPatterns(dump);

    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].header.name).toBe('SCPAT');
  });

  it('should return format tag in SysEx dump too', () => {
    const buf = generateEMXWithPattern();
    const dump = parseEmxDump(buf);
    expect(dump.format).toBe('sysex');
  });
});
