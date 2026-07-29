/**
 * Unit tests for src/bank.js — the device-neutral dual-bank sample manager core.
 *
 * Inputs are built with the real device tooling:
 *   - ESX banks via esx.buildEsxFile() / esx.createEmptyEsx()
 *   - E2S banks via tests/fixtures/generators/minimal-e2s.js
 *
 * Run: npx vitest run tests/parsers/bank.test.js
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect

const bank = require('../../src/bank');
const esx = require('../../src/esx-format');
const {
  generateEmptyE2S,
  generateE2SWithSample,
} = require('../fixtures/generators/minimal-e2s');

// ── Helpers ────────────────────────────────────────────────

/** Build a big-endian 16-bit PCM buffer of `frames` samples (a simple ramp). */
function makeBEpcm(frames) {
  const buf = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    // Keep values well inside int16 range; deterministic content.
    buf.writeInt16BE(((i * 37) % 20000) - 10000, i * 2);
  }
  return buf;
}

/**
 * Build a real .esx file buffer containing `defs` mono samples.
 * defs: [{ name, frames, loopStart? }]
 */
function makeEsxBuffer(defs) {
  const list = defs.map(d => {
    const pcmData = makeBEpcm(d.frames);
    return {
      name: d.name,
      pcmData,
      sampleRate: bank.ESX_RATE,
      numFrames: d.frames,
      loopStart: d.loopStart != null ? d.loopStart : null,
    };
  });
  return esx.buildEsxFile(list);
}

/** Expected resampled frame count, matching resampleLinear's newLen formula. */
function expectedResampledFrames(frames, fromRate, toRate) {
  return Math.floor(frames / (fromRate / toRate));
}

// ── Device helpers / constants ─────────────────────────────

describe('device helpers', () => {
  it('exposes the frozen rate + slot constants', () => {
    expect(bank.ESX_RATE).toBe(44100);
    expect(bank.E2S_RATE).toBe(48000);
    expect(bank.ESX_MONO_SLOTS).toBe(256);
    expect(bank.ESX_STEREO_SLOTS).toBe(128);
    expect(bank.E2S_MAX_SLOTS).toBe(1020);          // file offset-table entries (data starts @4096)
    expect(bank.E2S_MAX_SAMPLE_INDEX).toBe(998);    // sample #999, last addressable
    expect(bank.E2S_STOCK_BASE).toBe(421);          // stock user area starts at #422
    expect(bank.E2S_HACKTRIBE_BASE).toBe(500);      // Hacktribe user area starts at #501
    // Budget is the hardware sample-memory ceiling declared by the free-space block
    // that every real .esx ends with. It used to be clamped to (ESX_FILE_SIZE -
    // SAMPLE_DATA) = 24,117,248 to dodge silent truncation into a fixed-size buffer,
    // but .esx files are variable-sized (0x250010 + currentOffset) and the writers now
    // throw instead of truncating — so the real ~25 MB ceiling applies.
    expect(bank.ESX_MAX_SAMPLE_BYTES).toBe(25165822);
    expect(bank.ESX_BLOCK_OVERHEAD).toBe(16);
  });

  it('maxSlots / deviceRate resolve per device', () => {
    expect(bank.maxSlots('esx')).toBe(256);
    expect(bank.maxSlots('e2s')).toBe(999);         // sample numbers 1–999, not the 1020-entry table
    expect(bank.deviceRate('esx')).toBe(44100);
    expect(bank.deviceRate('e2s')).toBe(48000);
  });
});

// ── Detection + construction ───────────────────────────────

