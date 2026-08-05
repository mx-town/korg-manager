/**
 * The empty state of a newly built .esx must be byte-identical to what the
 * ESX-1 hardware itself writes. Fixtures were extracted from a real factory
 * file by extract-init-fixtures.js — see that script for provenance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createEmptyEsx, buildEsxFile, rebuildEsxFile, parseEsxFile, ADDR, NUM } = require('../../src/esx-format.js');

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

  // Bytes 0-7 are the pattern name and are compared separately: the fixture comes
  // from a Korg factory bank, which names its empty patterns "Init". Banks the
  // ESX-1 itself saves leave untouched patterns blank, and that is what we write.
  it('every one of the 256 patterns matches the hardware init block from byte 8 on', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const block = buf.slice(off + 8, off + 4280);
      const firstDiff = block.findIndex((b, i) => b !== INIT_PATTERN[i + 8]);
      expect(
        firstDiff,
        `pattern ${p} differs at byte +${firstDiff + 8}: got 0x${block[firstDiff]?.toString(16)}, want 0x${INIT_PATTERN[firstDiff + 8]?.toString(16)}`
      ).toBe(-1);
    }
  });

  it('leaves every pattern name blank, like a hardware-saved user bank', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      expect(buf.toString('ascii', off, off + 8)).toBe('        ');
    }
  });

  it('writes 0x00 in both keyboard slice bytes', () => {
    const off = ADDR.PATTERN_DATA;
    expect(buf[off + 332]).toBe(0x00); // KB1 +2
    expect(buf[off + 606]).toBe(0x00); // KB2 +2
  });
});

const EMPTY_SONG = fs.readFileSync(path.join(FIXTURES, 'esx-empty-song.bin'));

describe('ESX init state - song', () => {
  let buf;

  beforeAll(() => {
    buf = createEmptyEsx();
  });

  it('fixture is one song block', () => {
    expect(EMPTY_SONG).toHaveLength(528);
  });

  it('every one of the 64 songs matches the hardware empty song', () => {
    for (let s = 0; s < NUM.SONGS; s++) {
      const off = ADDR.SONG_DATA + s * 528;
      const block = buf.slice(off, off + 528);
      const firstDiff = block.findIndex((b, i) => b !== EMPTY_SONG[i]);
      expect(
        firstDiff,
        `song ${s} differs at byte +${firstDiff}: got 0x${block[firstDiff]?.toString(16)}, want 0x${EMPTY_SONG[firstDiff]?.toString(16)}`
      ).toBe(-1);
    }
  });

  it('pads song names with spaces, not NULs', () => {
    const off = ADDR.SONG_DATA;
    expect(buf.toString('ascii', off, off + 8)).toBe('        ');
  });
});

/** 12 tiny mono samples, enough to have triggered 2 auto-demo patterns before. */
function tinySamples(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pcmData = Buffer.alloc(200);
    for (let f = 0; f < 100; f++) pcmData.writeInt16BE(f * 10, f * 2);
    out.push({
      name: `SMP${String(i).padStart(3, '0')}`,
      pcmData,
      sampleRate: 44100,
      numFrames: 100,
    });
  }
  return out;
}

describe('ESX init state - buildEsxFile leaves patterns alone', () => {
  let built;

  beforeAll(() => {
    built = buildEsxFile(tinySamples(12));
  });

  it('writes no demo patterns — all 256 stay at the hardware init block', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      expect(built.toString('ascii', off, off + 8)).toBe('        ');
      const block = built.slice(off + 8, off + 4280);   // name compared above
      const firstDiff = block.findIndex((b, i) => b !== INIT_PATTERN[i + 8]);
      expect(
        firstDiff,
        `pattern ${p} differs at byte +${firstDiff + 8}`
      ).toBe(-1);
    }
  });

  it('assigns no samples to drum parts', () => {
    const off = ADDR.PATTERN_DATA;
    for (let d = 0; d < 9; d++) {
      expect(built.readUInt16BE(off + 24 + d * 34)).toBe(0);
    }
  });

  it('still writes the sample data itself', () => {
    expect(built.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(12);
  });
});

describe('ESX init state - rebuildEsxFile preserves everything', () => {
  it('changes no pattern, song or global byte', () => {
    const original = buildEsxFile(tinySamples(12));
    const parsed = parseEsxFile(original);
    const rebuilt = rebuildEsxFile(original, parsed.monoSamples);

    const patternBytes = 256 * 4280;
    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.PATTERN_DATA, ADDR.PATTERN_DATA + patternBytes),
        original.slice(ADDR.PATTERN_DATA, ADDR.PATTERN_DATA + patternBytes)
      )
    ).toBe(0);

    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.SONG_DATA, ADDR.SONG_DATA + 64 * 528),
        original.slice(ADDR.SONG_DATA, ADDR.SONG_DATA + 64 * 528)
      )
    ).toBe(0);

    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + 192),
        original.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + 192)
      )
    ).toBe(0);
  });
});
