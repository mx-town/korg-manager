/**
 * Bank Model — device-neutral dual-bank sample manager core (Project S).
 *
 * A pure, Electron-free module: require()-able in Node and unit-testable with
 * fixture buffers. It never re-implements parsing or resampling — it wraps the
 * existing esx-format.js / e2s-format.js primitives.
 *
 * Endianness is a FROZEN decision: a bankSample's pcmData stays in DEVICE-NATIVE
 * endianness (ESX = 16-bit BIG-endian, E2S = 16-bit LITTLE-endian), never a
 * canonical form. This lets createEsxBank/createE2sBank wrap existing PCM with
 * zero re-encoding, and lets copySamples call the dormant cross-device
 * converters (esxToE2s / e2sToEsx) directly. DSP is device-neutral via
 * `sampleRate` alone; endianness at DSP time is resolved from bank.device.
 */

'use strict';

const esx = require('./esx-format');
const e2s = require('./e2s-format');
const fileIO = require('./file-io');

// ── Constants ──────────────────────────────────────────────

const ESX_RATE = 44100;                         // ESX-1 native sample rate
const E2S_RATE = e2s.NATIVE_RATE;               // 48000

const ESX_MONO_SLOTS = esx.NUM.MONO_SAMPLES;    // 256 (mono-addressed slot count)
const ESX_STEREO_SLOTS = esx.NUM.STEREO_SAMPLES;// 128 (max stereo samples)
const E2S_MAX_SLOTS = e2s.MAX_SLOTS;            // 1020 (offset-table entries in the file)
const E2S_MAX_SAMPLE_INDEX = e2s.MAX_SAMPLE_INDEX;   // 998 → sample #999, last addressable
const E2S_STOCK_BASE = e2s.STOCK_USER_BASE;          // 421 → sample #422 (stock user area)
const E2S_HACKTRIBE_BASE = e2s.HACKTRIBE_USER_BASE;  // 500 → sample #501 (Hacktribe user area)

// The .esx sample-memory budget must be capped by whichever is smaller: the
// hardware sample-RAM limit. .esx files are variable-sized (0x250010 + currentOffset),
// so the ceiling is the sample memory the free-space block declares, not a file size.
// buildEsxFile/rebuildEsxFile now throw rather than truncate past it.
const ESX_MAX_SAMPLE_BYTES = Math.min(esx.SIZE.MAX_SAMPLE_BYTES, esx.SAMPLE_MEM_END);
const ESX_BLOCK_OVERHEAD = 16;                  // per-sample block header in buildEsxFile

const E2S_LOOP_SENTINEL = 0xFFFFFFFF;           // "no loop" in ESLI / ESX headers
const E2S_DEFAULT_PLAY_VOLUME = 0x4000;
const E2S_DEFAULT_LOUDNESS = 127;

// ── Device helpers ─────────────────────────────────────────

/**
 * Max addressable slots for a device — the copy/allocation ceiling.
 * E2S: sample numbers go up to #999 (index 998), NOT the full 1020-entry file
 * offset table — copies must never land in slots the hardware can't address.
 */
function maxSlots(device) {
  return device === 'esx' ? ESX_MONO_SLOTS : E2S_MAX_SAMPLE_INDEX + 1;
}

/**
 * First slot index new E2S samples may occupy. Hacktribe firmware keeps sample
 * numbers 1–500 in flash and IGNORES table entries below index 500 — a sample
 * written there simply never appears on the device. Stock firmware addresses
 * user samples from #422 (index 421).
 */
function e2sUserBase(bank) {
  return bank && bank.hacktribe === false ? E2S_STOCK_BASE : E2S_HACKTRIBE_BASE;
}

/**
 * Detect the firmware layout from the used slots: any sample below index 500
 * can only come from a stock-firmware file (Hacktribe never writes there).
 * Empty banks default to Hacktribe's base — index 500 is inside the stock
 * user area too, so that default is safe on both firmwares.
 */
function detectHacktribe(samples) {
  for (let i = 0; i < E2S_HACKTRIBE_BASE && i < samples.length; i++) {
    if (samples[i]) return false;
  }
  return true;
}

