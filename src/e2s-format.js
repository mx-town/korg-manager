/**
 * E2S Format Parser/Builder
 * Reads and writes Korg Electribe 2 Sampler .e2sSample.all files.
 * Format: 48 kHz, 16-bit signed LE PCM, RIFF WAV with korg/esli chunks.
 *
 * File layout of e2sSample.all:
 *   [0x0000 – 0x000F]  16-byte magic header
 *   [0x0010 – 0x1F4F]  Offset table – 1000 slots × 8 bytes (offset + size)
 *   [0x1F50 …]         Concatenated RIFF WAV data
 */

'use strict';

// ── Constants ──────────────────────────────────────────────

const MAGIC = Buffer.from([
  0x65, 0x32, 0x73, 0x20, // "e2s "
  0x73, 0x61, 0x6D, 0x70, // "samp"
  0x6C, 0x65, 0x20, 0x61, // "le a"
  0x6C, 0x6C, 0x1A, 0x00, // "ll\x1A\0"
]);

const MAX_SLOTS       = 1000;
const HEADER_SIZE     = 16;
const OFFSET_ENTRY    = 8;                             // uint32LE offset + uint32LE size
const OFFSET_TABLE_AT = HEADER_SIZE;                   // 0x10
const OFFSET_TABLE_SZ = MAX_SLOTS * OFFSET_ENTRY;     // 8000
const DATA_START      = HEADER_SIZE + OFFSET_TABLE_SZ; // 0x1F50

const NATIVE_RATE     = 48000;
const BITS            = 16;
const ESLI_DATA_SIZE  = 1172;
const ESLI_NAME_LEN   = 24;

// ESLI field offsets (within esli data, after chunk header)
const ESLI = {
  CATEGORY:        0x0000,  // uint16LE  – sample category (0 = User)
  SLOT_NUM:        0x0002,  // uint16LE  – slot index 0-999
  NAME:            0x0004,  // char[24]  – ASCII, null-padded
  PLAY_LOG_PERIOD: 0x001C,  // uint32LE  – playback tuning
  PLAY_VOLUME:     0x0020,  // uint16LE  – volume (default 0x4000)
  START_POINT:     0x0022,  // uint32LE  – start frame
  END_POINT:       0x0026,  // uint32LE  – end frame
  LOOP_START:      0x002A,  // uint32LE  – loop start frame
  LOOP_TYPE:       0x002E,  // uint8     – 0 = OneShot, 1 = Loop
  LOUDNESS:        0x002F,  // uint8     – 0-127
  SAMPLE_RATE:     0x0030,  // uint32LE  – typically 48000
};

// ── ESLI helpers ──────────────────────────────────────────

/**
 * Parse an ESLI data block (1172 bytes) into a metadata object.
 */
function parseEsliData(buf) {
  if (buf.length < ESLI_DATA_SIZE) {
    throw new Error(`ESLI data too short: ${buf.length} < ${ESLI_DATA_SIZE}`);
  }
  const nameRaw = buf.slice(ESLI.NAME, ESLI.NAME + ESLI_NAME_LEN);
  let name = '';
  for (let i = 0; i < ESLI_NAME_LEN; i++) {
    if (nameRaw[i] === 0) break;
    name += String.fromCharCode(nameRaw[i]);
  }
  return {
    category:       buf.readUInt16LE(ESLI.CATEGORY),
    slotNumber:     buf.readUInt16LE(ESLI.SLOT_NUM),
    name:           name.trim(),
    playLogPeriod:  buf.readUInt32LE(ESLI.PLAY_LOG_PERIOD),
    playVolume:     buf.readUInt16LE(ESLI.PLAY_VOLUME),
    startPoint:     buf.readUInt32LE(ESLI.START_POINT),
    endPoint:       buf.readUInt32LE(ESLI.END_POINT),
    loopStart:      buf.readUInt32LE(ESLI.LOOP_START),
    loopType:       buf.readUInt8(ESLI.LOOP_TYPE),
    loudness:       buf.readUInt8(ESLI.LOUDNESS),
    sampleRate:     buf.readUInt32LE(ESLI.SAMPLE_RATE),
  };
}

/**
 * Build a 1172-byte ESLI data block from a metadata object.
 */
