/**
 * The empty state of a newly built .esx must be byte-identical to what the
 * ESX-1 hardware itself writes. Fixtures were extracted from a real factory
 * file by extract-init-fixtures.js — see that script for provenance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createEmptyEsx, ADDR, NUM } = require('../../src/esx-format.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const INIT_PATTERN = fs.readFileSync(path.join(FIXTURES, 'esx-init-pattern.bin'));

describe('ESX init state - pattern', () => {
  let buf;

  beforeAll(() => {
    buf = createEmptyEsx();
  });

  it('fixture is one pattern block', () => {
    expect(INIT_PATTERN).toHaveLength(4280);
  });

  it('every one of the 256 patterns matches the hardware init block', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const block = buf.slice(off, off + 4280);
      const firstDiff = block.findIndex((b, i) => b !== INIT_PATTERN[i]);
      expect(
        firstDiff,
        `pattern ${p} differs at byte +${firstDiff}: got 0x${block[firstDiff]?.toString(16)}, want 0x${INIT_PATTERN[firstDiff]?.toString(16)}`
      ).toBe(-1);
    }
  });

  it('names every pattern "Init"', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      expect(buf.toString('ascii', off, off + 8)).toBe('Init    ');
    }
  });

  it('writes 0x00 in both keyboard slice bytes', () => {
    const off = ADDR.PATTERN_DATA;
    expect(buf[off + 332]).toBe(0x00); // KB1 +2
    expect(buf[off + 606]).toBe(0x00); // KB2 +2
  });
});