/** Native sample rate for a device. */
function deviceRate(device) {
  return device === 'esx' ? ESX_RATE : E2S_RATE;
}

/**
 * Detect the bank device from a raw file buffer (+ optional filename).
 * Returns 'esx' | 'e2s' | null. Reuses file-io's magic/size/extension logic.
 */
function detectDevice(buffer, fileName) {
  const fmt = fileIO.detectFormat(buffer, fileName);
  return fmt === 'esx' || fmt === 'e2s' ? fmt : null;
}

// ── Bank construction ──────────────────────────────────────

/** Fresh per-sample undo/redo bookkeeping fields. */
function newHistory() {
  return { undoStack: [], redoStack: [], _original: null };
}

/**
 * Build an ESX bank from a .esx file buffer.
 * pcmData is kept BIG-endian (as parseEsxFile returns it) — zero re-encode.
 * originalBuffer is preserved so serializeBank can rebuild pattern-safely.
 */
function createEsxBank(buffer, filePath, fileName) {
  const parsed = esx.parseEsxFile(buffer);
  const samples = new Array(ESX_MONO_SLOTS).fill(null);

  for (let i = 0; i < ESX_MONO_SLOTS; i++) {
    const s = parsed.monoSamples[i];
    if (!s || !s.pcmData || s.pcmData.length === 0) continue;

    const sampleRate = s.sampleRate || ESX_RATE;
    const stereo = false; // Project S: only mono ESX PCM is editable
    const numFrames = s.pcmData.length / 2;
    // Hardware .esx files stamp loopStart == endFrame on one-shots (not a real
    // loop). Only treat loopStart strictly before endFrame as a genuine loop,
    // else ESX->E2S conversion would spuriously flag every sample as looping.
    const hasLoop = s.loopStart != null && s.endFrame != null && s.loopStart < s.endFrame;
    const loopStart = hasLoop ? s.loopStart : null;
    const loopEnd = hasLoop ? s.endFrame : null;

    samples[i] = {
      name: s.name || `Sample ${i + 1}`,
      pcmData: s.pcmData,
      sampleRate,
      stereo,
      numFrames,
      duration: numFrames / sampleRate,
      loopStart,
      loopEnd,
      category: undefined, // E2S-only fields stay undefined on ESX
      tune: undefined,
      boost: undefined,
      _e2s: undefined,
      ...newHistory(),
    };
  }

  return {
    device: 'esx',
    filePath: filePath || null,
    fileName: fileName || null,
    samples,
    originalBuffer: buffer,
    dirty: false,
  };
}

/**
 * Build an E2S bank from an e2sSample.all file buffer.
 * pcmData is kept LITTLE-endian (as parseE2sAllFile returns it) — zero re-encode.
 */
function createE2sBank(buffer, filePath, fileName) {
  const parsed = e2s.parseE2sAllFile(buffer);
  const samples = new Array(E2S_MAX_SLOTS).fill(null);

  for (let i = 0; i < E2S_MAX_SLOTS; i++) {
    const s = parsed.samples[i];
    if (!s || s.error || !s.pcmData || s.pcmData.length === 0) continue;
    const esli = s.esli || {};

    const sampleRate = esli.sampleRate || E2S_RATE;
    const stereo = false; // Project S: E2S user samples are mono
    const numFrames = s.pcmData.length / 2;
    const loopStart = (esli.loopStart == null || esli.loopStart === E2S_LOOP_SENTINEL)
      ? null : esli.loopStart;
    const loopEnd = loopStart != null ? (esli.endPoint ?? null) : null;

    samples[i] = {
      name: esli.name || `Sample ${i}`,
      pcmData: s.pcmData,
      sampleRate,
      stereo,
      numFrames,
      duration: numFrames / sampleRate,
      loopStart,
      loopEnd,
      category: esli.category ?? 0,
      tune: esli.playLogPeriod ?? 0,
      boost: esli.loudness ?? E2S_DEFAULT_LOUDNESS,
      // Lossless E2S->E2S round-trip bag for fields not surfaced above.
      // startPoint/endPoint: hardware-trimmed playback region — must survive
      // a save (buildE2sAllFile would otherwise reset to the full sample).
      _e2s: {
        loopType: esli.loopType ?? 0,
        playVolume: esli.playVolume ?? E2S_DEFAULT_PLAY_VOLUME,
        startPoint: esli.startPoint ?? 0,
        endPoint: esli.endPoint ?? null,
        // Save-fidelity carriers: the raw 1172-byte ESLI block (preserve-and-
        // patch) and the WAV channel count (real dumps contain stereo samples).
        _raw: esli._raw ?? null,
        channels: s.channels ?? 1,
      },
      ...newHistory(),
    };
  }

  return {
    device: 'e2s',
    filePath: filePath || null,
    fileName: fileName || null,
    samples,
    originalBuffer: null, // E2S has no checksums — no rebuild anchor needed
    hacktribe: detectHacktribe(samples),
    dirty: false,
  };
}

