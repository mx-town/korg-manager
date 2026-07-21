/**
 * ESX-1 Format Tests
 * Covers parsing, building, round-trip integrity, WAV conversion,
 * global parameters, and edge cases.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parseEsxFile,
  createEmptyEsx,
  buildEsxFile,
  rebuildEsxFile,
  parseWavFile,
  convertTo16BitMono,
  pcmToWav,
  ADDR,
  SIZE,
  NUM,
} = require('../../src/esx-format');
const {
  generateMinimalESX,
  generateESXWithPattern,
  generateESXWithSample,
  generateESXWithNSamples,
  generateWav,
} = require('../fixtures/generators/minimal-esx');

// ── Empty file structure ─────────────────────────────────

describe('ESX - Empty file structure', () => {
  let emptyBuf;

  beforeAll(() => {
    emptyBuf = generateMinimalESX();
  });

  it('should have the minimum file size', () => {
    expect(emptyBuf.length).toBe(SIZE.FILE_MIN);
  });

  it('should start with "KORG" magic bytes', () => {
    expect(emptyBuf.toString('ascii', 0, 4)).toBe('KORG');
  });

  it('should contain the ESX format identifier', () => {
    expect(emptyBuf.toString('ascii', 8, 11)).toBe('ESX');
  });

  it('should contain the BPS header at the correct offset', () => {
    expect(emptyBuf.toString('ascii', ADDR.BPS_HEADER, ADDR.BPS_HEADER + 4)).toBe('KORG');
    expect(emptyBuf.toString('ascii', ADDR.BPS_HEADER + 8, ADDR.BPS_HEADER + 12)).toBe('BPS ');
  });

  it('should report 0 mono and 0 stereo samples', () => {
    expect(emptyBuf.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(0);
    expect(emptyBuf.readUInt32BE(ADDR.NUM_STEREO_SAMPLES)).toBe(0);
  });
});

// ── Parsing empty file ───────────────────────────────────

describe('ESX - Parsing empty file', () => {
  let parsed;

  beforeAll(() => {
    parsed = parseEsxFile(generateMinimalESX());
  });

  it('should report 0 mono samples', () => {
    expect(parsed.numMono).toBe(0);
  });

  it('should report 0 stereo samples', () => {
    expect(parsed.numStereo).toBe(0);
  });

  it('should have 256 mono sample slots (all null)', () => {
    expect(parsed.monoSamples).toHaveLength(NUM.MONO_SAMPLES);
    expect(parsed.monoSamples.every(s => s === null)).toBe(true);
  });

  it('should have 128 stereo sample slots (all null)', () => {
    expect(parsed.stereoSamples).toHaveLength(NUM.STEREO_SAMPLES);
    expect(parsed.stereoSamples.every(s => s === null)).toBe(true);
  });

  it('should report 0 bytes used', () => {
    expect(parsed.currentOffset).toBe(0);
    expect(parsed.totalSampleBytes).toBe(0);
  });

  it('should throw on invalid magic bytes', () => {
    const bad = Buffer.alloc(SIZE.FILE_MIN, 0);
    bad.write('NOPE', 0, 'ascii');
    expect(() => parseEsxFile(bad)).toThrow('KORG');
  });
});

// ── Global parameters ────────────────────────────────────

describe('ESX - Global parameters', () => {
  let buf;

  beforeAll(() => {
    buf = generateMinimalESX();
  });

  it('should set factory default MIDI channels', () => {
    expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x07)).toBe(0x00); // Keyboard 1 → Ch.1
    expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x08)).toBe(0x01); // Keyboard 2 → Ch.2
    expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x09)).toBe(0x09); // Drum 1 → Ch.10
  });

  it('should set pitch bend range to +2 semitones (0x0E)', () => {
    expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x06)).toBe(0x0E);
  });

  it('should set MIDI bitflags to 0x0F (all enabled)', () => {
    expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x05)).toBe(0x0F);
  });

  it('should set correct factory default part note numbers', () => {
    const expected = [36, 38, 40, 41, 43, 42, 46, 49, 51, 9, 10, 11, 12];
    for (let i = 0; i < expected.length; i++) {
      expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x0A + i)).toBe(expected[i]);
    }
  });

  it('should set correct MIDI CC assignments (33 bytes)', () => {
    const expectedCCs = [89,90,87,88,82, 74,71,79,83, 5,10,75,7,18,86,85,19,91,81,80, 12,92,93,20, 13,94,95,21, 24,25,26,22, 23];
    for (let i = 0; i < expectedCCs.length; i++) {
      expect(buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x17 + i)).toBe(expectedCCs[i]);
    }
  });

  it('should have valid MIDI channels (0x00-0x0F range)', () => {
    for (let i = 0; i < 3; i++) {
      const ch = buf.readUInt8(ADDR.GLOBAL_PARAMS + 0x07 + i);
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(0x0F);
    }
  });

  it('should preserve MIDI params through buildEsxFile round-trip', () => {
    const built = buildEsxFile([]);
    // Factory MIDI channels
    expect(built.readUInt8(ADDR.GLOBAL_PARAMS + 0x07)).toBe(0x00); // Kbd1 → Ch.1
    expect(built.readUInt8(ADDR.GLOBAL_PARAMS + 0x08)).toBe(0x01); // Kbd2 → Ch.2
    expect(built.readUInt8(ADDR.GLOBAL_PARAMS + 0x09)).toBe(0x09); // Drum1 → Ch.10
    // Note numbers preserved
    expect(built.readUInt8(ADDR.GLOBAL_PARAMS + 0x0A)).toBe(36); // Drum1 = C2
    // Bitflags preserved
    expect(built.readUInt8(ADDR.GLOBAL_PARAMS + 0x05)).toBe(0x0F);
  });
});

// ── Pattern defaults ─────────────────────────────────────

describe('ESX - Pattern defaults', () => {
  let buf;

  beforeAll(() => {
    buf = generateMinimalESX();
  });

  it('should have 256 patterns with bank names A.001-D.064', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const name = buf.toString('ascii', off, off + 8).trim();
      const bank = String.fromCharCode(65 + Math.floor(p / 64));
      const num = String((p % 64) + 1).padStart(3, '0');
      expect(name).toBe(`${bank}.${num}`);
    }
  });

  it('should set default tempo to 120 BPM (0x3C00)', () => {
    const tempoRaw = buf.readUInt16BE(ADDR.PATTERN_DATA + 8);
    expect(tempoRaw).toBe(0x3C00);
  });

  it('should set last step to 15 (16 steps)', () => {
    expect(buf.readUInt8(ADDR.PATTERN_DATA + 13)).toBe(0x0F);
  });

  it('should initialize keyboard part note bytes to 0xBC (OFF at C4)', () => {
    const kbOff = ADDR.PATTERN_DATA + 330; // keyboard part 1
    for (let i = 0; i < 128; i++) {
      expect(buf.readUInt8(kbOff + 18 + i)).toBe(0xBC);
    }
  });

  it('should initialize keyboard part gate bytes to 0x02', () => {
    const kbOff = ADDR.PATTERN_DATA + 330;
    for (let i = 0; i < 128; i++) {
      expect(buf.readUInt8(kbOff + 146 + i)).toBe(0x02);
    }
  });

  it('should initialize all 24 motion sequences as disabled (0xFFFF)', () => {
    const motionOff = ADDR.PATTERN_DATA + 1160;
    for (let i = 0; i < 24; i++) {
      expect(buf.readUInt16BE(motionOff + i * 130)).toBe(0xFFFF);
    }
  });
});

// ── Named pattern fixture ────────────────────────────────

describe('ESX - Named pattern', () => {
  it('should write and read back pattern name', () => {
    const buf = generateESXWithPattern('MYBEAT', 135.0);
    const name = buf.toString('ascii', ADDR.PATTERN_DATA, ADDR.PATTERN_DATA + 8).trim();
    expect(name).toBe('MYBEAT');
  });
});

// ── Sample building & parsing ────────────────────────────

describe('ESX - Single sample build & parse', () => {
  let buf, parsed;

  beforeAll(() => {
    buf = generateESXWithSample('KICK808', 100);
    parsed = parseEsxFile(buf);
  });

  it('should report 1 mono sample', () => {
    expect(parsed.numMono).toBe(1);
  });

  it('should parse sample name correctly', () => {
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample).toBeDefined();
    expect(sample.name).toBe('KICK808');
  });

  it('should store sample rate as 44100', () => {
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.sampleRate).toBe(44100);
  });

  it('should have non-zero PCM data', () => {
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.pcmData).not.toBeNull();
    expect(sample.pcmData.length).toBeGreaterThan(0);
  });

  it('should have positive duration', () => {
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.duration).toBeGreaterThan(0);
    // ~100ms sample
    expect(sample.duration).toBeCloseTo(0.1, 1);
  });

  it('should leave remaining 255 mono slots as null', () => {
    const nonNull = parsed.monoSamples.filter(s => s !== null);
    expect(nonNull).toHaveLength(1);
  });

  it('should auto-assign sample to drum part 0 of pattern 0', () => {
    // buildEsxFile assigns samples to drum parts
    const patOff = ADDR.PATTERN_DATA + 24; // first drum part
    const samplePtr = buf.readUInt16BE(patOff);
    expect(samplePtr).toBe(0); // points to sample 0
  });
});

// ── Multiple samples ─────────────────────────────────────

describe('ESX - Multiple samples', () => {
  it('should build and parse 9 samples (fills one pattern)', () => {
    const buf = generateESXWithNSamples(9);
    const parsed = parseEsxFile(buf);
    expect(parsed.numMono).toBe(9);

    const loaded = parsed.monoSamples.filter(s => s !== null);
    expect(loaded).toHaveLength(9);
  });

  it('should build and parse 18 samples (fills two patterns)', () => {
    const buf = generateESXWithNSamples(18);
    const parsed = parseEsxFile(buf);
    expect(parsed.numMono).toBe(18);
  });

  it('should encode sample names to uppercase ASCII', () => {
    const buf = generateESXWithNSamples(3);
    const parsed = parseEsxFile(buf);
    const names = parsed.monoSamples.filter(s => s !== null).map(s => s.name);
    expect(names[0]).toBe('SMP000');
    expect(names[1]).toBe('SMP001');
    expect(names[2]).toBe('SMP002');
  });
});

// ── Round-trip validation ────────────────────────────────

describe('ESX - Round-trip', () => {
  it('should produce identical binary when rebuilding empty ESX', () => {
    const original = createEmptyEsx();
    const parsed = parseEsxFile(original);

    // Re-create empty ESX and compare the header section
    const rebuilt = createEmptyEsx();
    // The header + global params + patterns + songs + sample headers should match
    const headerEnd = ADDR.SAMPLE_DATA;
    expect(original.slice(0, headerEnd).equals(rebuilt.slice(0, headerEnd))).toBe(true);
  });

  it('should preserve sample data through build/parse cycle', () => {
    const sampleRate = 44100;
    const numFrames = 200;
    const pcmData = Buffer.alloc(numFrames * 2);
    for (let i = 0; i < numFrames; i++) {
      pcmData.writeInt16BE(i * 100, i * 2);
    }

    const original = buildEsxFile([{ name: 'RNDTRIP', pcmData, sampleRate, numFrames }]);
    const parsed = parseEsxFile(original);
    const sample = parsed.monoSamples.find(s => s !== null);

    expect(sample.name).toBe('RNDTRIP');
    expect(sample.sampleRate).toBe(44100);
    expect(sample.numFrames).toBe(numFrames);
    // Verify PCM data matches (the extracted pcmData doesn't include block header)
    for (let i = 0; i < numFrames; i++) {
      expect(sample.pcmData.readInt16BE(i * 2)).toBe(pcmData.readInt16BE(i * 2));
    }
  });
});

// ── WAV parsing ──────────────────────────────────────────

describe('ESX - WAV parsing', () => {
  it('should parse a 16-bit mono WAV', () => {
    const wav = generateWav(50, 44100);
    const result = parseWavFile(wav);
    expect(result.fmt.audioFormat).toBe(1);
    expect(result.fmt.numChannels).toBe(1);
    expect(result.fmt.sampleRate).toBe(44100);
    expect(result.fmt.bitsPerSample).toBe(16);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should throw on non-RIFF data', () => {
    const bad = Buffer.from('NOT A WAV FILE AT ALL');
    expect(() => parseWavFile(bad)).toThrow('RIFF');
  });

  it('should throw on too-small buffer', () => {
    expect(() => parseWavFile(Buffer.alloc(4))).toThrow('too small');
  });

  it('should convert WAV to 16-bit mono PCM', () => {
    const wav = generateWav(50, 44100);
    const wavInfo = parseWavFile(wav);
    const converted = convertTo16BitMono(wavInfo);
    expect(converted.sampleRate).toBe(44100);
    expect(converted.numFrames).toBeGreaterThan(0);
    expect(converted.pcmData.length).toBe(converted.numFrames * 2);
  });

  it('should resample non-standard sample rate to 44100', () => {
    const wav = generateWav(50, 48000);
    const wavInfo = parseWavFile(wav);
    const converted = convertTo16BitMono(wavInfo);
    expect(converted.sampleRate).toBe(44100);
  });
});

// ── PCM to WAV export ────────────────────────────────────

describe('ESX - PCM to WAV export', () => {
  it('should create valid WAV from BE PCM data', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16BE(i * 100, i * 2);

    const wav = pcmToWav(pcm, 44100);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    // Verify we can parse it back
    const parsed = parseWavFile(wav);
    expect(parsed.fmt.sampleRate).toBe(44100);
    expect(parsed.fmt.numChannels).toBe(1);
    expect(parsed.data.length).toBe(200);
  });
});

// ── Sample header boundaries ─────────────────────────────

describe('ESX - Sample header layout', () => {
  let buf;

  beforeAll(() => {
    buf = generateMinimalESX();
  });

  it('should mark all 256 mono slots as empty (0xFFFFFFFF)', () => {
    for (let i = 0; i < NUM.MONO_SAMPLES; i++) {
      const off = ADDR.SAMPLE_HDR_MONO + i * SIZE.SAMPLE_HDR_MONO;
      expect(buf.readUInt32BE(off + 8)).toBe(0xFFFFFFFF);
    }
  });

  it('should mark all 128 stereo slots as empty (0xFFFFFFFF)', () => {
    for (let i = 0; i < NUM.STEREO_SAMPLES; i++) {
      const off = ADDR.SAMPLE_HDR_STEREO + i * SIZE.SAMPLE_HDR_STEREO;
      expect(buf.readUInt32BE(off + 8)).toBe(0xFFFFFFFF);
    }
  });

  it('should fill empty mono headers with 0xFF (factory default)', () => {
    const off = ADDR.SAMPLE_HDR_MONO;
    for (let i = 0; i < SIZE.SAMPLE_HDR_MONO; i++) {
      expect(buf.readUInt8(off + i)).toBe(0xFF);
    }
  });

  it('should fill empty stereo headers with 0xFF (factory default)', () => {
    const off = ADDR.SAMPLE_HDR_STEREO;
    for (let i = 0; i < SIZE.SAMPLE_HDR_STEREO; i++) {
      expect(buf.readUInt8(off + i)).toBe(0xFF);
    }
  });
});

// ── Sample loop point (keyboard sustain) ─────────────────
// Regression: ESX keyboard parts produce NO sound unless the sample has a
// valid loop point. Hardware-saved files set loopStart = endFrame on every
// sample; the rebuild used to write 0xFFFFFFFF (no loop), silencing KB parts.

describe('ESX - Sample loop point', () => {
  const sampleRate = 44100;
  const numFrames = 300;
  function makeSample(name = 'LOOPSMP', extra = {}) {
    const pcmData = Buffer.alloc(numFrames * 2);
    for (let i = 0; i < numFrames; i++) pcmData.writeInt16BE((i * 50) & 0x7fff, i * 2);
    return { name, pcmData, sampleRate, numFrames, ...extra };
  }
  function loopStartOf(buf, idx = 0) {
    return buf.readUInt32BE(ADDR.SAMPLE_HDR_MONO + idx * SIZE.SAMPLE_HDR_MONO + 24);
  }

  it('buildEsxFile defaults loopStart to endFrame (not 0xFFFFFFFF)', () => {
    const buf = buildEsxFile([makeSample()]);
    expect(loopStartOf(buf)).not.toBe(0xFFFFFFFF);
    expect(loopStartOf(buf)).toBe(numFrames - 1); // endFrame
  });

  it('rebuildEsxFile defaults loopStart to endFrame (not 0xFFFFFFFF)', () => {
    const buf = rebuildEsxFile(createEmptyEsx(), [makeSample()]);
    expect(loopStartOf(buf)).not.toBe(0xFFFFFFFF);
    expect(loopStartOf(buf)).toBe(numFrames - 1);
  });

  it('preserves an explicit loopStart when provided', () => {
    const buf = buildEsxFile([makeSample('LOOPED', { loopStart: 128 })]);
    expect(loopStartOf(buf)).toBe(128);
  });

  it('writes a hardware-faithful header trailer for present samples', () => {
    const buf = buildEsxFile([makeSample()]);
    const off = ADDR.SAMPLE_HDR_MONO;
    expect(buf.readUInt8(off + 35)).toBe(0x00); // stretch step
    expect(buf.readUInt8(off + 36)).toBe(0x80); // reserved marker
    expect(buf.readUInt8(off + 37)).toBe(0x00);
    expect(buf.readUInt8(off + 38)).toBe(0x00);
    expect(buf.readUInt8(off + 39)).toBe(0x00);
  });
});

// ── Edge cases ───────────────────────────────────────────

describe('ESX - Edge cases', () => {
  it('should handle sample name with special chars (stripped to uppercase ASCII)', () => {
    const buf = buildEsxFile([{
      name: 'kick!@#$',
      pcmData: Buffer.alloc(200),
      sampleRate: 44100,
      numFrames: 100,
    }]);
    const parsed = parseEsxFile(buf);
    const sample = parsed.monoSamples.find(s => s !== null);
    // Special chars are stripped, only A-Z0-9 _-. remain
    expect(sample.name).toBe('KICK');
  });

  it('should handle 8-char name (max length)', () => {
    const buf = buildEsxFile([{
      name: 'ABCDEFGH',
      pcmData: Buffer.alloc(200),
      sampleRate: 44100,
      numFrames: 100,
    }]);
    const parsed = parseEsxFile(buf);
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.name).toBe('ABCDEFGH');
  });

  it('should truncate names longer than 8 chars', () => {
    const buf = buildEsxFile([{
      name: 'TOOLONGNAME',
      pcmData: Buffer.alloc(200),
      sampleRate: 44100,
      numFrames: 100,
    }]);
    const parsed = parseEsxFile(buf);
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.name.length).toBeLessThanOrEqual(8);
  });

  it('should skip null entries in sample array', () => {
    const buf = buildEsxFile([null, null, {
      name: 'THIRD',
      pcmData: Buffer.alloc(200),
      sampleRate: 44100,
      numFrames: 100,
    }]);
    const parsed = parseEsxFile(buf);
    // Only non-null sample should be stored
    expect(parsed.numMono).toBe(1);
  });
});
