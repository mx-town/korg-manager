/**
 * Regression tests for the 2026-07-28 ESX export audit.
 *
 * Every expectation here was derived from four real .esx files (factory dumps and a
 * hardware-saved user file, 4.5 MB - 26.7 MB) plus Korg's official MIDI implementation
 * chart (ESX1midiimp.txt, TABLE13/26/27). See ESX_FIX_PLAN.md.
 */
'use strict';

const esx = require('../../src/esx-format');
const { generateESXWithNSamples } = require('../fixtures/generators/minimal-esx');

const { ADDR, SIZE, NUM } = esx;
const GP = ADDR.GLOBAL_PARAMS;

describe('ESX file size — variable, not fixed', () => {
  it('sizes an empty file to exactly 0x250010 (the minimum)', () => {
    const buf = esx.buildEsxFile([]);
    expect(buf.length).toBe(SIZE.FILE_MIN);
    expect(buf.length).toBe(0x250010);
  });

  it('sizes any file to 0x250010 + currentOffset', () => {
    for (const n of [1, 3, 8]) {
      const buf = generateESXWithNSamples(n);
      const currentOffset = buf.readUInt32BE(ADDR.CURRENT_OFFSET);
      expect(buf.length).toBe(0x250010 + currentOffset);
    }
  });

  it('does not pad every file out to the legacy fixed size', () => {
    const buf = generateESXWithNSamples(2);
    expect(buf.length).toBeLessThan(esx.ESX_FILE_SIZE);
  });

  it('ends with the free-space terminator block real hardware writes', () => {
    const buf = generateESXWithNSamples(2);
    const currentOffset = buf.readUInt32BE(ADDR.CURRENT_OFFSET);
    const term = buf.subarray(buf.length - 16);

    expect(term.subarray(0, 4)).toEqual(Buffer.from([0x80, 0x00, 0x7f, 0xff]));
    expect(term.readUInt32BE(4)).toBe(currentOffset);
    expect(term.readUInt32BE(8)).toBe(esx.SAMPLE_MEM_END);
    expect(term.subarray(12)).toEqual(Buffer.from([0x00, 0xff, 0xff, 0xff]));
  });

  it('refuses to truncate instead of silently dropping sample data', () => {
    const oversized = [{
      name: 'BIG', sampleRate: 44100,
      numFrames: esx.SAMPLE_MEM_END, pcmData: Buffer.alloc(esx.SAMPLE_MEM_END + 64),
    }];
    expect(() => esx.buildEsxFile(oversized)).toThrow(/exceeds ESX sample memory/);
  });
});