describe('detectDevice / createBankFromBuffer', () => {
  it('detects and builds an ESX bank from a real .esx buffer', () => {
    const buf = makeEsxBuffer([{ name: 'KIK', frames: 500 }]);
    expect(bank.detectDevice(buf, 'KORG.esx')).toBe('esx');

    const b = bank.createBankFromBuffer(buf, '/tmp/a.esx', 'a.esx');
    expect(b.device).toBe('esx');
    expect(b.samples.length).toBe(256);
    expect(b.originalBuffer).toBe(buf);        // preserved reference for rebuild
    expect(b.dirty).toBe(false);
    expect(b.samples[0]).toBeTruthy();
    expect(b.samples[0].name).toBe('KIK');
    expect(b.samples[0].sampleRate).toBe(44100);
    expect(b.samples[0].stereo).toBe(false);
    expect(b.samples[0].numFrames).toBe(500);
    // E2S-only fields stay undefined on ESX samples.
    expect(b.samples[0].category).toBeUndefined();
    expect(b.samples[0].tune).toBeUndefined();
    expect(b.samples[0].boost).toBeUndefined();
  });

  it('detects and builds an E2S bank from a real e2sSample.all buffer', () => {
    const buf = generateE2SWithSample(0, 'SNARE', 12);
    expect(bank.detectDevice(buf, 'e2sSample.all')).toBe('e2s');

    const b = bank.createBankFromBuffer(buf, '/tmp/e2sSample.all', 'e2sSample.all');
    expect(b.device).toBe('e2s');
    expect(b.samples.length).toBe(1020);
    expect(b.originalBuffer).toBeNull();
    expect(b.samples[0]).toBeTruthy();
    expect(b.samples[0].name).toBe('SNARE');
    expect(b.samples[0].sampleRate).toBe(48000);
    // E2S-only metadata fields are populated.
    expect(b.samples[0].category).toBeDefined();
    expect(b.samples[0].tune).toBeDefined();
    expect(b.samples[0].boost).toBeDefined();
    expect(b.samples[0]._e2s).toBeDefined();
  });

  it('createEsxBank / createE2sBank set the right endianness anchors', () => {
    const esxBuf = makeEsxBuffer([{ name: 'A', frames: 100 }]);
    const esxBank = bank.createEsxBank(esxBuf);
    expect(esxBank.device).toBe('esx');
    expect(esxBank.originalBuffer).toBe(esxBuf);

    const e2sBuf = generateEmptyE2S();
    const e2sBank = bank.createE2sBank(e2sBuf);
    expect(e2sBank.device).toBe('e2s');
    expect(e2sBank.originalBuffer).toBeNull();
    expect(e2sBank.samples.every(s => s === null)).toBe(true);
  });

  it('throws on an unsupported buffer', () => {
    const junk = Buffer.from('this is definitely not a korg bank file at all yo');
    expect(() => bank.createBankFromBuffer(junk, null, 'junk.bin')).toThrow();
    expect(bank.detectDevice(junk, 'junk.bin')).toBeNull();
  });
});

// ── UI projection ──────────────────────────────────────────

describe('sampleToUI / bankToUI', () => {
  it('adds category/tune/boost only for e2s', () => {
    const esxBank = bank.createEsxBank(makeEsxBuffer([{ name: 'A', frames: 50 }]));
    const esxRow = bank.sampleToUI(esxBank.samples[0], 0, 'esx');
    expect(esxRow.category).toBeUndefined();
    expect('category' in esxRow).toBe(false);

    const e2sBank = bank.createE2sBank(generateE2SWithSample(0, 'B', 10));
    const e2sRow = bank.sampleToUI(e2sBank.samples[0], 0, 'e2s');
    expect('category' in e2sRow).toBe(true);
    expect('tune' in e2sRow).toBe(true);
    expect('boost' in e2sRow).toBe(true);

    expect(bank.sampleToUI(null, 5, 'esx')).toBeNull();
  });

  it('bankToUI summarizes a bank', () => {
    const esxBank = bank.createEsxBank(makeEsxBuffer([
      { name: 'A', frames: 50 }, { name: 'B', frames: 60 },
    ]));
    const ui = bank.bankToUI(esxBank);
    expect(ui.device).toBe('esx');
    expect(ui.maxSlots).toBe(256);
    expect(ui.count).toBe(2);
    expect(ui.samples.length).toBe(256);
    expect(bank.bankToUI(null)).toBeNull();
  });
});

// ── copySamples: four directions ───────────────────────────