/**
 * Auto-detect the device from the buffer and build the matching bank.
 * Throws on an unsupported/unrecognized file.
 */
function createBankFromBuffer(buffer, filePath, fileName) {
  const device = detectDevice(buffer, fileName);
  if (device === 'esx') return createEsxBank(buffer, filePath, fileName);
  if (device === 'e2s') return createE2sBank(buffer, filePath, fileName);
  throw new Error('Unsupported bank file (expected .esx or e2sSample.all)');
}

// ── UI projection ──────────────────────────────────────────

/**
 * Project a single bankSample to a lightweight renderer row.
 * device-aware only for defaulting the rate; endianness is not exposed.
 */
function sampleToUI(sample, slot, device) {
  if (!sample) return null;
  const rate = sample.sampleRate || deviceRate(device);
  const row = {
    slot,
    name: sample.name,
    sampleRate: rate,
    stereo: !!sample.stereo,
    numFrames: sample.numFrames,
    duration: sample.duration != null ? sample.duration : sample.numFrames / rate,
    loopStart: sample.loopStart ?? null,
    loopEnd: sample.loopEnd ?? null,
  };
  if (device === 'e2s') {
    row.category = sample.category;
    row.tune = sample.tune;
    row.boost = sample.boost;
  }
  return row;
}

/**
 * Project a whole bank to the renderer shape used by bank:list / copy refresh.
 */
function bankToUI(bank) {
  if (!bank) return null;
  const samples = bank.samples.map((s, i) => sampleToUI(s, i, bank.device));
  return {
    device: bank.device,
    filePath: bank.filePath,
    fileName: bank.fileName,
    dirty: !!bank.dirty,
    maxSlots: maxSlots(bank.device),
    hacktribe: bank.device === 'e2s' ? bank.hacktribe !== false : undefined,
    userBase: bank.device === 'e2s' ? e2sUserBase(bank) : undefined,
    count: samples.filter(Boolean).length,
    samples,
  };
}

// ── Serialization ──────────────────────────────────────────

/**
 * Serialize a bank back to its device file format.
 * ESX: pattern-safe rebuild from the preserved original buffer.
 * E2S: fresh all-file build (format has no checksums).
 * ESX export validation/auto-repair is applied by the bank:save IPC layer,
 * keeping this module free of that dependency and of Electron.
 */
function serializeBank(bank) {
  if (bank.device === 'esx') {
    const list = bank.samples.map(s => {
      if (!s || !s.pcmData || s.pcmData.length === 0) return null;
      return {
        name: s.name,
        pcmData: s.pcmData,        // already BIG-endian
        sampleRate: s.sampleRate || ESX_RATE,
        numFrames: s.numFrames,
        loopStart: s.loopStart,    // null => rebuild defaults to endFrame (KB-silence guard)
      };
    });
    const base = bank.originalBuffer || esx.createEmptyEsx();
    return esx.rebuildEsxFile(base, list);
  }

  // E2S
  const list = bank.samples.map((s, i) => {
    if (!s || !s.pcmData || s.pcmData.length === 0) return null;
    const e = s._e2s || {};
    return {
      slot: i,
      name: s.name,
      pcmData: s.pcmData,          // already LITTLE-endian
      sampleRate: s.sampleRate || E2S_RATE,
      category: s.category ?? 0,
      playLogPeriod: s.tune ?? 0,
      playVolume: e.playVolume ?? E2S_DEFAULT_PLAY_VOLUME,
      loudness: s.boost ?? E2S_DEFAULT_LOUDNESS,
      loopType: e.loopType ?? 0,
      loopStart: s.loopStart == null ? E2S_LOOP_SENTINEL : s.loopStart,
      startPoint: e.startPoint,
      endPoint: e.endPoint ?? undefined, // undefined => full sample (build clamps)
      _raw: e._raw ?? null,              // preserve undocumented ESLI bytes
      channels: e.channels ?? 1,         // keep stereo fmt chunks byte-identical
    };
  });
  return e2s.buildE2sAllFile(list);
}