describe('Global parameters — Korg TABLE13 layout', () => {
  it('writes exactly three MIDI channel bytes at +0x07..+0x09', () => {
    const buf = esx.createEmptyEsx();
    expect(buf[GP + 0x07]).toBe(0x00); // Keyboard 1 -> Ch.1
    expect(buf[GP + 0x08]).toBe(0x01); // Keyboard 2 -> Ch.2
    expect(buf[GP + 0x09]).toBe(0x09); // Drum/Stretch/Slice/AudioIn -> Ch.10
  });

  it('does not let channel writes bleed into the note-number block', () => {
    // The old code wrote 16 channel bytes across +0x07..+0x16 and then overwrote
    // 13 of them with note numbers. +0x0A onwards must be TABLE27 note numbers.
    const buf = esx.createEmptyEsx();
    const notes = Array.from(buf.subarray(GP + 0x0A, GP + 0x17));
    expect(notes).toEqual([36, 38, 40, 41, 43, 42, 46, 49, 51, 9, 10, 11, 12]);
  });

  it('populates the pattern set table instead of leaving it zeroed', () => {
    const buf = esx.createEmptyEsx();
    const set = Array.from(buf.subarray(GP + 0x40, GP + 0xC0));
    expect(set).toHaveLength(128);
    expect(set[0]).toBe(0);
    expect(set[127]).toBe(127);
  });

  it('decodes the block, naming notes the way Korg prints them', () => {
    const g = esx.parseGlobalParams(esx.createEmptyEsx());

    expect(g.globalChannel).toBe(1); // = Keyboard Part 1
    expect(g.channels.keyboard1.channel).toBe(1);
    expect(g.channels.keyboard2.channel).toBe(2);
    expect(g.channels.drumStretchSliceAudioIn.channel).toBe(10);

    expect(g.midiClock).toBe(0);
    expect(g.filters).toMatchObject({ note: true, sysEx: true, controlChange: true, programChange: true });
    expect(g.pitchBendRange).toBe(2);

    // TABLE27: note 36 is C2, 9 is A-1, 12 is C0
    expect(g.drumNotes.Drum1).toMatchObject({ note: 36, name: 'C2' });
    expect(g.drumNotes.Stretch1).toMatchObject({ note: 9, name: 'A-1' });
    expect(g.drumNotes.AudioIn).toMatchObject({ note: 12, name: 'C0' });
  });

  it('reports nothing wrong with a freshly built file', () => {
    expect(esx.validateGlobalParams(esx.createEmptyEsx())).toEqual([]);
  });

  it('flags out-of-range MIDI values without rewriting them', () => {
    const buf = esx.createEmptyEsx();
    buf[GP + 0x04] = 4;    // MIDI clock, valid range 0-2
    buf[GP + 0x09] = 0x40; // channel byte, valid range 0-15

    const problems = esx.validateGlobalParams(buf);
    expect(problems.map((p) => p.field)).toEqual(
      expect.arrayContaining(['midiClock', 'channels.drumStretchSliceAudioIn'])
    );
    // Reporting must never mutate the caller's buffer — MIDI routing is the user's call
    expect(buf[GP + 0x04]).toBe(4);
    expect(buf[GP + 0x09]).toBe(0x40);
  });

  it('flags two parts sharing one note, since they also share a channel', () => {
    const buf = esx.createEmptyEsx();
    buf[GP + 0x0B] = 36; // Drum2 onto Drum1's note

    const problems = esx.validateGlobalParams(buf);
    expect(problems.some((p) => /shares note 36/.test(p.message))).toBe(true);
  });
});

describe('writeGlobalParams — writes only what the caller asked for', () => {
  it('patches a channel without touching any other byte in the file', () => {
    const before = esx.createEmptyEsx();
    const after = esx.writeGlobalParams(before, { channels: { keyboard2: 6 } });

    expect(after[GP + 0x08]).toBe(6);
    expect(esx.parseGlobalParams(after).channels.keyboard2.channel).toBe(7);

    // Exactly one byte may differ
    let diffs = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diffs++;
    expect(diffs).toBe(1);
  });

  it('never mutates the caller\'s buffer', () => {
    const before = esx.createEmptyEsx();
    const snapshot = Buffer.from(before);
    esx.writeGlobalParams(before, { channels: { keyboard1: 11 }, drumNotes: { Drum1: 60 } });
    expect(Buffer.compare(before, snapshot)).toBe(0);
  });

  it('patches drum notes independently of channels', () => {
    const buf = esx.writeGlobalParams(esx.createEmptyEsx(), { drumNotes: { Drum1: 60, AudioIn: 100 } });
    const g = esx.parseGlobalParams(buf);
    expect(g.drumNotes.Drum1).toMatchObject({ note: 60, name: 'C4' });
    expect(g.drumNotes.AudioIn.note).toBe(100);
    expect(g.drumNotes.Drum2.note).toBe(38); // untouched
    expect(g.channels.keyboard1.channel).toBe(1); // untouched
  });

  it('rejects out-of-range values instead of silently clamping', () => {
    const buf = esx.createEmptyEsx();
    expect(() => esx.writeGlobalParams(buf, { channels: { keyboard1: 16 } })).toThrow(/must be 0-15/);
    expect(() => esx.writeGlobalParams(buf, { drumNotes: { Drum1: 128 } })).toThrow(/must be 0-127/);
    expect(() => esx.writeGlobalParams(buf, { channels: { nope: 1 } })).toThrow(/Unknown MIDI channel part/);
  });

  it('survives a save — patched channels come back out of rebuildEsxFile', () => {
    const src = generateESXWithNSamples(2);
    const patched = esx.writeGlobalParams(src, {
      channels: { keyboard1: 5, keyboard2: 6, drumStretchSliceAudioIn: 10 },
    });
    const out = esx.rebuildEsxFile(patched, esx.parseEsxFile(patched).monoSamples);
    const g = esx.parseGlobalParams(out);
    expect(g.channels.keyboard1.channel).toBe(6);
    expect(g.channels.keyboard2.channel).toBe(7);
    expect(g.channels.drumStretchSliceAudioIn.channel).toBe(11);
  });
});