describe('copySamples — all four directions', () => {
  it('ESX -> ESX keeps 44100 Hz, no conversion', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'KIK', frames: 400 }]));
    const to = bank.createEsxBank(esx.createEmptyEsx());

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(res.reason).toBe('ok');
    expect(res.copied).toBe(1);
    expect(res.converted).toBe(false);
    expect(res.fromRate).toBe(44100);
    expect(res.toRate).toBe(44100);
    expect(res.assignments).toEqual([{ from: 0, to: 0 }]);

    expect(to.dirty).toBe(true);
    expect(to.samples[0]).toBeTruthy();
    expect(to.samples[0].sampleRate).toBe(44100);
    expect(to.samples[0].name).toBe('KIK');
    expect(to.samples[0].numFrames).toBe(400);
    // Deep-copied PCM — not the same Buffer instance as the source.
    expect(to.samples[0].pcmData).not.toBe(from.samples[0].pcmData);
    expect(to.samples[0].pcmData.equals(from.samples[0].pcmData)).toBe(true);
  });

  it('E2S -> E2S keeps 48000 Hz, no conversion', () => {
    const from = bank.createE2sBank(generateE2SWithSample(0, 'CLAP', 15));
    const to = bank.createE2sBank(generateEmptyE2S());

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(false);
    expect(res.fromRate).toBe(48000);
    expect(res.toRate).toBe(48000);

    expect(to.dirty).toBe(true);
    // Empty target bank defaults to the Hacktribe base: first copy lands at
    // index 500 (sample #501), never at 0 (ignored by Hacktribe firmware).
    const dst = to.samples[500];
    expect(dst).toBeTruthy();
    expect(dst.sampleRate).toBe(48000);
    expect(dst.name).toBe('CLAP');
    // E2S->E2S is lossless: metadata bag carried through.
    expect(dst._e2s).toBeDefined();
    expect(dst.category).toBe(from.samples[0].category);
  });

  it('ESX -> E2S resamples to 48000 Hz, category "User", name preserved', () => {
    const origFrames = 400;
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'BASS', frames: origFrames }]));
    const to = bank.createE2sBank(generateEmptyE2S());

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(true);
    expect(res.fromRate).toBe(44100);
    expect(res.toRate).toBe(48000);

    const dst = to.samples[500];                 // empty bank → Hacktribe base
    expect(dst).toBeTruthy();
    expect(dst.sampleRate).toBe(48000);          // native E2S rate
    expect(dst.name).toBe('BASS');               // name preserved

    // Resampled length: 44.1k -> 48k upsamples (more frames).
    const expFrames = expectedResampledFrames(origFrames, 44100, 48000);
    expect(dst.numFrames).toBe(expFrames);
    expect(dst.numFrames).toBeGreaterThan(origFrames);
    expect(dst.pcmData.length).toBe(expFrames * 2);

    // Cross-device import lands in category 0 = "User".
    expect(dst.category).toBe(0);
    expect(dst.tune).toBe(0);
    expect(dst._e2s).toBeDefined();
    expect(to.dirty).toBe(true);
  });

  it('ESX one-shot (loopStart == endFrame) is NOT flagged as looping on E2S import', () => {
    // Regression: hardware/buildEsxFile stamp loopStart = endFrame on one-shots.
    // createEsxBank must read that as "no loop", else ESX->E2S wrongly sets loopType=1.
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'ONESHOT', frames: 300 }]));
    expect(from.samples[0].loopStart).toBeNull();   // one-shot, not a loop

    const to = bank.createE2sBank(generateEmptyE2S());
    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(to.samples[500]._e2s.loopType).toBe(0);   // not looping (empty bank → base 500)
    expect(to.samples[500].loopStart).toBeNull();
  });

  it('E2S -> ESX resamples to 44100 Hz', () => {
    const from = bank.createE2sBank(generateE2SWithSample(0, 'HAT', 20));
    const origFrames = from.samples[0].numFrames;
    const to = bank.createEsxBank(esx.createEmptyEsx());

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(true);
    expect(res.fromRate).toBe(48000);
    expect(res.toRate).toBe(44100);

    const dst = to.samples[0];
    expect(dst.sampleRate).toBe(44100);          // native ESX rate
    expect(dst.name).toBe('HAT');
    // 48k -> 44.1k downsamples (fewer frames).
    const expFrames = expectedResampledFrames(origFrames, 48000, 44100);
    expect(dst.numFrames).toBe(expFrames);
    expect(dst.numFrames).toBeLessThan(origFrames);
    // ESX target => E2S-only fields cleared.
    expect(dst.category).toBeUndefined();
    expect(dst.tune).toBeUndefined();
    expect(dst.boost).toBeUndefined();
    expect(dst._e2s).toBeUndefined();
  });
});

// ── Loop points ────────────────────────────────────────────