// ── Copy & conversion ──────────────────────────────────────

/** Rescale a loop frame index between sample rates (null passes through). */
function rescaleFrame(frame, fromRate, toRate, maxFrame) {
  if (frame == null) return null;
  let f = Math.round(frame * (toRate / fromRate));
  if (maxFrame != null && f > maxFrame) f = maxFrame;
  if (f < 0) f = 0;
  return f;
}

/**
 * Produce a NEW bankSample destined for `toDevice`, converting PCM + rate +
 * loop points as needed. Never mutates the source; always deep-copies PCM.
 */
function convertSample(sample, fromDevice, toDevice) {
  const hist = newHistory();
  const loop = sample.loopStart != null;

  // Same device — lossless 1:1 copy (PCM already in the correct endianness).
  if (fromDevice === toDevice) {
    return {
      name: sample.name,
      pcmData: Buffer.from(sample.pcmData),
      sampleRate: sample.sampleRate,
      stereo: !!sample.stereo,
      numFrames: sample.numFrames,
      duration: sample.duration,
      loopStart: sample.loopStart ?? null,
      loopEnd: sample.loopEnd ?? null,
      category: toDevice === 'e2s' ? (sample.category ?? 0) : undefined,
      tune: toDevice === 'e2s' ? (sample.tune ?? 0) : undefined,
      boost: toDevice === 'e2s' ? (sample.boost ?? E2S_DEFAULT_LOUDNESS) : undefined,
      _e2s: toDevice === 'e2s'
        ? { ...(sample._e2s || { loopType: loop ? 1 : 0, playVolume: E2S_DEFAULT_PLAY_VOLUME }) }
        : undefined,
      ...hist,
    };
  }

  const stereo = !!sample.stereo;

  // ESX (BE) -> E2S (LE 48). Resample from the sample's ACTUAL rate — ESX
  // banks legitimately hold 22050/11025 Hz samples; assuming 44.1 would
  // pitch-shift them (silent corruption of the copy).
  if (fromDevice === 'esx' && toDevice === 'e2s') {
    const fromRate = sample.sampleRate || ESX_RATE;
    const pcmData = fromRate === ESX_RATE
      ? e2s.esxToE2s(sample.pcmData)
      : e2s.floatToPcmLE(e2s.resampleLinear(e2s.pcmBEToFloat(sample.pcmData), fromRate, E2S_RATE));
    const numFrames = pcmData.length / 2 / (stereo ? 2 : 1);
    return {
      name: sample.name,
      pcmData,
      sampleRate: E2S_RATE,
      stereo,
      numFrames,
      duration: numFrames / E2S_RATE,
      loopStart: rescaleFrame(sample.loopStart, fromRate, E2S_RATE, numFrames - 1),
      loopEnd: rescaleFrame(sample.loopEnd, fromRate, E2S_RATE, numFrames - 1),
      category: 0, // "User" on cross-device import
      tune: 0,
      boost: E2S_DEFAULT_LOUDNESS,
      _e2s: { loopType: loop ? 1 : 0, playVolume: E2S_DEFAULT_PLAY_VOLUME },
      ...hist,
    };
  }

  // E2S (LE) -> ESX (BE 44.1) — same actual-rate rule as above.
  const fromRate = sample.sampleRate || E2S_RATE;
  const pcmData = fromRate === E2S_RATE
    ? e2s.e2sToEsx(sample.pcmData)
    : e2s.floatToPcmBE(e2s.resampleLinear(e2s.pcmLEToFloat(sample.pcmData), fromRate, ESX_RATE));
  const numFrames = pcmData.length / 2 / (stereo ? 2 : 1);
  return {
    name: sample.name,
    pcmData,
    sampleRate: ESX_RATE,
    stereo,
    numFrames,
    duration: numFrames / ESX_RATE,
    loopStart: rescaleFrame(sample.loopStart, fromRate, ESX_RATE, numFrames - 1),
    loopEnd: rescaleFrame(sample.loopEnd, fromRate, ESX_RATE, numFrames - 1),
    category: undefined,
    tune: undefined,
    boost: undefined,
    _e2s: undefined,
    ...hist,
  };
}