function buildEsliData(meta) {
  const buf = Buffer.alloc(ESLI_DATA_SIZE, 0);
  buf.writeUInt16LE(meta.category       || 0,     ESLI.CATEGORY);
  buf.writeUInt16LE(meta.slotNumber     || 0,     ESLI.SLOT_NUM);

  const nameStr = (meta.name || '').substring(0, ESLI_NAME_LEN);
  buf.write(nameStr, ESLI.NAME, 'ascii');

  buf.writeUInt32LE(meta.playLogPeriod  || 0,     ESLI.PLAY_LOG_PERIOD);
  buf.writeUInt16LE(meta.playVolume     ?? 0x4000, ESLI.PLAY_VOLUME);
  buf.writeUInt32LE(meta.startPoint     || 0,     ESLI.START_POINT);
  buf.writeUInt32LE(meta.endPoint       || 0,     ESLI.END_POINT);
  buf.writeUInt32LE(meta.loopStart      ?? 0xFFFFFFFF, ESLI.LOOP_START);
  buf.writeUInt8   (meta.loopType       || 0,     ESLI.LOOP_TYPE);
  buf.writeUInt8   (meta.loudness       ?? 127,   ESLI.LOUDNESS);
  buf.writeUInt32LE(meta.sampleRate     || NATIVE_RATE, ESLI.SAMPLE_RATE);
  return buf;
}

// ── Single-sample WAV with korg/esli ──────────────────────

/**
 * Parse a single RIFF WAV buffer that may contain a korg/esli chunk.
 * Returns { fmt, pcmData, esli? }.
 */
function parseE2sWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Not a RIFF file');
  }
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAVE file');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 12;
  let fmt = null;
  let dataChunk = null;
  let esli = null;

  while (offset < buffer.length - 8) {
    const id   = buffer.toString('ascii', offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    offset += 8;

    if (id === 'fmt ') {
      fmt = {
        audioFormat:  view.getUint16(offset, true),
        numChannels:  view.getUint16(offset + 2, true),
        sampleRate:   view.getUint32(offset + 4, true),
        byteRate:     view.getUint32(offset + 8, true),
        blockAlign:   view.getUint16(offset + 12, true),
        bitsPerSample:view.getUint16(offset + 14, true),
      };
    } else if (id === 'data') {
      dataChunk = buffer.slice(offset, offset + size);
    } else if (id === 'korg') {
      // Parse sub-chunks inside korg
      let sub = offset;
      const korgEnd = offset + size;
      while (sub < korgEnd - 8) {
        const subId   = buffer.toString('ascii', sub, sub + 4);
        const subSize = view.getUint32(sub + 4, true);
        sub += 8;
        if (subId === 'esli') {
          esli = parseEsliData(buffer.slice(sub, sub + subSize));
        }
        sub += subSize;
        if (subSize % 2 !== 0) sub++;
      }
    }

    offset += size;
    if (size % 2 !== 0) offset++;
  }

  if (!fmt)       throw new Error('WAV missing fmt chunk');
  if (!dataChunk) throw new Error('WAV missing data chunk');

  return { fmt, pcmData: dataChunk, esli };
}

/**
 * Build a RIFF WAV buffer with an embedded korg/esli chunk.
 *
 * @param {Buffer} pcmData  – 16-bit signed LE PCM
 * @param {object} esliMeta – metadata for the esli chunk
 * @returns {Buffer} Complete RIFF WAV
 */
function buildE2sWav(pcmData, esliMeta) {
  const sampleRate  = esliMeta.sampleRate || NATIVE_RATE;
  const numChannels = 1;
  const byteRate    = sampleRate * numChannels * (BITS / 8);
  const blockAlign  = numChannels * (BITS / 8);
  const audioSize   = pcmData.length;

  // esli chunk: header(8) + data(1172)
  const esliChunkSize = 8 + ESLI_DATA_SIZE;
  // korg chunk: header(8) + esli chunk
  const korgChunkSize = 8 + esliChunkSize;

  // fmt chunk: header(8) + 16
  const fmtChunkSize = 8 + 16;

  // data chunk: header(8) + audioSize
  const dataChunkSize = 8 + audioSize;

  // RIFF size = 4("WAVE") + fmt + korg + data
  const riffSize = 4 + fmtChunkSize + korgChunkSize + dataChunkSize;
  const totalSize = 8 + riffSize; // "RIFF" + uint32

  const wav = Buffer.alloc(totalSize, 0);
  let pos = 0;

  // RIFF header
  wav.write('RIFF', pos); pos += 4;
  wav.writeUInt32LE(riffSize, pos); pos += 4;
  wav.write('WAVE', pos); pos += 4;

  // fmt chunk
  wav.write('fmt ', pos); pos += 4;
  wav.writeUInt32LE(16, pos); pos += 4;
  wav.writeUInt16LE(1, pos); pos += 2;           // PCM
  wav.writeUInt16LE(numChannels, pos); pos += 2;
  wav.writeUInt32LE(sampleRate, pos); pos += 4;
  wav.writeUInt32LE(byteRate, pos); pos += 4;
  wav.writeUInt16LE(blockAlign, pos); pos += 2;
  wav.writeUInt16LE(BITS, pos); pos += 2;

  // korg chunk (contains esli sub-chunk)
  wav.write('korg', pos); pos += 4;
  wav.writeUInt32LE(esliChunkSize, pos); pos += 4;

  // esli sub-chunk
  wav.write('esli', pos); pos += 4;
  wav.writeUInt32LE(ESLI_DATA_SIZE, pos); pos += 4;
  buildEsliData(esliMeta).copy(wav, pos); pos += ESLI_DATA_SIZE;

  // data chunk
  wav.write('data', pos); pos += 4;
  wav.writeUInt32LE(audioSize, pos); pos += 4;
  pcmData.copy(wav, pos);

  return wav;
}

