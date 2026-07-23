/**
 * file-tabs.js — store<->bank adapters for the unified sample manager.
 *
 * The store shape is main.js's view-native currentSamples entry:
 * BE PCM + _undo/_redo/_original. E2S metadata (incl. the ORIGINAL SLOT —
 * E2S patterns reference samples by slot) rides in the _e2s bag.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect

const bank = require('../../src/bank');
const ft = require('../../src/file-tabs');
const e2s = require('../../src/e2s-format');
const {
  generateE2SWithSample,
  generateE2SWithNSamples,
} = require('../fixtures/generators/minimal-e2s');

describe('swap16Copy', () => {
  it('swaps endianness losslessly on a copy', () => {
    const le = Buffer.alloc(4);
    le.writeInt16LE(1234, 0);
    le.writeInt16LE(-4321, 2);
    const be = ft.swap16Copy(le);
    expect(be.readInt16BE(0)).toBe(1234);
    expect(be.readInt16BE(2)).toBe(-4321);
    // original untouched
    expect(le.readInt16LE(0)).toBe(1234);
    // double swap round-trips
    expect(ft.swap16Copy(be).equals(le)).toBe(true);
  });
});

describe('bankToStore (E2S load path)', () => {
  it('produces view-native BE samples with the _e2s bag and preserved slot', () => {
    const buf = generateE2SWithSample(7, 'SNARE', 10);
    const b = bank.createE2sBank(buf, '/x/e2sSample.all', 'e2sSample.all');
    const store = ft.bankToStore(b);

    expect(store.length).toBe(1);
    const s = store[0];
    expect(s.name).toBe('SNARE');
    expect(s.sampleRate).toBe(48000);
    expect(Array.isArray(s._undo)).toBe(true);
    expect(s._original).toBe(null);
    expect(s._e2s.slot).toBe(7);
    // BE store PCM must equal the LE bank PCM byte-swapped
    const bs = b.samples[7];
    expect(s.pcmData.readInt16BE(0)).toBe(bs.pcmData.readInt16LE(0));
    expect(s.pcmData.readInt16BE(10)).toBe(bs.pcmData.readInt16LE(10));
  });

  it('keeps dense order by slot for multiple samples', () => {
    const buf = generateE2SWithNSamples(3);
    const store = ft.bankToStore(bank.createE2sBank(buf, null, null));
    expect(store.map(s => s.name)).toEqual(['SMP000', 'SMP001', 'SMP002']);
    expect(store.map(s => s._e2s.slot)).toEqual([0, 1, 2]);
  });
});

describe('storeToE2sBank (E2S save path)', () => {
  it('round-trips an E2S file losslessly (PCM, slot, name)', () => {
    const buf = generateE2SWithSample(42, 'HAT', 10);
    const store = ft.bankToStore(bank.createE2sBank(buf, null, null));
    const outBank = ft.storeToBank(store, 'e2s', { fileName: 'e2sSample.all' });
    const outBuf = bank.serializeBank(outBank);

    const reparsed = bank.createE2sBank(outBuf, null, null);
    const orig = bank.createE2sBank(buf, null, null);
    expect(reparsed.samples[42]).toBeTruthy(); // slot preserved, NOT compacted
    expect(reparsed.samples[42].name).toBe('HAT');
    expect(reparsed.samples[42].pcmData.equals(orig.samples[42].pcmData)).toBe(true);
    expect(reparsed.samples[42].category).toBe(orig.samples[42].category);
  });

  it('assigns a free slot to samples without one (imports/duplicates)', () => {
    const store = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(0, 'A'), null, null));
    const dup = { ...store[0], pcmData: Buffer.from(store[0].pcmData), _e2s: { ...store[0]._e2s, slot: null } };
    const outBank = ft.storeToBank([...store, dup], 'e2s', {});
    expect(outBank.samples[0]).toBeTruthy();
    expect(outBank.samples[1]).toBeTruthy(); // next free slot
    expect(dup._e2s.slot).toBe(1);           // assigned slot written back to the store
  });

  it('resolves slot collisions instead of overwriting', () => {
    const store = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(3, 'A'), null, null));
    const clash = { ...store[0], name: 'B', pcmData: Buffer.from(store[0].pcmData), _e2s: { ...store[0]._e2s } };
    const outBank = ft.storeToBank([...store, clash], 'e2s', {});
    const names = outBank.samples.filter(Boolean).map(s => s.name).sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('clamps/drops loop points when the sample was shortened', () => {
    const store = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(0, 'L', 20), null, null));
    const s = store[0];
    s._e2s.loopStart = 100;
    s._e2s.loopEnd = 100000; // way past the end
    let outBank = ft.storeToBank([s], 'e2s', {});
    expect(outBank.samples[0].loopStart).toBe(100);
    expect(outBank.samples[0].loopEnd).toBe(outBank.samples[0].numFrames - 1);

    // Trim the sample below loopStart — loop must be dropped entirely
    s.pcmData = s.pcmData.slice(0, 100); // 50 frames
    s.numFrames = 50;
    outBank = ft.storeToBank([s], 'e2s', {});
    expect(outBank.samples[0].loopStart).toBe(null);
    expect(outBank.samples[0].loopEnd).toBe(null);
  });
});

describe('storeToEsxBank', () => {
  it('maps dense list positions to slots and keeps PCM by reference', () => {
    const pcm = Buffer.alloc(200);
    pcm.writeInt16BE(3000, 0);
    const store = [{
      name: 'KICK', pcmData: pcm, sampleRate: 44100, numFrames: 100,
      duration: 100 / 44100, originalPath: null, folder: null,
      _undo: [], _redo: [], _original: null,
    }];
    const b = ft.storeToBank(store, 'esx', {});
    expect(b.device).toBe('esx');
    expect(b.samples[0].name).toBe('KICK');
    expect(b.samples[0].pcmData).toBe(pcm); // no needless copy on the ESX path
    expect(b.samples.filter(Boolean).length).toBe(1);
  });
});

describe('review fixes', () => {
  it('convertSample resamples from the ACTUAL rate, not the assumed device rate', () => {
    // 22050 Hz is a legitimate ESX rate (WAV import keeps it) — converting to
    // E2S must resample 22050->48000, not 44100->48000.
    const frames = 2205; // 100ms @ 22050
    const pcm = Buffer.alloc(frames * 2);
    for (let i = 0; i < frames; i++) pcm.writeInt16BE(((i % 50) - 25) * 200, i * 2);
    const out = bank.convertSample(
      { name: 'LO', pcmData: pcm, sampleRate: 22050, stereo: false, numFrames: frames, duration: frames / 22050, loopStart: 1000, loopEnd: 2000 },
      'esx', 'e2s');
    expect(out.sampleRate).toBe(48000);
    // duration must be preserved (~100ms => ~4800 frames)
    expect(out.numFrames).toBeGreaterThan(4700);
    expect(out.numFrames).toBeLessThan(4900);
    // loop points rescaled by the ACTUAL ratio (~2.177x)
    expect(out.loopStart).toBeGreaterThan(2100);
    expect(out.loopStart).toBeLessThan(2260);
  });

  it('start/endPoint (hardware-trimmed playback region) survive a save round-trip', () => {
    const numFrames = 480;
    const pcmLE = Buffer.alloc(numFrames * 2);
    for (let i = 0; i < numFrames; i++) pcmLE.writeInt16LE((i % 100) * 30, i * 2);
    const buf = e2s.buildE2sAllFile([{ slot: 3, name: 'TRIM', pcmData: pcmLE, sampleRate: 48000, startPoint: 64, endPoint: 400 }]);

    const store = ft.bankToStore(bank.createE2sBank(buf, null, null));
    expect(store[0]._e2s.startPoint).toBe(64);
    const outBuf = bank.serializeBank(ft.storeToBank(store, 'e2s', {}));

    const reparsed = e2s.parseE2sAllFile(outBuf);
    expect(reparsed.samples[3].esli.startPoint).toBe(64);
    expect(reparsed.samples[3].esli.endPoint).toBe(400);
  });

  it('a dropped loop also clears loopType in the saved ESLI', () => {
    const store = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(0, 'LP', 20), null, null));
    const s = store[0];
    s._e2s.loopType = 1;
    s._e2s.loopStart = 500;
    s.pcmData = s.pcmData.slice(0, 200); // 100 frames — loop no longer fits
    s.numFrames = 100;
    const outBuf = bank.serializeBank(ft.storeToBank([s], 'e2s', {}));
    const reparsed = e2s.parseE2sAllFile(outBuf);
    expect(reparsed.samples[0].esli.loopType).toBe(0);
    expect(reparsed.samples[0].esli.loopStart).toBe(0xFFFFFFFF);
  });
});

describe('cross-device transfer through bank.copySamples', () => {
  it('ESX store -> E2S store converts 44.1->48kHz and lands in a free slot', () => {
    // ESX side: one 44.1 BE sample at list position 0
    const frames = 441;
    const pcm = Buffer.alloc(frames * 2);
    for (let i = 0; i < frames; i++) pcm.writeInt16BE(((i % 100) - 50) * 100, i * 2);
    const esxStore = [{
      name: 'CLAP', pcmData: pcm, sampleRate: 44100, numFrames: frames,
      duration: frames / 44100, originalPath: null, folder: null,
      _undo: [], _redo: [], _original: null,
    }];
    // E2S side: existing sample at slot 0
    const e2sStore = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(0, 'OLD'), null, null));

    const fromBank = ft.storeToBank(esxStore, 'esx', {});
    const toBank = ft.storeToBank(e2sStore, 'e2s', {});
    const res = bank.copySamples(fromBank, [0], toBank);
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(true);

    const newStore = ft.bankToStore(toBank);
    expect(newStore.length).toBe(2);
    const copied = newStore.find(s => s.name === 'CLAP');
    expect(copied).toBeTruthy();
    expect(copied.sampleRate).toBe(48000);
    expect(copied._e2s.slot).toBe(1); // next free slot after OLD@0
    // store PCM is BE again (readable by all esx: handlers)
    expect(copied.numFrames).toBe(copied.pcmData.length / 2);
  });

  it('E2S store -> ESX store converts 48->44.1kHz into the dense list', () => {
    const e2sStore = ft.bankToStore(bank.createE2sBank(generateE2SWithSample(5, 'PERC', 10), null, null));
    const fromBank = ft.storeToBank(e2sStore, 'e2s', {});
    const toBank = ft.storeToBank([], 'esx', {});
    const res = bank.copySamples(fromBank, [5], toBank);
    expect(res.ok).toBe(true);

    const newStore = ft.bankToStore(toBank);
    expect(newStore.length).toBe(1);
    expect(newStore[0].name).toBe('PERC');
    expect(newStore[0].sampleRate).toBe(44100);
    expect(newStore[0]._e2s).toBeUndefined(); // ESX store entries carry no bag
  });
});