describe('findEmxChannelCollisions — the ESX-master / EMX-slave trap', () => {
  it('flags factory ESX channels, which all land on EMX parts', () => {
    // Factory: Keyboard1 Ch.1, Keyboard2 Ch.2, drums Ch.10 —
    // EMX defaults are Synth1-5 on Ch.1-5 and drums on Ch.10, so all three collide.
    const hits = esx.findEmxChannelCollisions(esx.createEmptyEsx());
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.channel).sort((a, b) => a - b)).toEqual([1, 2, 10]);
    expect(hits.find((h) => h.channel === 10).collidesWith).toMatch(/Drum/);
  });

  it('still flags the parts left behind when only Keyboard 1 is moved', () => {
    // This is the real-world case: the ESX global menu edits Keyboard 1 only, so
    // Keyboard 2 and the drum section stay on EMX channels.
    const buf = esx.writeGlobalParams(esx.createEmptyEsx(), { channels: { keyboard1: 5 } });
    const hits = esx.findEmxChannelCollisions(buf);
    expect(hits.map((h) => h.part).sort()).toEqual(['drumStretchSliceAudioIn', 'keyboard2']);
  });

  it('reports nothing once all three sit on free channels', () => {
    // EMX occupies Ch.1-5 and Ch.10; 6-9 and 11-16 are free.
    const buf = esx.writeGlobalParams(esx.createEmptyEsx(), {
      channels: { keyboard1: 5, keyboard2: 6, drumStretchSliceAudioIn: 10 },
    });
    expect(esx.findEmxChannelCollisions(buf)).toEqual([]);
  });
});