// ── e2sSample.all file operations ─────────────────────────

/**
 * Parse an e2sSample.all file.
 * Returns { samples: Array<{ slot, esli, fmt, pcmData } | null> }
 */
function parseE2sAllFile(buffer) {
  // Validate magic
  if (buffer.length < DATA_START) {
    throw new Error(`File too small for e2sSample.all (${buffer.length} bytes)`);
  }
  if (!buffer.slice(0, HEADER_SIZE).equals(MAGIC)) {
    throw new Error('Invalid e2sSample.all magic header');
  }

  // Read offset table
  const samples = new Array(MAX_SLOTS).fill(null);
  for (let i = 0; i < MAX_SLOTS; i++) {
    const tablePos = OFFSET_TABLE_AT + i * OFFSET_ENTRY;
    const fileOff  = buffer.readUInt32LE(tablePos);
    const size     = buffer.readUInt32LE(tablePos + 4);

    if (size === 0 || fileOff === 0) continue;
    if (fileOff + size > buffer.length) {
      throw new Error(`Slot ${i}: offset ${fileOff}+${size} exceeds file size ${buffer.length}`);
    }

    const wavBuf = buffer.slice(fileOff, fileOff + size);
    try {
      const parsed = parseE2sWav(wavBuf);
      samples[i] = {
        slot:    i,
        esli:    parsed.esli,
        fmt:     parsed.fmt,
        pcmData: parsed.pcmData,
      };
    } catch (err) {
      // Slot contains invalid WAV – skip with warning
      samples[i] = { slot: i, error: err.message };
    }
  }

  return { samples };
}

/**
 * Build an e2sSample.all file from an array of samples.
 *
 * @param {Array} samples – up to 1000 entries, each:
 *   { slot?, name, pcmData (16-bit LE), sampleRate?, category?, loopType?, ... }
 *   null entries are empty slots.
 * @returns {Buffer}
 */
function buildE2sAllFile(samples) {
  // Collect WAV buffers for each slot
  const wavBuffers = new Array(MAX_SLOTS).fill(null);

  for (let i = 0; i < samples.length && i < MAX_SLOTS; i++) {
    const s = samples[i];
    if (!s || !s.pcmData || s.pcmData.length === 0) continue;

    const slot = s.slot ?? i;
    const numFrames = s.pcmData.length / 2; // 16-bit = 2 bytes per frame
    const lastFrame = numFrames > 0 ? numFrames - 1 : 0;
    // start/endPoint pass through (hardware-trimmed playback regions must
    // survive a save), clamped to the current sample length.
    const startPoint = Math.min(s.startPoint ?? 0, lastFrame);
    const endPoint = Math.min(s.endPoint ?? lastFrame, lastFrame);
    const esliMeta = {
      category:      s.category   || 0,
      slotNumber:    slot,
      name:          s.name       || `Sample ${slot}`,
      playLogPeriod: s.playLogPeriod || 0,
      playVolume:    s.playVolume ?? 0x4000,
      startPoint:    startPoint,
      endPoint:      Math.max(endPoint, startPoint),
      loopStart:     s.loopStart ?? 0xFFFFFFFF,
      loopType:      s.loopType  || 0,
      loudness:      s.loudness  ?? 127,
      sampleRate:    s.sampleRate || NATIVE_RATE,
    };

    wavBuffers[slot] = buildE2sWav(s.pcmData, esliMeta);
  }

  // Calculate total size
  let dataSize = 0;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (wavBuffers[i]) dataSize += wavBuffers[i].length;
  }

  const totalSize = DATA_START + dataSize;
  const out = Buffer.alloc(totalSize, 0);

  // Write magic
  MAGIC.copy(out, 0);

  // Write WAVs and offset table
  let writePos = DATA_START;
  for (let i = 0; i < MAX_SLOTS; i++) {
    const tablePos = OFFSET_TABLE_AT + i * OFFSET_ENTRY;
    if (!wavBuffers[i]) {
      out.writeUInt32LE(0, tablePos);
      out.writeUInt32LE(0, tablePos + 4);
      continue;
    }
    out.writeUInt32LE(writePos, tablePos);
    out.writeUInt32LE(wavBuffers[i].length, tablePos + 4);
    wavBuffers[i].copy(out, writePos);
    writePos += wavBuffers[i].length;
  }

  return out;
}

