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
  HEADER_SIZE,
  OFFSET_ENTRY,
  DATA_START,
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
      name: 'MY-KICK',
      playLogPeriod: 12345,
      startPoint: 10,
      endPoint: 999,
      loopStart: 500,
      loopType: 1,
      loudness: 100,
      sampleRate: NATIVE_RATE,
    };

    const buf = buildEsliData(meta);
    expect(buf.length).toBe(ESLI_DATA_SIZE);

    const parsed = parseEsliData(buf);
    expect(parsed.category).toBe(5);
    expect(parsed.name).toBe('MY-KICK');
    expect(parsed.sampleRate).toBe(NATIVE_RATE);
    expect(parsed.startPoint).toBe(10);   // frame count (stored as bytes internally)
    expect(parsed.endPoint).toBe(999);
    expect(parsed.loopStart).toBe(500);
    expect(parsed.loopType).toBe(1);
    expect(parsed.loudness).toBe(100);
  });

  it('should handle empty name', () => {
    const meta = { name: '' };
    const buf = buildEsliData(meta);
    const parsed = parseEsliData(buf);
    expect(parsed.name).toBe('');
  });

  it('should truncate long names to 16 chars', () => {
    const meta = { name: 'A'.repeat(30) };
    const buf = buildEsliData(meta);
    const parsed = parseEsliData(buf);
    expect(parsed.name.length).toBeLessThanOrEqual(16);
  });
});