/**
 * Allocate destination slot indices.
 * - targetSlot given: consecutive slots from targetSlot (overwrite allowed);
 *   fails only if it would run past the device's slot range.
 * - targetSlot null: free slots. ESX fills from 0 (dense numbering); E2S
 *   APPENDS after the highest used slot (device patterns reference sample
 *   numbers, so existing slots are never renumbered) and never allocates
 *   below the firmware's user base (Hacktribe ignores entries under #501).
 * Returns number[] or null when allocation is impossible.
 */
function allocateSlots(toBank, count, targetSlot) {
  const max = maxSlots(toBank.device);
  if (targetSlot != null) {
    if (targetSlot < 0 || targetSlot + count > max) return null;
    return Array.from({ length: count }, (_, i) => targetSlot + i);
  }
  if (toBank.device !== 'e2s') {
    const free = [];
    for (let i = 0; i < max && free.length < count; i++) {
      if (!toBank.samples[i]) free.push(i);
    }
    return free.length >= count ? free : null;
  }
  // E2S: continue after the highest occupied slot, floor at the user base.
  const base = e2sUserBase(toBank);
  let highest = -1;
  for (let i = 0; i < toBank.samples.length; i++) if (toBank.samples[i]) highest = i;
  const start = Math.max(base, highest + 1);
  const free = [];
  for (let i = start; i < max && free.length < count; i++) {
    if (!toBank.samples[i]) free.push(i);
  }
  // Top of the range exhausted — fall back to free holes at/above the base.
  for (let i = base; i < start && free.length < count; i++) {
    if (!toBank.samples[i]) free.push(i);
  }
  free.sort((a, b) => a - b);
  return free.length >= count ? free : null;
}

/** ESX sample-memory footprint of a samples array (mirrors buildEsxFile). */
function esxSampleMemory(samples) {
  let off = 0;
  let mono = 0;
  for (let i = 0; i < samples.length && mono < ESX_MONO_SLOTS; i++) {
    const s = samples[i];
    if (!s || !s.pcmData || s.pcmData.length === 0) continue;
    off += ESX_BLOCK_OVERHEAD + s.pcmData.length;
    off = (off + 4) & ~3; // 4-byte alignment + inter-block padding, as buildEsxFile does
    mono++;
  }
  return off;
}

/**
 * Copy samples from one bank into another with automatic conversion.
 *
 * Rules (all enforced by an up-front preflight — strictly all-or-nothing;
 * on ANY failure the returned object has ok:false and toBank is untouched):
 *   - same device: lossless 1:1 copy;
 *   - ESX->E2S: 44.1->48 kHz, category defaults to "User";
 *   - E2S->ESX: 48->44.1 kHz;
 *   - loop points are always carried (frame-rescaled on cross-rate copy);
 *   - stereo samples may only occupy ESX stereo slots (max 128);
 *   - enough free (type-compatible) slots AND, for ESX, sample-memory budget.
 *
 * @returns CopyResult:
 *   ok true  => { ok, reason:'ok', copied, converted, fromRate, toRate,
 *                 assignments:[{from,to}], message }
 *   ok false => { ok:false, reason, error }
 */
