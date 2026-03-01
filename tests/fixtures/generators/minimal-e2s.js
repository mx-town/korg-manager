/**
 * E2S fixture generators.
 * Uses the real buildE2sAllFile/buildE2sWav functions.
 */
'use strict';

const {
  buildE2sAllFile,
  buildE2sWav,
  buildEsliData,
  NATIVE_RATE,
  MAX_SLOTS,
} = require('../../../src/e2s-format');

/**
 * Generate a minimal valid e2sSample.all with no samples.
 */
function generateEmptyE2S() {
  return buildE2sAllFile([]);
}

/**
 * Generate an e2sSample.all with one sample at a given slot.
 */
function generateE2SWithSample(slot = 0, name = 'KICK', durationMs = 10) {
  const numFrames = Math.floor(NATIVE_RATE * durationMs / 1000);
  const pcmData = Buffer.alloc(numFrames * 2);

  for (let i = 0; i < numFrames; i++) {
    const val = Math.round(Math.sin(2 * Math.PI * 480 * i / NATIVE_RATE) * 16000);
    pcmData.writeInt16LE(val, i * 2);
  }

  return buildE2sAllFile([{ slot, name, pcmData, sampleRate: NATIVE_RATE }]);
}

/**
 * Generate an e2sSample.all with multiple samples.
 */
function generateE2SWithNSamples(count) {
  const numFrames = Math.floor(NATIVE_RATE * 0.01); // 10ms each
  const samples = [];

  for (let i = 0; i < count && i < MAX_SLOTS; i++) {
    const pcmData = Buffer.alloc(numFrames * 2);
    for (let f = 0; f < numFrames; f++) {
      pcmData.writeInt16LE(f * 10, f * 2);
    }
    samples.push({
      slot: i,
      name: `SMP${String(i).padStart(3, '0')}`,
      pcmData,
      sampleRate: NATIVE_RATE,
    });
  }

  return buildE2sAllFile(samples);
}

module.exports = {
  generateEmptyE2S,
  generateE2SWithSample,
  generateE2SWithNSamples,
};
