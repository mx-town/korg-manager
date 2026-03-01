/**
 * E2S Format Tests
 * Covers ESLI parsing/building, WAV handling, all-file round-trip,
 * resampling utilities, and cross-device conversion.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parseEsliData,
  buildEsliData,
  parseE2sWav,
  buildE2sWav,
  parseE2sAllFile,
  buildE2sAllFile,
  resampleLinear,
  pcmLEToFloat,
  floatToPcmLE,
  pcmBEToFloat,
  floatToPcmBE,
  resample441to48,
  resample48to441,
  esxToE2s,
  e2sToEsx,
  MAGIC,
  MAX_SLOTS,
  NATIVE_RATE,
  ESLI_DATA_SIZE,
} = require('../../src/e2s-format');
const {
  generateEmptyE2S,
  generateE2SWithSample,
  generateE2SWithNSamples,
} = require('../fixtures/generators/minimal-e2s');

// ── ESLI chunk ───────────────────────────────────────────

describe('E2S - ESLI build/parse round-trip', () => {
  it('should round-trip ESLI metadata', () => {
    const meta = {
      category: 5,
      slotNumber: 42,
      name: 'MY-KICK',
      playLogPeriod: 12345,
      playVolume: 0x4000,
      startPoint: 0,
      endPoint: 999,
      loopStart: 0xFFFFFFFF,
      loopType: 0,
      loudness: 100,
      sampleRate: NATIVE_RATE,
    };

    const buf = buildEsliData(meta);
    expect(buf.length).toBe(ESLI_DATA_SIZE);

    const parsed = parseEsliData(buf);
    expect(parsed.category).toBe(5);
    expect(parsed.slotNumber).toBe(42);
    expect(parsed.name).toBe('MY-KICK');
    expect(parsed.sampleRate).toBe(NATIVE_RATE);
    expect(parsed.endPoint).toBe(999);
    expect(parsed.loudness).toBe(100);
  });

  it('should handle empty name', () => {
    const meta = { name: '' };
    const buf = buildEsliData(meta);
    const parsed = parseEsliData(buf);
    expect(parsed.name).toBe('');
  });

  it('should truncate long names to 24 chars', () => {
    const meta = { name: 'A'.repeat(30) };
    const buf = buildEsliData(meta);
    const parsed = parseEsliData(buf);
    expect(parsed.name.length).toBeLessThanOrEqual(24);
  });
});

// ── Single WAV with korg/esli ────────────────────────────

describe('E2S - Single WAV build/parse', () => {
  it('should build and parse a WAV with embedded esli chunk', () => {
    const numFrames = 480;
    const pcmData = Buffer.alloc(numFrames * 2);
    for (let i = 0; i < numFrames; i++) {
      pcmData.writeInt16LE(Math.round(Math.sin(i * 0.1) * 10000), i * 2);
    }

    const esliMeta = {
      slotNumber: 0,
      name: 'TEST',
      sampleRate: NATIVE_RATE,
      startPoint: 0,
      endPoint: numFrames - 1,
    };

    const wav = buildE2sWav(pcmData, esliMeta);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    const parsed = parseE2sWav(wav);
    expect(parsed.fmt.sampleRate).toBe(NATIVE_RATE);
    expect(parsed.fmt.bitsPerSample).toBe(16);
    expect(parsed.pcmData.equals(pcmData)).toBe(true);
    expect(parsed.esli).not.toBeNull();
    expect(parsed.esli.name).toBe('TEST');
  });

  it('should throw on non-RIFF data', () => {
    expect(() => parseE2sWav(Buffer.from('NOPE1234567890'))).toThrow('RIFF');
  });
});

// ── All-file operations ──────────────────────────────────

describe('E2S - All-file build/parse', () => {
  it('should build and parse an empty all-file', () => {
    const buf = generateEmptyE2S();
    expect(buf.slice(0, 16).equals(MAGIC)).toBe(true);

    const parsed = parseE2sAllFile(buf);
    expect(parsed.samples).toHaveLength(MAX_SLOTS);
    expect(parsed.samples.every(s => s === null)).toBe(true);
  });

  it('should build and parse an all-file with one sample', () => {
    const buf = generateE2SWithSample(0, 'KICK');
    const parsed = parseE2sAllFile(buf);

    expect(parsed.samples[0]).not.toBeNull();
    expect(parsed.samples[0].esli.name).toBe('KICK');
    expect(parsed.samples[0].pcmData.length).toBeGreaterThan(0);
    expect(parsed.samples[1]).toBeNull();
  });

  it('should place sample at specific slot', () => {
    const buf = generateE2SWithSample(500, 'SLOT500');
    const parsed = parseE2sAllFile(buf);

    expect(parsed.samples[500]).not.toBeNull();
    expect(parsed.samples[500].esli.name).toBe('SLOT500');
    expect(parsed.samples[0]).toBeNull();
  });

  it('should handle multiple samples', () => {
    const buf = generateE2SWithNSamples(5);
    const parsed = parseE2sAllFile(buf);

    const loaded = parsed.samples.filter(s => s !== null && !s.error);
    expect(loaded).toHaveLength(5);
  });

  it('should round-trip PCM data exactly', () => {
    const numFrames = 100;
    const pcm = Buffer.alloc(numFrames * 2);
    for (let i = 0; i < numFrames; i++) pcm.writeInt16LE(i * 200, i * 2);

    const buf = buildE2sAllFile([{ slot: 0, name: 'RT', pcmData: pcm, sampleRate: NATIVE_RATE }]);
    const parsed = parseE2sAllFile(buf);
    expect(parsed.samples[0].pcmData.equals(pcm)).toBe(true);
  });

  it('should reject file with bad magic', () => {
    const buf = Buffer.alloc(20000, 0);
    buf.write('NOTMAGIC', 0, 'ascii');
    expect(() => parseE2sAllFile(buf)).toThrow('magic');
  });

  it('should reject file that is too small', () => {
    expect(() => parseE2sAllFile(Buffer.alloc(100))).toThrow('too small');
  });
});

// ── Resampling utilities ─────────────────────────────────

describe('E2S - Resampling', () => {
  it('should return input unchanged when rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const result = resampleLinear(input, 48000, 48000);
    expect(result).toBe(input); // same reference
  });

  it('should upsample 44100 -> 48000 (more frames)', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);

    const up = resample441to48(pcm);
    expect(up.length / 2).toBeGreaterThan(100);
  });

  it('should downsample 48000 -> 44100 (fewer frames)', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);

    const down = resample48to441(pcm);
    expect(down.length / 2).toBeLessThan(100);
  });

  it('should maintain approximate frame count after up/down roundtrip', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);

    const up = resample441to48(pcm);
    const down = resample48to441(up);
    const originalFrames = 100;
    const finalFrames = down.length / 2;
    expect(Math.abs(finalFrames - originalFrames)).toBeLessThanOrEqual(1);
  });
});

// ── PCM conversion ───────────────────────────────────────

describe('E2S - PCM conversion', () => {
  it('should round-trip LE PCM through float', () => {
    const pcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) pcm.writeInt16LE(i * 1000 - 5000, i * 2);

    const floats = pcmLEToFloat(pcm);
    const back = floatToPcmLE(floats);

    for (let i = 0; i < 10; i++) {
      expect(Math.abs(back.readInt16LE(i * 2) - pcm.readInt16LE(i * 2))).toBeLessThanOrEqual(1);
    }
  });

  it('should round-trip BE PCM through float', () => {
    const pcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) pcm.writeInt16BE(i * 1000, i * 2);

    const floats = pcmBEToFloat(pcm);
    const back = floatToPcmBE(floats);

    for (let i = 0; i < 10; i++) {
      expect(Math.abs(back.readInt16BE(i * 2) - pcm.readInt16BE(i * 2))).toBeLessThanOrEqual(1);
    }
  });
});

// ── Cross-device conversion ──────────────────────────────

describe('E2S - Cross-device ESX<->E2S', () => {
  it('should convert ESX BE 44.1k -> E2S LE 48k', () => {
    const esxPcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) esxPcm.writeInt16BE(i * 1000, i * 2);

    const e2sPcm = esxToE2s(esxPcm);
    expect(e2sPcm.length).toBeGreaterThan(0);
    // 48000/44100 ratio means more frames
    expect(e2sPcm.length / 2).toBeGreaterThanOrEqual(10);
  });

  it('should convert E2S LE 48k -> ESX BE 44.1k', () => {
    const e2sPcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) e2sPcm.writeInt16LE(i * 1000, i * 2);

    const esxPcm = e2sToEsx(e2sPcm);
    expect(esxPcm.length).toBeGreaterThan(0);
  });

  it('should approximately preserve data through ESX->E2S->ESX roundtrip', () => {
    const esxPcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) esxPcm.writeInt16BE(i * 1000, i * 2);

    const e2sPcm = esxToE2s(esxPcm);
    const back = e2sToEsx(e2sPcm);
    // After double resampling, frame count should be close
    expect(back.length / 2).toBeGreaterThanOrEqual(9);
  });
});
