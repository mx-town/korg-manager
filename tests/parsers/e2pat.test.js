/**
 * E2PAT Format Tests
 * Covers single pattern and all-patterns parsing, building,
 * round-trip integrity, device conversion, and split/merge.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parsePattern,
  parseAllPatterns,
  buildPattern,
  buildAllPatterns,
  createDefaultPattern,
  e2ToE2s,
  e2sToE2,
  splitPattern,
  mergePattern,
  PATTERN_SIZE,
  NUM_PATTERNS,
  ALL_FILE_SIZE,
  NUM_PARTS,
  NUM_STEPS,
  DEVICE_E2,
  DEVICE_E2S,
} = require('../../src/e2pat-format');

// ── Default pattern ──────────────────────────────────────

describe('E2PAT - Default pattern', () => {
  let pat;

  beforeAll(() => {
    pat = createDefaultPattern(DEVICE_E2);
  });

  it('should create a pattern with default header values', () => {
    expect(pat.header.tempo).toBe(120.0);
    expect(pat.header.swing).toBe(0);
    expect(pat.header.length).toBe(1);
    expect(pat.header.key).toBe(0);
    expect(pat.header.deviceId).toBe(DEVICE_E2);
  });

  it('should have 16 parts', () => {
    expect(pat.parts).toHaveLength(NUM_PARTS);
  });

  it('should have 64 steps per part', () => {
    for (const part of pat.parts) {
      expect(part.steps).toHaveLength(NUM_STEPS);
    }
  });

  it('should have all gates off by default', () => {
    for (const part of pat.parts) {
      for (const step of part.steps) {
        expect(step.gate).toBe(0);
      }
    }
  });
});

// ── Single pattern build/parse ───────────────────────────

describe('E2PAT - Single pattern round-trip', () => {
  it('should produce correct buffer size', () => {
    const buf = buildPattern(createDefaultPattern());
    expect(buf.length).toBe(PATTERN_SIZE);
  });

  it('should round-trip name and header', () => {
    const pat = createDefaultPattern(DEVICE_E2);
    pat.header.name = 'MYBEAT';
    pat.header.tempo = 140.0;
    pat.header.swing = 30;
    pat.header.key = 5;
    pat.header.scale = 1;

    const buf = buildPattern(pat);
    const parsed = parsePattern(buf, 0);

    expect(parsed.header.name).toBe('MYBEAT');
    expect(parsed.header.tempo).toBe(140.0);
    expect(parsed.header.swing).toBe(30);
    expect(parsed.header.key).toBe(5);
    expect(parsed.header.scale).toBe(1);
    expect(parsed.header.deviceId).toBe(DEVICE_E2);
  });

  it('should round-trip part parameters', () => {
    const pat = createDefaultPattern();
    pat.parts[0].params.oscType = 3;
    pat.parts[0].params.level = 110;
    pat.parts[0].params.filterCutoff = 80;

    const buf = buildPattern(pat);
    const parsed = parsePattern(buf, 0);

    expect(parsed.parts[0].params.oscType).toBe(3);
    expect(parsed.parts[0].params.level).toBe(110);
    expect(parsed.parts[0].params.filterCutoff).toBe(80);
  });

  it('should round-trip step data', () => {
    const pat = createDefaultPattern();
    pat.parts[0].steps[0] = { gate: 1, velocity: 100, note: 36, trigProb: 127, motion: [0, 0, 0, 0] };
    pat.parts[0].steps[4] = { gate: 1, velocity: 80, note: 38, trigProb: 64, motion: [100, 0, 0, 0] };
    pat.parts[0].steps[12] = { gate: 2, velocity: 90, note: 42, trigProb: 127, motion: [0, 0, 0, 0] };

    const buf = buildPattern(pat);
    const parsed = parsePattern(buf, 0);

    expect(parsed.parts[0].steps[0].gate).toBe(1);
    expect(parsed.parts[0].steps[0].velocity).toBe(100);
    expect(parsed.parts[0].steps[0].note).toBe(36);
    expect(parsed.parts[0].steps[4].trigProb).toBe(64);
    expect(parsed.parts[0].steps[4].motion[0]).toBe(100);
    expect(parsed.parts[0].steps[12].gate).toBe(2); // tie
  });

  it('should throw on buffer too small', () => {
    const tiny = Buffer.alloc(100);
    expect(() => parsePattern(tiny, 0)).toThrow('too small');
  });
});

// ── All-patterns file ────────────────────────────────────

describe('E2PAT - All-patterns file', () => {
  it('should produce correct file size', () => {
    const buf = buildAllPatterns([], DEVICE_E2);
    expect(buf.length).toBe(ALL_FILE_SIZE);
  });

  it('should start with KORG magic', () => {
    const buf = buildAllPatterns([], DEVICE_E2);
    expect(buf.toString('ascii', 0, 4)).toBe('KORG');
  });

  it('should round-trip patterns at specific indices', () => {
    const pats = [];
    pats[0] = createDefaultPattern(DEVICE_E2);
    pats[0].header.name = 'FIRST';
    pats[0].header.tempo = 130.0;

    pats[42] = createDefaultPattern(DEVICE_E2);
    pats[42].header.name = 'PAT-42';
    pats[42].header.tempo = 90.0;

    const buf = buildAllPatterns(pats, DEVICE_E2);
    const parsed = parseAllPatterns(buf);

    expect(parsed.patterns).toHaveLength(NUM_PATTERNS);
    expect(parsed.patterns[0].header.name).toBe('FIRST');
    expect(parsed.patterns[0].header.tempo).toBe(130.0);
    expect(parsed.patterns[42].header.name).toBe('PAT-42');
    expect(parsed.patterns[42].header.tempo).toBe(90.0);
  });

  it('should reject too-small file', () => {
    expect(() => parseAllPatterns(Buffer.alloc(100))).toThrow('too small');
  });

  it('should reject file with bad magic', () => {
    const buf = Buffer.alloc(ALL_FILE_SIZE, 0);
    buf.write('NOPE', 0, 'ascii');
    expect(() => parseAllPatterns(buf)).toThrow('KORG');
  });
});

// ── E2 <-> E2S conversion ────────────────────────────────

describe('E2PAT - Device conversion', () => {
  it('should convert E2 pattern to E2S', () => {
    const pat = createDefaultPattern(DEVICE_E2);
    pat.header.name = 'CONVERT';
    const e2s = e2ToE2s(pat);

    expect(e2s.header.deviceId).toBe(DEVICE_E2S);
    expect(e2s.header.name).toBe('CONVERT');
  });

  it('should convert E2S pattern to E2', () => {
    const pat = createDefaultPattern(DEVICE_E2S);
    const e2 = e2sToE2(pat);
    expect(e2.header.deviceId).toBe(DEVICE_E2);
  });

  it('should round-trip device conversion without data loss', () => {
    const original = createDefaultPattern(DEVICE_E2);
    original.header.tempo = 155.0;
    original.parts[3].params.level = 77;

    const e2s = e2ToE2s(original);
    const back = e2sToE2(e2s);

    expect(back.header.deviceId).toBe(DEVICE_E2);
    expect(back.header.tempo).toBe(155.0);
    expect(back.parts[3].params.level).toBe(77);
  });
});

// ── Split / Merge ────────────────────────────────────────

describe('E2PAT - Split/Merge', () => {
  let allBuf;

  beforeAll(() => {
    const pats = [];
    pats[10] = createDefaultPattern(DEVICE_E2);
    pats[10].header.name = 'SPLIT-ME';
    pats[10].header.tempo = 175.0;
    allBuf = buildAllPatterns(pats, DEVICE_E2);
  });

  it('should extract a single pattern by index', () => {
    const splitBuf = splitPattern(allBuf, 10);
    expect(splitBuf.length).toBe(PATTERN_SIZE);

    const parsed = parsePattern(splitBuf, 0);
    expect(parsed.header.name).toBe('SPLIT-ME');
    expect(parsed.header.tempo).toBe(175.0);
  });

  it('should reject out-of-range index', () => {
    expect(() => splitPattern(allBuf, -1)).toThrow('out of range');
    expect(() => splitPattern(allBuf, 250)).toThrow('out of range');
  });

  it('should merge a pattern into an all-file', () => {
    const pat = createDefaultPattern(DEVICE_E2);
    pat.header.name = 'MERGED';
    const patBuf = buildPattern(pat);

    const copy = Buffer.from(allBuf);
    mergePattern(copy, 100, patBuf);

    const parsed = parseAllPatterns(copy);
    expect(parsed.patterns[100].header.name).toBe('MERGED');
    // Original pattern should still be there
    expect(parsed.patterns[10].header.name).toBe('SPLIT-ME');
  });

  it('should reject merge with wrong-size buffer', () => {
    expect(() => mergePattern(allBuf, 0, Buffer.alloc(100))).toThrow('size');
  });
});