describe('rebuildEsxFile — preserves data it used to destroy', () => {
  const buildSource = (n) => {
    const buf = generateESXWithNSamples(n);
    // Give each sample slot recognisable slice data
    for (let i = 0; i < n; i++) {
      buf.fill(0xA0 + i, ADDR.SLICE_DATA + i * SIZE.SLICE_BLOCK,
               ADDR.SLICE_DATA + (i + 1) * SIZE.SLICE_BLOCK);
    }
    return buf;
  };

  it('keeps slice data, and moves it with its sample when slots compact', () => {
    const src = buildSource(3);
    const parsed = esx.parseEsxFile(src);

    // Drop the middle sample so the third one compacts from slot 2 to slot 1
    const kept = [parsed.monoSamples[0], parsed.monoSamples[2]];
    const out = esx.rebuildEsxFile(src, kept);

    const sliceAt = (buf, slot) =>
      buf.subarray(ADDR.SLICE_DATA + slot * SIZE.SLICE_BLOCK,
                   ADDR.SLICE_DATA + (slot + 1) * SIZE.SLICE_BLOCK);

    expect(sliceAt(out, 0)[0]).toBe(0xA0); // sample 0 stayed put
    expect(sliceAt(out, 1)[0]).toBe(0xA2); // sample 2 brought its slice data along
    expect(sliceAt(out, 2).every((b) => b === 0)).toBe(true); // vacated slot cleared
  });

  it('leaves the region past the slice table untouched', () => {
    const src = generateESXWithNSamples(2);
    const tableEnd = ADDR.SLICE_DATA + NUM.MONO_SAMPLES * SIZE.SLICE_BLOCK;
    src.fill(0x5A, tableEnd, ADDR.SAMPLE_DATA);

    const out = esx.rebuildEsxFile(src, esx.parseEsxFile(src).monoSamples);
    expect(out.subarray(tableEnd, ADDR.SAMPLE_DATA).every((b) => b === 0x5A)).toBe(true);
  });

  it('preserves globals, patterns and songs byte for byte', () => {
    const src = generateESXWithNSamples(3);
    const out = esx.rebuildEsxFile(src, esx.parseEsxFile(src).monoSamples);

    expect(Buffer.compare(src.subarray(0, 0x20), out.subarray(0, 0x20))).toBe(0);
    expect(Buffer.compare(src.subarray(GP, GP + 192), out.subarray(GP, GP + 192))).toBe(0);
    expect(Buffer.compare(src.subarray(ADDR.PATTERN_DATA, ADDR.SONG_DATA),
                          out.subarray(ADDR.PATTERN_DATA, ADDR.SONG_DATA))).toBe(0);
    expect(Buffer.compare(src.subarray(ADDR.SONG_DATA, ADDR.BPS_HEADER),
                          out.subarray(ADDR.SONG_DATA, ADDR.BPS_HEADER))).toBe(0);
  });

  it('carries stereo samples across a save instead of dropping them', () => {
    const src = generateESXWithNSamples(2);
    const parsed = esx.parseEsxFile(src);
    const currentOffset = parsed.currentOffset;

    // Append two stereo channel blocks and point stereo slot 0 at them
    const chLen = 16 + 64;
    const pcm = Buffer.alloc(chLen * 2);
    esx.buildFreeSpaceBlock(0).copy(pcm, 0); // placeholder signature bytes
    pcm.fill(0x11, 16, chLen);
    pcm.fill(0x22, chLen + 16);

    const withStereo = Buffer.concat([
      src.subarray(0, ADDR.SAMPLE_DATA + currentOffset), pcm, Buffer.alloc(16),
    ]);
    const hdr = ADDR.SAMPLE_HDR_STEREO;
    withStereo.write('STEREO1 ', hdr, 'ascii');
    withStereo.writeUInt32BE(currentOffset, hdr + 8);
    withStereo.writeUInt32BE(currentOffset + chLen, hdr + 12);
    withStereo.writeUInt32BE(currentOffset + chLen, hdr + 16);
    withStereo.writeUInt32BE(currentOffset + chLen * 2, hdr + 20);
    withStereo.writeUInt32BE(0, hdr + 24);
    withStereo.writeUInt32BE(63, hdr + 28);
    withStereo.writeUInt32BE(44100, hdr + 32);
    withStereo.writeUInt32BE(1, ADDR.NUM_STEREO_SAMPLES);
    withStereo.writeUInt32BE(currentOffset + chLen * 2, ADDR.CURRENT_OFFSET);

    const out = esx.rebuildEsxFile(withStereo, esx.parseEsxFile(withStereo).monoSamples);

    expect(out.readUInt32BE(ADDR.NUM_STEREO_SAMPLES)).toBe(1);
    const outParsed = esx.parseEsxFile(out);
    expect(outParsed.stereoSamples[0]).toMatchObject({ name: 'STEREO1', sampleRate: 44100 });

    // The audio payload of both channels survived intact
    const s1 = out.readUInt32BE(hdr + 8);
    const s2 = out.readUInt32BE(hdr + 16);
    expect(out[ADDR.SAMPLE_DATA + s1 + 16]).toBe(0x11);
    expect(out[ADDR.SAMPLE_DATA + s2 + 16]).toBe(0x22);
    expect(out.length).toBe(0x250010 + out.readUInt32BE(ADDR.CURRENT_OFFSET));
  });
});