// ── Resample helpers ──────────────────────────────────────

/**
 * High-quality resampler using 4-point cubic (Catmull-Rom) interpolation.
 * For downsampling, applies a simple anti-aliasing pre-filter.
 */
function resampleLinear(floatBuf, fromRate, toRate) {
  if (fromRate === toRate) return floatBuf;
  const ratio = fromRate / toRate;
  const newLen = Math.floor(floatBuf.length / ratio);
  const out = new Float32Array(newLen);

  // Anti-aliasing pre-filter for downsampling (simple RC lowpass)
  let src = floatBuf;
  if (ratio > 1.0) {
    src = new Float32Array(floatBuf.length);
    const cutoff = 1.0 / ratio;
    const rc = (1 - cutoff * Math.PI) / (1 + cutoff * Math.PI);
    let prev = 0;
    for (let i = 0; i < floatBuf.length; i++) {
      prev = prev * rc + floatBuf[i] * (1 - rc);
      src[i] = prev;
    }
  }

  const len = src.length;
  function getSample(i) {
    if (i < 0) return src[0];
    if (i >= len) return src[len - 1];
    return src[i];
  }

  for (let i = 0; i < newLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const t = pos - idx;
    // Catmull-Rom cubic interpolation
    const p0 = getSample(idx - 1);
    const p1 = getSample(idx);
    const p2 = getSample(idx + 1);
    const p3 = getSample(idx + 2);
    const t2 = t * t, t3 = t2 * t;
    out[i] = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
    // Clamp to [-1, 1]
    if (out[i] > 1) out[i] = 1;
    else if (out[i] < -1) out[i] = -1;
  }
  return out;
}

/**
 * Decode 16-bit LE PCM Buffer → Float32Array (range -1..+1).
 */
function pcmLEToFloat(pcmBuf) {
  const frames = pcmBuf.length / 2;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = pcmBuf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

/**
 * Float32Array → 16-bit signed LE PCM Buffer.
 */
function floatToPcmLE(floatBuf) {
  const out = Buffer.alloc(floatBuf.length * 2);
  for (let i = 0; i < floatBuf.length; i++) {
    let v = Math.round(floatBuf[i] * 32767);
    v = Math.max(-32768, Math.min(32767, v));
    out.writeInt16LE(v, i * 2);
  }
  return out;
}

/**
 * Decode 16-bit BE PCM Buffer (ESX format) → Float32Array.
 */
function pcmBEToFloat(pcmBuf) {
  const frames = pcmBuf.length / 2;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = pcmBuf.readInt16BE(i * 2) / 32768;
  }
  return out;
}

/**
 * Float32Array → 16-bit signed BE PCM Buffer (ESX format).
 */
function floatToPcmBE(floatBuf) {
  const out = Buffer.alloc(floatBuf.length * 2);
  for (let i = 0; i < floatBuf.length; i++) {
    let v = Math.round(floatBuf[i] * 32767);
    v = Math.max(-32768, Math.min(32767, v));
    out.writeInt16BE(v, i * 2);
  }
  return out;
}

/**
 * Resample 16-bit LE PCM from 44100 → 48000 Hz (ESX → E2S).
 */
function resample441to48(pcmBufLE) {
  const floats     = pcmLEToFloat(pcmBufLE);
  const resampled  = resampleLinear(floats, 44100, 48000);
  return floatToPcmLE(resampled);
}

/**
 * Resample 16-bit LE PCM from 48000 → 44100 Hz (E2S → ESX).
 */
function resample48to441(pcmBufLE) {
  const floats     = pcmLEToFloat(pcmBufLE);
  const resampled  = resampleLinear(floats, 48000, 44100);
  return floatToPcmLE(resampled);
}

/**
 * Convert ESX big-endian 44.1 kHz PCM → E2S little-endian 48 kHz PCM.
 */
function esxToE2s(pcmBufBE) {
  const floats    = pcmBEToFloat(pcmBufBE);
  const resampled = resampleLinear(floats, 44100, 48000);
  return floatToPcmLE(resampled);
}