function copySamples(fromBank, slots, toBank, targetSlot = null) {
  if (!fromBank || !toBank) {
    return { ok: false, reason: 'no-bank', error: 'Source or target bank is missing' };
  }

  // Gather + validate the source samples.
  const sources = [];
  for (const slot of slots) {
    const s = fromBank.samples[slot];
    if (!s) {
      return { ok: false, reason: 'empty-source', error: `Source slot ${slot} is empty` };
    }
    sources.push({ slot, sample: s });
  }
  if (sources.length === 0) {
    return { ok: false, reason: 'nothing-to-copy', error: 'No source slots selected' };
  }

  const converted = fromBank.device !== toBank.device;

  // Convert once, up-front (also gives us final PCM lengths for the budget).
  const prepared = sources.map(({ sample }) =>
    convertSample(sample, fromBank.device, toBank.device));

  // ── Preflight: slot allocation ──
  const alloc = allocateSlots(toBank, prepared.length, targetSlot);
  if (!alloc) {
    return targetSlot != null
      ? { ok: false, reason: 'slot-out-of-range',
          error: `Target slot ${targetSlot} + ${prepared.length} exceeds ${maxSlots(toBank.device)} slots` }
      : { ok: false, reason: 'insufficient-slots',
          error: `Not enough free slots in target bank (need ${prepared.length})` };
  }

  // Build a hypothetical post-copy array for the remaining checks (no mutation).
  const hypothetical = toBank.samples.slice();
  alloc.forEach((slot, i) => { hypothetical[slot] = prepared[i]; });

  // ── Preflight: ESX stereo-slot rule (stereo only into ESX stereo slots) ──
  // NOTE: In Project S every bankSample is mono (createEsx/E2sBank force
  // stereo:false), so this guard is dormant. Real stereo enforcement — routing
  // a stereo sample to a stereo-addressed slot and stereo-aware conversion —
  // is deferred to Project B (stereo import); until then no stereo path exists.
  if (toBank.device === 'esx') {
    const stereoCount = hypothetical.reduce((n, s) => n + (s && s.stereo ? 1 : 0), 0);
    if (stereoCount > ESX_STEREO_SLOTS) {
      return { ok: false, reason: 'insufficient-stereo-slots',
        error: `Too many stereo samples for ESX (${stereoCount} > ${ESX_STEREO_SLOTS})` };
    }
  }

  // ── Preflight: ESX sample-memory budget ──
  if (toBank.device === 'esx') {
    const used = esxSampleMemory(hypothetical);
    if (used > ESX_MAX_SAMPLE_BYTES) {
      return { ok: false, reason: 'insufficient-memory',
        error: `ESX sample memory exceeded (${used} > ${ESX_MAX_SAMPLE_BYTES} bytes)` };
    }
  }

  // ── Commit (every check passed) ──
  alloc.forEach((slot, i) => { toBank.samples[slot] = prepared[i]; });
  toBank.dirty = true;

  const fromRate = deviceRate(fromBank.device);
  const toRate = deviceRate(toBank.device);
  const kHz = r => (r / 1000).toFixed(1).replace(/\.0$/, ''); // 44100->"44.1", 48000->"48"
  const message = converted
    ? `${prepared.length} sample(s) copied, ${kHz(fromRate)}→${kHz(toRate)}kHz converted`
    : `${prepared.length} sample(s) copied`;

  return {
    ok: true,
    reason: 'ok',
    copied: prepared.length,
    converted,
    fromRate,
    toRate,
    assignments: alloc.map((to, i) => ({ from: sources[i].slot, to })),
    message,
  };
}

// ── Exports ────────────────────────────────────────────────

module.exports = {
  // Constants
  ESX_RATE,
  E2S_RATE,
  ESX_MONO_SLOTS,
  ESX_STEREO_SLOTS,
  E2S_MAX_SLOTS,
  E2S_MAX_SAMPLE_INDEX,
  E2S_STOCK_BASE,
  E2S_HACKTRIBE_BASE,
  e2sUserBase,
  detectHacktribe,
  allocateSlots,
  ESX_MAX_SAMPLE_BYTES,
  ESX_BLOCK_OVERHEAD,

  // Device helpers
  maxSlots,
  deviceRate,
  detectDevice,

  // Bank construction
  createBankFromBuffer,
  createEsxBank,
  createE2sBank,

  // UI projection
  sampleToUI,
  bankToUI,

  // Serialization
  serializeBank,

  // Copy & conversion
  copySamples,
  convertSample,
};
