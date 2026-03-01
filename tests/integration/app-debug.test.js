/**
 * ESX Integration & Debug Tests
 * End-to-end workflows that exercise multiple modules together:
 * round-trip integrity, sample processing pipelines, memory enforcement,
 * BPS checksum validation, and WAV ↔ ESX conversion chains.
 *
 * NOTE: Unit-level tests for individual fields (pattern defaults, MIDI CCs,
 * sample headers, WAV parsing) live in tests/parsers/esx.test.js.
 * This file focuses on cross-cutting integration scenarios.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parseEsxFile,
  createEmptyEsx,
  buildEsxFile,
  parseWavFile,
  convertTo16BitMono,
  pcmToWav,
  ADDR,
  SIZE,
  NUM,
} = require('../../src/esx-format');
const {
  generateMinimalESX,
  generateESXWithSample,
  generateESXWithNSamples,
  generateWav,
} = require('../fixtures/generators/minimal-esx');

// ── Round-trip integrity ─────────────────────────────────

describe('Integration - ESX round-trip integrity', () => {
  it('should preserve MIDI channels through build → parse → rebuild cycle', () => {
    const original = createEmptyEsx();
    const parsed = parseEsxFile(original);
    const rebuilt = buildEsxFile(parsed.monoSamples.filter(s => s !== null));
    const reparsed = parseEsxFile(rebuilt);

    // Both cycles should yield 0 samples, consistent structure
    expect(reparsed.numMono).toBe(0);
    expect(reparsed.numStereo).toBe(0);

    // MIDI channels should be Ch1 in both passes
    expect(rebuilt.readUInt8(ADDR.GLOBAL_PARAMS + 0x07)).toBe(0x00);
    expect(rebuilt.readUInt8(ADDR.GLOBAL_PARAMS + 0x08)).toBe(0x00);
    expect(rebuilt.readUInt8(ADDR.GLOBAL_PARAMS + 0x09)).toBe(0x00);
  });

  it('should maintain file size consistency for empty ESX', () => {
    const empty = createEmptyEsx();
    expect(empty.length).toBe(SIZE.FILE_MIN);
  });

  it('should preserve sample PCM data bit-perfectly through build/parse', () => {
    const sampleRate = 44100;
    const numFrames = 500;
    const pcmData = Buffer.alloc(numFrames * 2);

    // Write a recognizable pattern (ascending ramp)
    for (let i = 0; i < numFrames; i++) {
      pcmData.writeInt16BE(((i * 131) % 65536) - 32768, i * 2);
    }

    const esx = buildEsxFile([{ name: 'PCMTEST', pcmData, sampleRate, numFrames }]);
    const parsed = parseEsxFile(esx);
    const sample = parsed.monoSamples.find(s => s !== null);

    expect(sample).toBeDefined();
    expect(sample.numFrames).toBe(numFrames);

    // Verify every frame matches
    for (let i = 0; i < numFrames; i++) {
      expect(sample.pcmData.readInt16BE(i * 2)).toBe(pcmData.readInt16BE(i * 2));
    }
  });

  it('should preserve all sample names through multi-sample round-trip', () => {
    const names = ['KICK', 'SNARE', 'HIHAT', 'CLAP', 'TOM', 'PERC', 'BASS', 'LEAD', 'PAD'];
    const samples = names.map(name => ({
      name,
      pcmData: Buffer.alloc(200),
      sampleRate: 44100,
      numFrames: 100,
    }));

    const esx = buildEsxFile(samples);
    const parsed = parseEsxFile(esx);
    const loaded = parsed.monoSamples.filter(s => s !== null);

    expect(loaded).toHaveLength(names.length);
    for (let i = 0; i < names.length; i++) {
      expect(loaded[i].name).toBe(names[i]);
    }
  });
});

// ── WAV → ESX → WAV conversion chain ────────────────────

describe('Integration - WAV ↔ ESX conversion chain', () => {
  it('should survive WAV → parse → convert → build → parse → export → parse chain', () => {
    // Step 1: Generate a WAV
    const wav = generateWav(100, 44100);

    // Step 2: Parse WAV
    const wavInfo = parseWavFile(wav);
    expect(wavInfo.fmt.sampleRate).toBe(44100);

    // Step 3: Convert to ESX-compatible format
    const converted = convertTo16BitMono(wavInfo);
    expect(converted.sampleRate).toBe(44100);
    expect(converted.numFrames).toBeGreaterThan(0);

    // Step 4: Build ESX file
    const esxBuf = buildEsxFile([{
      name: 'WAVTEST',
      pcmData: converted.pcmData,
      sampleRate: converted.sampleRate,
      numFrames: converted.numFrames,
    }]);

    // Step 5: Parse ESX back
    const parsed = parseEsxFile(esxBuf);
    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample).toBeDefined();
    expect(sample.name).toBe('WAVTEST');

    // Step 6: Export back to WAV
    const exportedWav = pcmToWav(sample.pcmData, sample.sampleRate);

    // Step 7: Parse the exported WAV
    const reParsed = parseWavFile(exportedWav);
    expect(reParsed.fmt.sampleRate).toBe(44100);
    expect(reParsed.fmt.numChannels).toBe(1);
    expect(reParsed.fmt.bitsPerSample).toBe(16);
    expect(reParsed.data.length).toBe(sample.numFrames * 2);
  });

  it('should resample 48kHz WAV and build valid ESX', () => {
    const wav = generateWav(50, 48000);
    const wavInfo = parseWavFile(wav);
    const converted = convertTo16BitMono(wavInfo);

    // Should resample to 44100
    expect(converted.sampleRate).toBe(44100);

    const esxBuf = buildEsxFile([{
      name: 'RESAMP',
      pcmData: converted.pcmData,
      sampleRate: converted.sampleRate,
      numFrames: converted.numFrames,
    }]);

    const parsed = parseEsxFile(esxBuf);
    expect(parsed.numMono).toBe(1);
    expect(parsed.monoSamples.find(s => s !== null).sampleRate).toBe(44100);
  });
});

// ── Sample capacity & memory limits ──────────────────────

describe('Integration - Sample capacity & memory', () => {
  it('should handle maximum drum kit (9 samples per pattern)', () => {
    const buf = generateESXWithNSamples(9);
    const parsed = parseEsxFile(buf);

    expect(parsed.numMono).toBe(9);
    expect(parsed.totalSampleBytes).toBeGreaterThan(0);
    expect(parsed.totalSampleBytes).toBeLessThanOrEqual(SIZE.MAX_SAMPLE_BYTES);
  });

  it('should handle samples spanning two patterns (18 samples)', () => {
    const buf = generateESXWithNSamples(18);
    const parsed = parseEsxFile(buf);

    expect(parsed.numMono).toBe(18);
    // All samples should be recoverable
    const loaded = parsed.monoSamples.filter(s => s !== null);
    expect(loaded).toHaveLength(18);
  });

  it('should handle stress test with 50 samples', () => {
    const buf = generateESXWithNSamples(50);
    const parsed = parseEsxFile(buf);

    expect(parsed.numMono).toBe(50);
    expect(parsed.totalSampleBytes).toBeLessThanOrEqual(SIZE.MAX_SAMPLE_BYTES);

    // Verify no name collisions
    const names = parsed.monoSamples.filter(s => s !== null).map(s => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(50);
  });

  it('should report correct memory usage percentage', () => {
    // Use a 2-second sample so percentage is large enough to survive toFixed(1)
    const buf = generateESXWithSample('MEMTEST', 2000);
    const parsed = parseEsxFile(buf);

    const usedPct = parseFloat(parsed.usedPercent);
    expect(usedPct).toBeGreaterThan(0);
    expect(usedPct).toBeLessThan(5); // 2s sample is still small vs 25MB max
  });

  it('should enforce max sample bytes constant', () => {
    // MAX_SAMPLE_BYTES = 0xC00000 * 2 = ~25MB
    expect(SIZE.MAX_SAMPLE_BYTES).toBe(0xC00000 * 2);
  });

  it('should report 0 bytes used for empty file', () => {
    const parsed = parseEsxFile(createEmptyEsx());
    expect(parsed.totalSampleBytes).toBe(0);
    expect(parseFloat(parsed.usedPercent)).toBe(0);
  });
});

// ── BPS header & checksum ────────────────────────────────

describe('Integration - BPS header & checksum', () => {
  it('should write valid BPS header with 0 samples', () => {
    const empty = createEmptyEsx();

    expect(empty.toString('ascii', ADDR.BPS_HEADER, ADDR.BPS_HEADER + 4)).toBe('KORG');
    expect(empty.toString('ascii', ADDR.BPS_HEADER + 8, ADDR.BPS_HEADER + 12)).toBe('BPS ');
    expect(empty.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(0);
    expect(empty.readUInt32BE(ADDR.NUM_STEREO_SAMPLES)).toBe(0);
    expect(empty.readUInt32BE(ADDR.CURRENT_OFFSET)).toBe(0);
  });

  it('should update BPS sample count when samples are added', () => {
    const buf = generateESXWithNSamples(5);

    expect(buf.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(5);
    expect(buf.readUInt32BE(ADDR.NUM_STEREO_SAMPLES)).toBe(0);
    expect(buf.readUInt32BE(ADDR.CURRENT_OFFSET)).toBeGreaterThan(0);
  });

  it('should have non-zero current offset when samples exist', () => {
    const buf = generateESXWithSample('OFFTEST', 200);
    const offset = buf.readUInt32BE(ADDR.CURRENT_OFFSET);

    expect(offset).toBeGreaterThan(0);
    // Offset should include 16-byte block header + PCM data
    // ~200ms at 44100Hz = ~8820 frames × 2 bytes = ~17640 + 16 header
    expect(offset).toBeGreaterThan(17000);
  });

  it('should maintain consistent BPS counts through round-trip', () => {
    const original = generateESXWithNSamples(7);
    const origCount = original.readUInt32BE(ADDR.NUM_MONO_SAMPLES);
    const origOffset = original.readUInt32BE(ADDR.CURRENT_OFFSET);

    const parsed = parseEsxFile(original);
    const rebuilt = buildEsxFile(parsed.monoSamples.filter(s => s !== null));

    expect(rebuilt.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(origCount);
    // Offset may differ slightly due to rebuild, but sample count must match
    expect(rebuilt.readUInt32BE(ADDR.CURRENT_OFFSET)).toBeGreaterThan(0);
  });
});

// ── Pattern data integrity ───────────────────────────────

describe('Integration - Pattern data after sample assignment', () => {
  it('should assign first 9 samples to drum parts in pattern 0', () => {
    const buf = generateESXWithNSamples(9);

    // Each drum part is 34 bytes starting at pattern offset + 24
    for (let i = 0; i < 9; i++) {
      const drumPartOff = ADDR.PATTERN_DATA + 24 + i * 34;
      const samplePtr = buf.readUInt16BE(drumPartOff);
      expect(samplePtr).toBe(i); // sample index i
    }
  });

  it('should assign samples 9-17 to drum parts in pattern 1', () => {
    const buf = generateESXWithNSamples(18);
    const pat1Off = ADDR.PATTERN_DATA + 4280; // pattern 1

    for (let i = 0; i < 9; i++) {
      const drumPartOff = pat1Off + 24 + i * 34;
      const samplePtr = buf.readUInt16BE(drumPartOff);
      expect(samplePtr).toBe(9 + i);
    }
  });

  it('should keep unassigned patterns at default "Init" state', () => {
    const buf = generateESXWithNSamples(3);

    // Pattern 1 (unassigned) should still be "Init"
    const pat1Off = ADDR.PATTERN_DATA + 4280;
    const name = buf.toString('ascii', pat1Off, pat1Off + 8).trim();
    expect(name).toBe('Init');
  });
});

// ── Multi-format file detection ──────────────────────────

describe('Integration - ESX file validation', () => {
  it('should reject files smaller than minimum size', () => {
    const tooSmall = Buffer.alloc(100, 0);
    tooSmall.write('KORG', 0, 'ascii');
    expect(() => parseEsxFile(tooSmall)).toThrow();
  });

  it('should reject files with wrong magic bytes', () => {
    const bad = Buffer.alloc(SIZE.FILE_MIN, 0);
    bad.write('YAMAHA', 0, 'ascii');
    expect(() => parseEsxFile(bad)).toThrow('KORG');
  });

  it('should accept files larger than minimum (samples present)', () => {
    const buf = generateESXWithSample('BIGSMP', 500);
    expect(buf.length).toBeGreaterThan(SIZE.FILE_MIN);

    const parsed = parseEsxFile(buf);
    expect(parsed.numMono).toBe(1);
  });
});

// ── Synthetic sample generation ──────────────────────────

describe('Integration - Synthetic sample builds', () => {
  it('should build ESX with sine wave and verify audio content', () => {
    const sampleRate = 44100;
    const numFrames = sampleRate; // 1 second
    const pcmData = Buffer.alloc(numFrames * 2);

    for (let i = 0; i < numFrames; i++) {
      const val = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000);
      pcmData.writeInt16BE(val, i * 2);
    }

    const esx = buildEsxFile([{ name: 'SINE440', pcmData, sampleRate, numFrames }]);
    expect(esx.length).toBeGreaterThan(SIZE.FILE_MIN);

    const parsed = parseEsxFile(esx);
    expect(parsed.numMono).toBe(1);

    const sample = parsed.monoSamples.find(s => s !== null);
    expect(sample.name).toBe('SINE440');
    expect(sample.duration).toBeCloseTo(1.0, 1);

    // Verify audio is non-silent (has values above threshold)
    let peak = 0;
    for (let i = 0; i < Math.min(sample.numFrames, 1000); i++) {
      const v = Math.abs(sample.pcmData.readInt16BE(i * 2));
      if (v > peak) peak = v;
    }
    expect(peak).toBeGreaterThan(1000); // audible signal
  });

  it('should build ESX with silence and verify zero content', () => {
    const sampleRate = 44100;
    const numFrames = 1000;
    const pcmData = Buffer.alloc(numFrames * 2, 0);

    const esx = buildEsxFile([{ name: 'SILENCE', pcmData, sampleRate, numFrames }]);
    const parsed = parseEsxFile(esx);
    const sample = parsed.monoSamples.find(s => s !== null);

    let peak = 0;
    for (let i = 0; i < sample.numFrames; i++) {
      const v = Math.abs(sample.pcmData.readInt16BE(i * 2));
      if (v > peak) peak = v;
    }
    expect(peak).toBe(0); // pure silence
  });
});

// ── Export fidelity ──────────────────────────────────────

describe('Integration - Export fidelity', () => {
  it('should produce bit-identical WAVs for same source data', () => {
    const pcm = Buffer.alloc(2000);
    for (let i = 0; i < 1000; i++) {
      pcm.writeInt16BE(Math.round(Math.sin(i * 0.1) * 10000), i * 2);
    }

    const wav1 = pcmToWav(pcm, 44100);
    const wav2 = pcmToWav(pcm, 44100);

    expect(wav1.equals(wav2)).toBe(true);
  });

  it('should produce parseable WAV from every sample in a multi-sample ESX', () => {
    const buf = generateESXWithNSamples(5);
    const parsed = parseEsxFile(buf);
    const loaded = parsed.monoSamples.filter(s => s !== null);

    for (const sample of loaded) {
      const wav = pcmToWav(sample.pcmData, sample.sampleRate);

      // Every exported WAV should be parseable
      const reParsed = parseWavFile(wav);
      expect(reParsed.fmt.sampleRate).toBe(44100);
      expect(reParsed.fmt.numChannels).toBe(1);
      expect(reParsed.data.length).toBeGreaterThan(0);
    }
  });
});