describe('copySamples — loop points carried', () => {
  it('preserves loop points on same-device copy', () => {
    const from = bank.createEsxBank(makeEsxBuffer([
      { name: 'LOOP', frames: 500, loopStart: 100 },
    ]));
    expect(from.samples[0].loopStart).toBe(100);
    expect(from.samples[0].loopEnd).toBe(499);   // endFrame = numFrames - 1

    const to = bank.createEsxBank(esx.createEmptyEsx());
    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(to.samples[0].loopStart).toBe(100);
    expect(to.samples[0].loopEnd).toBe(499);
  });

  it('rescales loop points on cross-rate copy (ESX -> E2S)', () => {
    const from = bank.createEsxBank(makeEsxBuffer([
      { name: 'LOOP', frames: 500, loopStart: 100 },
    ]));
    const to = bank.createE2sBank(generateEmptyE2S());
    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);

    const dst = to.samples[500];                 // empty bank → Hacktribe base
    // Loop frames rescaled by 48000/44100; still non-null (KB1-silence guard).
    expect(dst.loopStart).not.toBeNull();
    expect(dst.loopEnd).not.toBeNull();
    expect(dst.loopStart).toBe(Math.round(100 * (48000 / 44100)));
    // loopEnd clamped to last frame at most.
    expect(dst.loopEnd).toBeLessThanOrEqual(dst.numFrames - 1);
  });
});

// ── Stereo → ESX stereo-slot allocation rule ───────────────

describe('copySamples — ESX stereo-slot rule', () => {
  it('copies a stereo sample into ESX under the 128-slot limit', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'ST', frames: 200 }]));
    from.samples[0].stereo = true;               // mark source as stereo

    const to = bank.createEsxBank(esx.createEmptyEsx());
    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(true);
    expect(to.samples[0].stereo).toBe(true);     // stereo flag carried
  });

  it('aborts when ESX stereo slots would exceed 128 (no mutation)', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'ST', frames: 200 }]));
    from.samples[0].stereo = true;

    const to = bank.createEsxBank(esx.createEmptyEsx());
    // Fill slots 0..127 with stereo samples => 128 stereo already present.
    for (let i = 0; i < 128; i++) {
      to.samples[i] = {
        name: `S${i}`,
        pcmData: Buffer.alloc(4),
        sampleRate: 44100,
        stereo: true,
        numFrames: 1,
        loopStart: null,
        loopEnd: null,
        undoStack: [], redoStack: [], _original: null,
      };
    }

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('insufficient-stereo-slots');
    // NO partial mutation: next free slot untouched, dirty stays false.
    expect(to.samples[128]).toBeNull();
    expect(to.dirty).toBe(false);
  });
});

// ── Preflight aborts (all-or-nothing) ──────────────────────

describe('copySamples — preflight aborts leave the target untouched', () => {
  it('insufficient-slots: not enough free slots (no mutation)', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'A', frames: 100 }]));
    const to = bank.createEsxBank(esx.createEmptyEsx());
    // Occupy every one of the 256 slots so none remain free.
    for (let i = 0; i < 256; i++) {
      to.samples[i] = {
        name: `F${i}`,
        pcmData: Buffer.alloc(4),
        sampleRate: 44100,
        stereo: false,
        numFrames: 1,
        loopStart: null,
        loopEnd: null,
        undoStack: [], redoStack: [], _original: null,
      };
    }
    const before = to.samples.slice();

    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('insufficient-slots');
    expect(res.error).toMatch(/free slots/i);
    // Target array is byte-for-byte the same references — nothing replaced.
    expect(to.samples).toEqual(before);
    expect(to.dirty).toBe(false);
  });

  it('slot-out-of-range: explicit targetSlot past the end (no mutation)', () => {
    const from = bank.createEsxBank(makeEsxBuffer([
      { name: 'A', frames: 100 }, { name: 'B', frames: 100 },
    ]));
    const to = bank.createEsxBank(esx.createEmptyEsx());

    const res = bank.copySamples(from, [0, 1], to, 255); // needs 255 + 256 range
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('slot-out-of-range');
    expect(to.samples[255]).toBeNull();
    expect(to.dirty).toBe(false);
  });

  it('insufficient-memory: ESX sample budget exceeded (no mutation)', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'A', frames: 100 }]));
    // Swap in an oversized PCM buffer so the memory preflight must reject it.
    const bigFrames = bank.ESX_MAX_SAMPLE_BYTES / 2; // pcm bytes == MAX exactly
    from.samples[0].pcmData = Buffer.alloc(bigFrames * 2);
    from.samples[0].numFrames = bigFrames;

    const to = bank.createEsxBank(esx.createEmptyEsx());
    const res = bank.copySamples(from, [0], to, null);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('insufficient-memory');
    // NO partial mutation.
    expect(to.samples.every(s => s === null)).toBe(true);
    expect(to.dirty).toBe(false);
  });

  it('rejects empty / missing / empty-source inputs', () => {
    const from = bank.createEsxBank(makeEsxBuffer([{ name: 'A', frames: 100 }]));
    const to = bank.createEsxBank(esx.createEmptyEsx());

    expect(bank.copySamples(null, [0], to).reason).toBe('no-bank');
    expect(bank.copySamples(from, [0], null).reason).toBe('no-bank');
    expect(bank.copySamples(from, [], to).reason).toBe('nothing-to-copy');
    // Slot 5 is empty in the source bank.
    const r = bank.copySamples(from, [5], to);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty-source');
    expect(to.dirty).toBe(false);
  });
});