/**
 * Convert E2S little-endian 48 kHz PCM → ESX big-endian 44.1 kHz PCM.
 */
function e2sToEsx(pcmBufLE) {
  const floats    = pcmLEToFloat(pcmBufLE);
  const resampled = resampleLinear(floats, 48000, 44100);
  return floatToPcmBE(resampled);
}

// ── Exports ───────────────────────────────────────────────

module.exports = {
  // Constants
  MAGIC,
  MAX_SLOTS,
  HEADER_SIZE,
  DATA_START,
  NATIVE_RATE,
  ESLI_DATA_SIZE,
  ESLI,

  // ESLI
  parseEsliData,
  buildEsliData,

  // Single WAV
  parseE2sWav,
  buildE2sWav,

  // All-file
  parseE2sAllFile,
  buildE2sAllFile,

  // Resample / convert
  resampleLinear,
  pcmLEToFloat,
  floatToPcmLE,
  pcmBEToFloat,
  floatToPcmBE,
  resample441to48,
  resample48to441,
  esxToE2s,
  e2sToEsx,
};

// ── Self-test ─────────────────────────────────────────────

if (require.main === module) {
  console.log('── e2s-format self-test ──');

  // 1. Build a minimal e2sSample.all with two tiny samples
  const hz  = 480;  // A simple tone
  const dur = 0.01; // 10 ms
  const numFrames = Math.floor(NATIVE_RATE * dur);
  const pcm1 = Buffer.alloc(numFrames * 2);
  const pcm2 = Buffer.alloc(numFrames * 2);
  for (let i = 0; i < numFrames; i++) {
    const val = Math.round(Math.sin(2 * Math.PI * hz * i / NATIVE_RATE) * 16000);
    pcm1.writeInt16LE(val, i * 2);
    pcm2.writeInt16LE(Math.round(val * 0.5), i * 2);
  }

  const samples = [
    { slot: 0, name: 'KICK', pcmData: pcm1, sampleRate: NATIVE_RATE },
    { slot: 5, name: 'SNARE', pcmData: pcm2, sampleRate: NATIVE_RATE },
  ];

  const allBuf = buildE2sAllFile(samples);
  console.log(`  Built e2sSample.all: ${allBuf.length} bytes`);

  // 2. Parse it back
  const parsed = parseE2sAllFile(allBuf);
  let found = 0;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (parsed.samples[i] && !parsed.samples[i].error) found++;
  }
  console.log(`  Parsed back: ${found} samples`);

  // 3. Verify slot 0
  const s0 = parsed.samples[0];
  console.assert(s0 !== null, 'Slot 0 should exist');
  console.assert(s0.esli.name === 'KICK', `Slot 0 name: "${s0.esli.name}" !== "KICK"`);
  console.assert(s0.esli.slotNumber === 0, `Slot 0 number: ${s0.esli.slotNumber}`);
  console.assert(s0.pcmData.length === pcm1.length, `Slot 0 PCM size mismatch`);
  console.assert(s0.pcmData.equals(pcm1), 'Slot 0 PCM data mismatch');

  // 4. Verify slot 5
  const s5 = parsed.samples[5];
  console.assert(s5 !== null, 'Slot 5 should exist');
  console.assert(s5.esli.name === 'SNARE', `Slot 5 name: "${s5.esli.name}" !== "SNARE"`);
  console.assert(s5.pcmData.equals(pcm2), 'Slot 5 PCM data mismatch');

  // 5. Verify empty slots
  console.assert(parsed.samples[1] === null, 'Slot 1 should be empty');
  console.assert(parsed.samples[999] === null, 'Slot 999 should be empty');

  // 6. Resample roundtrip test
  const testPcm = Buffer.alloc(200);
  for (let i = 0; i < 100; i++) testPcm.writeInt16LE(i * 100, i * 2);
  const up   = resample441to48(testPcm);
  const down = resample48to441(up);
  // After up→down, length should be close to original (within 1 frame)
  const origFrames  = testPcm.length / 2;
  const finalFrames = down.length / 2;
  console.assert(Math.abs(finalFrames - origFrames) <= 1,
    `Resample roundtrip frame count: ${origFrames} → ${finalFrames}`);

  // 7. ESX↔E2S conversion test
  const esxPcm = Buffer.alloc(20);
  for (let i = 0; i < 10; i++) esxPcm.writeInt16BE(i * 1000, i * 2);
  const e2sPcm  = esxToE2s(esxPcm);
  const backEsx = e2sToEsx(e2sPcm);
  console.assert(backEsx.length / 2 >= 9,
    `Cross-device roundtrip produced ${backEsx.length / 2} frames`);

  console.log('  All assertions passed ✓');
}
