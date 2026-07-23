/**
 * File-tabs store adapters — Unified Sample Manager v2.
 *
 * The unified SAMPLE MANAGER view keeps every open file's samples in the same
 * shape main.js has always used for currentSamples ("view-native"): a DENSE
 * array of { name, pcmData (16-bit BIG-endian), sampleRate, numFrames,
 * duration, originalPath, folder, _undo, _redo, _original }. That is what all
 * existing esx: handlers (FX, undo, waveform, preview) operate on unchanged.
 *
 * This module is the pure, Electron-free bridge between that store shape and
 * the bank.js bank shape (device-native endianness, slot-addressed arrays):
 *
 *   - E2S files are byte-swapped LE->BE on load and BE->LE on save/transfer
 *     (lossless Buffer.swap16 on a copy).
 *   - E2S per-sample metadata (slot, category, tune, boost, loopType,
 *     loopStart/End, playVolume) rides along in an `_e2s` bag so a save
 *     round-trips losslessly. The ORIGINAL SLOT is preserved because E2S
 *     patterns reference samples by slot number — compacting slots on save
 *     would silently remap every pattern on the hardware.
 *   - Loop frames are clamped (or dropped) on save when a sample was
 *     shortened by editing.
 */

'use strict';

const bank = require('./bank');

// Display/budget cap for the storage bar when an E2S file is active
// (E2S hardware sample RAM ≈ 24 MB — same figure the old E2S tab showed).
const E2S_MAX_SAMPLE_BYTES = 24 * 1024 * 1024;

/** Lossless 16-bit endianness swap on a copy (never mutates the input). */
function swap16Copy(buf) {
  const out = Buffer.from(buf);
  if (out.length % 2 !== 0) return out; // defensive: PCM is always even-length
  out.swap16();
  return out;
}

/**
 * Convert one bankSample to a view-native store sample.
 * ESX PCM is already BE and is adopted by reference (the bank was built from
 * a freshly read buffer, so the store becomes its sole owner).
 */
function bankSampleToStore(bs, device, slot) {
  const store = {
    name: bs.name,
    pcmData: device === 'e2s' ? swap16Copy(bs.pcmData) : bs.pcmData,
    sampleRate: bs.sampleRate,
    numFrames: bs.numFrames,
    duration: bs.duration,
    originalPath: null,
    folder: null,
    _undo: [],
    _redo: [],
    _original: null,
  };
  if (device === 'e2s') {
    const e = bs._e2s || {};
    store._e2s = {
      slot: slot != null ? slot : null,
      category: bs.category ?? 0,
      tune: bs.tune ?? 0,
      boost: bs.boost ?? 127,
      loopType: e.loopType ?? 0,
      playVolume: e.playVolume ?? 0x4000,
      loopStart: bs.loopStart ?? null,
      loopEnd: bs.loopEnd ?? null,
      startPoint: e.startPoint ?? 0,
      endPoint: e.endPoint ?? null, // null => full sample on save
    };
  }
  return store;
}

/**
 * Bank -> dense view-native store array, ordered by slot.
 * E2S store samples carry their original slot in `_e2s.slot`.
 */
function bankToStore(bankObj) {
  const out = [];
  for (let slot = 0; slot < bankObj.samples.length; slot++) {
    const bs = bankObj.samples[slot];
    if (!bs || !bs.pcmData || bs.pcmData.length === 0) continue;
    out.push(bankSampleToStore(bs, bankObj.device, slot));
  }
  return out;
}

/** Clamp a loop frame pair to a (possibly shortened) sample; drops the loop
 *  entirely when loopStart no longer fits. */
function clampLoop(loopStart, loopEnd, numFrames) {
  if (loopStart == null || numFrames <= 0) return { loopStart: null, loopEnd: null };
  if (loopStart >= numFrames) return { loopStart: null, loopEnd: null };
  let end = loopEnd;
  if (end != null && end > numFrames - 1) end = numFrames - 1;
  return { loopStart, loopEnd: end };
}

/**
 * Dense view-native store array -> E2S bank (LE PCM, slot-addressed).
 * Samples keep their original slot when it is still free; samples without a
 * slot (new imports, duplicates, cross-device copies that bypassed bank.js)
 * get the next free slot. The assigned slot is written back into the store
 * sample's `_e2s.slot` so dense-index -> slot translation stays reliable
 * (transfer and save both depend on it).
 */