// ── convertSample direct ───────────────────────────────────

describe('convertSample', () => {
  it('deep-copies PCM and resets history on same-device copy', () => {
    const src = bank.createEsxBank(makeEsxBuffer([{ name: 'X', frames: 120 }])).samples[0];
    const out = bank.convertSample(src, 'esx', 'esx');
    expect(out.pcmData).not.toBe(src.pcmData);
    expect(out.pcmData.equals(src.pcmData)).toBe(true);
    expect(out.sampleRate).toBe(44100);
    expect(out.undoStack).toEqual([]);
    expect(out.redoStack).toEqual([]);
    expect(out._original).toBeNull();
  });

  it('converts ESX -> E2S rate and clears/sets device-only fields', () => {
    const src = bank.createEsxBank(makeEsxBuffer([{ name: 'X', frames: 300 }])).samples[0];
    const out = bank.convertSample(src, 'esx', 'e2s');
    expect(out.sampleRate).toBe(48000);
    expect(out.category).toBe(0);
    expect(out.numFrames).toBe(expectedResampledFrames(300, 44100, 48000));
  });
});

// ── E2S slot allocation policy ─────────────────────────────
// New samples are APPENDED after the highest used slot (device patterns
// reference sample numbers — existing slots are never renumbered) with the
// firmware user base as floor: Hacktribe #501 (index 500), stock #422 (421).
// Verified against a real Hacktribe dump: entries below index 500 are ignored
// by the firmware — a sample placed there never appears on the device.

describe('E2S slot allocation (append-after-highest, firmware base)', () => {
  function e2sBankWithSlots(slots) {
    const b = bank.createE2sBank(generateEmptyE2S());
    for (const s of slots) {
      b.samples[s] = bank.createE2sBank(generateE2SWithSample(0, 'S', 10)).samples[0];
    }
    b.hacktribe = bank.detectHacktribe(b.samples);
    return b;
  }

  it('empty bank: first allocation lands at the Hacktribe base (index 500)', () => {
    const b = e2sBankWithSlots([]);
    expect(b.hacktribe).toBe(true);
    expect(bank.allocateSlots(b, 3, null)).toEqual([500, 501, 502]);
  });

  it('appends after the highest used slot, skipping free holes below it', () => {
    const b = e2sBankWithSlots([518, 519, 700]); // holes at 520–699 stay free
    expect(bank.allocateSlots(b, 2, null)).toEqual([701, 702]);
  });

  it('stock bank (samples below 500) uses base 421', () => {
    const b = e2sBankWithSlots([18, 19]); // factory-area slots → stock firmware
    expect(b.hacktribe).toBe(false);
    expect(bank.allocateSlots(b, 1, null)).toEqual([421]);
  });

  it('hacktribe=false override allocates from the stock base on an empty bank', () => {
    const b = e2sBankWithSlots([]);
    b.hacktribe = false;
    expect(bank.allocateSlots(b, 1, null)).toEqual([421]);
  });

  it('falls back to holes at/above the base when the top range is full', () => {
    const b = e2sBankWithSlots([]);
    for (let i = 502; i <= bank.E2S_MAX_SAMPLE_INDEX; i++) {
      b.samples[i] = b.samples[i] || bank.createE2sBank(generateE2SWithSample(0, 'F', 10)).samples[0];
    }
    // 500 and 501 are the only free user slots left.
    expect(bank.allocateSlots(b, 2, null)).toEqual([500, 501]);
    expect(bank.allocateSlots(b, 3, null)).toBeNull(); // over capacity
  });

  it('never allocates past sample #999 (index 998)', () => {
    const b = e2sBankWithSlots([997]);
    expect(bank.allocateSlots(b, 1, null)).toEqual([998]);
    b.samples[998] = b.samples[997];
    // top full → falls back to the free user-area holes below
    expect(bank.allocateSlots(b, 1, null)).toEqual([500]);
  });
});
