/**
 * ESX fixture generators.
 * Uses the real createEmptyEsx/buildEsxFile functions so fixtures
 * stay in sync with the parser under test.
 */
'use strict';

const {
  createEmptyEsx,
  buildEsxFile,
  ADDR,
  SIZE,
  NUM,
} = require('../../../src/esx-format');

/**
 * Generate a minimal valid empty ESX file (no samples).
 */
function generateMinimalESX() {
  return createEmptyEsx();
}

/**
 * Generate an ESX file with one named pattern (still no samples).
 */
function generateESXWithPattern(name = 'TESTPAT', tempo = 140.0) {
  const buf = createEmptyEsx();
  const patOff = ADDR.PATTERN_DATA;

  // Overwrite pattern 0 name
  buf.fill(0x20, patOff, patOff + 8);
  buf.write(name.substring(0, 8), patOff, 'ascii');

  // Overwrite tempo (BPM x 128, uint16BE)
  buf.writeUInt16BE(Math.round(tempo * 128), patOff + 8);

  return buf;
}

/**
 * Generate an ESX file with one mono sample (sine wave).
 */
function generateESXWithSample(name = 'TESTSMP', durationMs = 100) {
  const sampleRate = 44100;
  const numFrames = Math.floor(sampleRate * durationMs / 1000);
  const pcmData = Buffer.alloc(numFrames * 2);

  // 440 Hz sine wave, big-endian 16-bit (ESX native format)
  for (let i = 0; i < numFrames; i++) {
    const val = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000);
    pcmData.writeInt16BE(val, i * 2);
  }

  return buildEsxFile([{ name, pcmData, sampleRate, numFrames }]);
}

/**
 * Generate an ESX file with N samples for stress testing.
 */
function generateESXWithNSamples(count) {
  const sampleRate = 44100;
  const framesPerSample = 100; // tiny samples
  const samples = [];

  for (let i = 0; i < count; i++) {
    const pcmData = Buffer.alloc(framesPerSample * 2);
    for (let f = 0; f < framesPerSample; f++) {
      pcmData.writeInt16BE(f * 10, f * 2);
    }
    samples.push({
      name: `SMP${String(i).padStart(3, '0')}`,
      pcmData,
      sampleRate,
      numFrames: framesPerSample,
    });
  }

  return buildEsxFile(samples);
}

/**
 * Generate a minimal 16-bit mono WAV buffer at 44100 Hz.
 */
function generateWav(durationMs = 50, sampleRate = 44100) {
  const numFrames = Math.floor(sampleRate * durationMs / 1000);
  const dataSize = numFrames * 2;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);        // PCM
  wav.writeUInt16LE(1, 22);        // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numFrames; i++) {
    const val = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000);
    wav.writeInt16LE(val, 44 + i * 2);
  }

  return wav;
}

module.exports = {
  generateMinimalESX,
  generateESXWithPattern,
  generateESXWithSample,
  generateESXWithNSamples,
  generateWav,
};
