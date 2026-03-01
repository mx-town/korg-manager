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
  DUMP_SIZE,
  NUM_PATTERNS,
  PATTERN_SIZE,
  NUM_SYNTH_PARTS,
  NUM_DRUM_PARTS,
  ADDR,
  PAT,
  SYNTH,
  DRUM,
} = require('../../src/emx-format');
const {
  generateMinimalEMX,
  generateEMXWithPattern,
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
    expect(dump.patterns).toHaveLength(NUM_PATTERNS);
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