function storeToE2sBank(samples, filePath, fileName) {
  const arr = new Array(bank.E2S_MAX_SLOTS).fill(null);

  const place = (s) => {
    const want = s._e2s && s._e2s.slot != null ? s._e2s.slot : null;
    if (want != null && want >= 0 && want < bank.E2S_MAX_SLOTS && !arr[want]) return want;
    for (let i = 0; i < bank.E2S_MAX_SLOTS; i++) if (!arr[i]) return i;
    return null;
  };

  // First pass: samples with a preserved slot claim it; second pass fills the rest.
  const withSlot = samples.filter(s => s._e2s && s._e2s.slot != null);
  const withoutSlot = samples.filter(s => !(s._e2s && s._e2s.slot != null));

  for (const s of [...withSlot, ...withoutSlot]) {
    if (!s || !s.pcmData || s.pcmData.length === 0) continue;
    const slot = place(s);
    if (slot == null) break; // file table full — silently drop is impossible (1000 slots)
    if (!s._e2s) s._e2s = {};
    s._e2s.slot = slot; // write-back: keeps dense-index -> slot translation reliable
    const meta = s._e2s;
    const numFrames = s.pcmData.length / 2;
    const { loopStart, loopEnd } = clampLoop(meta.loopStart, meta.loopEnd, numFrames);
    // A loop that no longer fits is dropped ENTIRELY — loopType must follow,
    // else the saved ESLI would claim a loop at the no-loop sentinel.
    const loopDropped = meta.loopStart != null && loopStart == null;
    arr[slot] = {
      name: s.name,
      pcmData: swap16Copy(s.pcmData), // view-native BE -> device-native LE
      sampleRate: s.sampleRate || bank.E2S_RATE,
      stereo: false,
      numFrames,
      duration: numFrames / (s.sampleRate || bank.E2S_RATE),
      loopStart,
      loopEnd,
      category: meta.category ?? 0,
      tune: meta.tune ?? 0,
      boost: meta.boost ?? 127,
      _e2s: {
        loopType: loopDropped ? 0 : (meta.loopType ?? 0),
        playVolume: meta.playVolume ?? 0x4000,
        startPoint: meta.startPoint ?? 0,
        endPoint: meta.endPoint ?? undefined, // build clamps to sample length
      },
      undoStack: [],
      redoStack: [],
      _original: null,
    };
  }

  return {
    device: 'e2s',
    filePath: filePath || null,
    fileName: fileName || null,
    samples: arr,
    originalBuffer: null,
    dirty: false,
  };
}

/**
 * Dense view-native store array -> ESX bank (BE PCM, dense slots).
 * ESX slot numbers ARE list positions — exactly how main.js has always
 * treated currentSamples.
 */
function storeToEsxBank(samples, filePath, fileName, originalBuffer) {
  const arr = new Array(bank.ESX_MONO_SLOTS).fill(null);
  for (let i = 0; i < samples.length && i < bank.ESX_MONO_SLOTS; i++) {
    const s = samples[i];
    if (!s || !s.pcmData || s.pcmData.length === 0) continue;
    arr[i] = {
      name: s.name,
      pcmData: s.pcmData, // already BE; transfer/serialize never mutate PCM
      sampleRate: s.sampleRate || bank.ESX_RATE,
      stereo: false,
      numFrames: s.numFrames,
      duration: s.duration,
      loopStart: null, // main.js store carries no ESX loop info (existing behavior)
      loopEnd: null,
      category: undefined,
      tune: undefined,
      boost: undefined,
      _e2s: undefined,
      undoStack: [],
      redoStack: [],
      _original: null,
    };
  }
  return {
    device: 'esx',
    filePath: filePath || null,
    fileName: fileName || null,
    samples: arr,
    originalBuffer: originalBuffer || null,
    dirty: false,
  };
}

/** Dense store array -> bank, dispatched by device. */
function storeToBank(samples, device, { filePath, fileName, originalBuffer } = {}) {
  return device === 'e2s'
    ? storeToE2sBank(samples, filePath, fileName)
    : storeToEsxBank(samples, filePath, fileName, originalBuffer);
}

module.exports = {
  E2S_MAX_SAMPLE_BYTES,
  swap16Copy,
  bankSampleToStore,
  bankToStore,
  storeToBank,
  storeToEsxBank,
  storeToE2sBank,
  clampLoop,
};