// ── ESLI real-hardware field map (regression) ────────────
// The field offsets below were reverse-engineered from 202 real samples. Earlier
// offsets were wrong on nearly every field (names came out missing 2 chars).
describe('E2S - ESLI real hardware field map (regression)', () => {
  it('writes name@0x02 (16B), category@0x12, sampleRate@0x48', () => {
    const buf = buildEsliData({ name: 'HiLight ST', category: 7, sampleRate: 32058 });
    // name at 0x02, NOT 0x04 (the old, wrong offset dropped the first 2 chars)
    expect(buf.toString('latin1', 0x02, 0x02 + 10)).toBe('HiLight ST');
    expect(buf.readUInt16LE(0x12)).toBe(7);
    expect(buf.readUInt32LE(0x48)).toBe(32058);
  });

  it('stores sample points as BYTE offsets (frame × 2) and reads them as frames', () => {
    const buf = buildEsliData({ startPoint: 100, endPoint: 5000, totalFrames: 5001 });
    expect(buf.readUInt32LE(0x28)).toBe(200);    // start:  100 frames -> 200 bytes
    expect(buf.readUInt32LE(0x30)).toBe(10000);  // end:   5000 frames -> 10000 bytes
    expect(buf.readUInt32LE(0x3c)).toBe(10002);  // length: 5001 frames -> 10002 bytes
    const parsed = parseEsliData(buf);
    expect(parsed.startPoint).toBe(100);
    expect(parsed.endPoint).toBe(5000);
  });

  it('derives loopType from loopStart vs endPoint (no separate loop-type byte)', () => {
    const oneShot = parseEsliData(buildEsliData({ endPoint: 5000, loopStart: null }));
    expect(oneShot.loopType).toBe(0);
    expect(oneShot.loopStart).toBe(oneShot.endPoint);

    const looped = parseEsliData(buildEsliData({ endPoint: 5000, loopStart: 2000 }));
    expect(looped.loopType).toBe(1);
    expect(looped.loopStart).toBe(2000);
  });

  it('preserve-and-patch: editing the name leaves every other ESLI byte intact', () => {
    // A sample "loaded from a real file" carries its raw 1172-byte block.
    const original = buildEsliData({ name: 'ORIG', category: 9, endPoint: 4000, sampleRate: 44100 });
    const loaded = parseEsliData(original);           // provides loaded._raw
    expect(loaded._raw).toHaveLength(ESLI_DATA_SIZE);

    const patched = buildEsliData({ ...loaded, name: 'NEWNAME' });
    expect(parseEsliData(patched).name).toBe('NEWNAME');
    // Every byte outside the 16-byte name field is byte-identical to the original.
    for (let o = 0; o < ESLI_DATA_SIZE; o++) {
      if (o >= 0x02 && o < 0x02 + 16) continue; // name field
      expect(patched[o]).toBe(original[o]);
    }
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

// ── Real hardware offset-table format (regression) ───────
// Real Korg Electribe2 Sampler .e2sSample.all files use a 510-entry offset
// table (data begins at 0x1000 = 4096), and each 8-byte entry is
// [uint32 startOffset, uint32 END offset] — NOT [offset, length]. A file
// exported by real hardware was crashing the parser (issue: it computed
// start+endOffset, overran the file, and threw, killing the whole load).
describe('E2S - real hardware offset-table format (regression)', () => {
  // Extract a single valid WAV body from a built all-file, format-agnostically.
  function extractWav(allBuf, slot = 0) {
    const off = allBuf.readUInt32LE(HEADER_SIZE + slot * OFFSET_ENTRY);
    const riffLen = allBuf.readUInt32LE(off + 4) + 8; // RIFF size + 8-byte tag/size
    return allBuf.slice(off, off + riffLen);
  }

  // Lay out an all-file exactly like real hardware: end-offset table, data @4096.
  // opts.zeroLastEnd mirrors the observed quirk that the LAST used slot stores 0
  // in its end-offset field.
  function buildHardwareFormatFile(entries, opts = {}) {
    const dataLen = entries.reduce((n, e) => n + e.wav.length, 0);
    const buf = Buffer.alloc(DATA_START + dataLen, 0);
    MAGIC.copy(buf, 0);
    let pos = DATA_START;
    entries.forEach((e, idx) => {
      const tp = HEADER_SIZE + e.slot * OFFSET_ENTRY;
      const isLast = idx === entries.length - 1;
      buf.writeUInt32LE(pos, tp);                             // start offset
      buf.writeUInt32LE(                                       // END offset (hardware format)
        opts.zeroLastEnd && isLast ? 0 : pos + e.wav.length, tp + 4);
      e.wav.copy(buf, pos);
      pos += e.wav.length;
    });
    return buf;
  }

  it('uses a 510-entry table with data starting at 4096', () => {
    expect(DATA_START).toBe(4096);
    expect(MAX_SLOTS).toBe(510);
    expect(HEADER_SIZE + MAX_SLOTS * OFFSET_ENTRY).toBe(DATA_START);
  });

  it('buildE2sAllFile writes END offsets (not lengths) and data @4096', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
    const buf = buildE2sAllFile([{ slot: 0, name: 'ENDOFF', pcmData: pcm, sampleRate: NATIVE_RATE }]);

    const startOff = buf.readUInt32LE(HEADER_SIZE);
    const field2   = buf.readUInt32LE(HEADER_SIZE + 4);
    const wavLen   = buf.readUInt32LE(startOff + 4) + 8; // real WAV byte length

    expect(startOff).toBe(DATA_START);          // 4096
    expect(field2).toBe(startOff + wavLen);      // field2 == END offset
    expect(field2).not.toBe(wavLen);             // and NOT the raw length
  });

  it('parses a real-hardware-format file without throwing (the reported bug)', () => {
    const pcm = Buffer.alloc(400);
    for (let i = 0; i < 200; i++) pcm.writeInt16LE(i * 50 - 5000, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 0, name: 'REAL', pcmData: pcm, sampleRate: NATIVE_RATE }])
    );
    // Place it high in the slot space, like the real file (samples at 259-460).
    const buf = buildHardwareFormatFile([{ slot: 300, wav }]);

    let parsed;
    expect(() => { parsed = parseE2sAllFile(buf); }).not.toThrow();
    expect(parsed.samples[300]).not.toBeNull();
    expect(parsed.samples[300].esli.name).toBe('REAL');
    expect(parsed.samples[300].pcmData.equals(pcm)).toBe(true);
  });

  it('loads the last sample even when its end-offset field is 0', () => {
    const pcm = Buffer.alloc(300);
    for (let i = 0; i < 150; i++) pcm.writeInt16LE(i * 60, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 0, name: 'LAST', pcmData: pcm, sampleRate: NATIVE_RATE }])
    );
    // Two samples; the last one's end field is 0 (the real-hardware quirk).
    const buf = buildHardwareFormatFile(
      [{ slot: 10, wav }, { slot: 11, wav }], { zeroLastEnd: true });

    const parsed = parseE2sAllFile(buf);
    expect(parsed.samples[11]).not.toBeNull();
    expect(parsed.samples[11].error).toBeUndefined();
    expect(parsed.samples[11].esli.name).toBe('LAST');
    expect(parsed.samples[11].pcmData.equals(pcm)).toBe(true);
  });

  it('skips garbage/out-of-range table entries instead of throwing', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 0, name: 'OK', pcmData: pcm, sampleRate: NATIVE_RATE }])
    );
    const buf = buildHardwareFormatFile([{ slot: 5, wav }]);
    // Corrupt a neighbouring entry with an out-of-range offset (real garbage
    // slots point well past the file end).
    const tp = HEADER_SIZE + 6 * OFFSET_ENTRY;
    buf.writeUInt32LE(buf.length + 1_000_000, tp);
    buf.writeUInt32LE(buf.length + 2_000_000, tp + 4);

    let parsed;
    expect(() => { parsed = parseE2sAllFile(buf); }).not.toThrow();
    expect(parsed.samples[5]).not.toBeNull();
    expect(parsed.samples[5].esli.name).toBe('OK');
    expect(parsed.samples[6]).toBeNull();
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
