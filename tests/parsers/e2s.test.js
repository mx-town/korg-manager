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
  deriveEsliNumbering,
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

  it('flags one-shot vs loop explicitly at 0x34 (1 = one-shot, 0 = loop)', () => {
    const oneShotBuf = buildEsliData({ endPoint: 5000, loopStart: null });
    expect(oneShotBuf.readUInt32LE(0x34)).toBe(1);
    const oneShot = parseEsliData(oneShotBuf);
    expect(oneShot.loopType).toBe(0);
    expect(oneShot.loopStart).toBe(oneShot.endPoint);

    const loopedBuf = buildEsliData({ endPoint: 5000, loopStart: 2000 });
    expect(loopedBuf.readUInt32LE(0x34)).toBe(0);
    const looped = parseEsliData(loopedBuf);
    expect(looped.loopType).toBe(1);
    expect(looped.loopStart).toBe(2000);
  });

  it('preserve-and-patch: editing the name leaves every other ESLI byte intact', () => {
    // A sample "loaded from a real file" carries its raw 1172-byte block — and
    // always a slot number, which the slot-derived index fields depend on.
    const original = buildEsliData({
      slotNumber: 700, name: 'ORIG', category: 9, endPoint: 4000, sampleRate: 44100,
    });
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

// Regression for the "LOAD ALL SAMPLES → File Error" bug: a sample with no
// preserved _raw block (cross-device ESX→E2S import, fresh WAV import) used to
// be written with six hardware-invariant ESLI fields left at 0. Ground truth for
// each expectation is asserted against all 403 dump samples in
// tests/parsers/e2s-realdump.test.js.
describe('E2S - fresh sample ESLI matches hardware invariants', () => {
  it('derives playLogPeriod (u16 @0x22) from the sample rate', () => {
    // 48 kHz is the reference rate and yields exactly 0x3C00.
    expect(buildEsliData({ sampleRate: 48000 }).readUInt16LE(0x22)).toBe(15360);
    for (const sr of [22053, 32058, 16004, 44100]) {
      expect(buildEsliData({ sampleRate: sr }).readUInt16LE(0x22))
        .toBe(Math.round(63132 - 3072 * Math.log2(sr)));
    }
    // The low half of the 0x20 dword stays 0, as in every real sample.
    expect(buildEsliData({ sampleRate: 48000 }).readUInt16LE(0x20)).toBe(0);
  });

  it('keeps an explicitly supplied playLogPeriod (E2S→E2S round-trip)', () => {
    const buf = buildEsliData({ sampleRate: 48000, playLogPeriod: 20228 });
    expect(buf.readUInt16LE(0x22)).toBe(20228);
    expect(parseEsliData(buf).playLogPeriod).toBe(20228);
  });

  it('writes a non-zero play volume (u16 @0x24), full scale by default', () => {
    expect(buildEsliData({}).readUInt16LE(0x24)).toBe(0xFFFF);
    const buf = buildEsliData({ playVolume: 0xD998 });
    expect(buf.readUInt16LE(0x24)).toBe(0xD998);
    expect(parseEsliData(buf).playVolume).toBe(0xD998);
  });

  it('stamps the slot-derived index fields at 0x14 and 0x4e', () => {
    const buf = buildEsliData({ slotNumber: 921 });
    expect(buf.readUInt16LE(0x00)).toBe(921);
    expect(buf.readUInt16LE(0x14)).toBe(921 + 50);
    expect(buf.readUInt16LE(0x4e)).toBe(921 - 500);
  });

  it('never writes 0 as the user number for slots below the Hacktribe base', () => {
    // 0 is the one illegal value here: a bank carrying it is rejected with
    // File Error (hardware-confirmed 2026-08-11). The stock offset cannot
    // express slot 430, so the slot itself is written — the other encoding
    // real hardware is known to accept.
    const buf = buildEsliData({ slotNumber: 430 }); // stock user area
    expect(buf.readUInt16LE(0x14)).toBe(480);
    expect(buf.readUInt16LE(0x4e)).not.toBe(0);
    expect(buf.readUInt16LE(0x4e)).toBe(430);
  });

  it('repairs a preserved block whose 0x4e is already the illegal 0', () => {
    // The "repair a bank written by an older build" case: every preserved 0x4e
    // is 0, so deriveEsliNumbering observes nothing and the fallback applies.
    // Writing 0 straight back would silently preserve the damage.
    const raw = buildEsliData({ slotNumber: 430 });
    raw.writeUInt16LE(0, 0x4e);
    raw.writeUInt16LE(0, 0x14);
    const fixed = buildEsliData({ _raw: raw, slotNumber: 430 });
    expect(fixed.readUInt16LE(0x4e)).not.toBe(0);
    expect(fixed.readUInt16LE(0x14)).not.toBe(0);
  });

  it('keeps a preserved 0x14/0x4e pair when the sample stays in its slot', () => {
    // Stands in for a stock-layout file, where slot − 500 would be wrong.
    const raw = buildEsliData({ slotNumber: 450 });
    raw.writeUInt16LE(29, 0x4e);   // whatever the hardware really put there
    raw.writeUInt16LE(479, 0x14);
    const patched = buildEsliData({ _raw: raw, slotNumber: 450, name: 'EDIT' });
    expect(patched.readUInt16LE(0x14)).toBe(479);
    expect(patched.readUInt16LE(0x4e)).toBe(29);
  });

  it('re-derives 0x14/0x4e when the sample moves to another slot', () => {
    const raw = buildEsliData({ slotNumber: 600 });
    const moved = buildEsliData({ _raw: raw, slotNumber: 700 });
    expect(moved.readUInt16LE(0x00)).toBe(700);
    expect(moved.readUInt16LE(0x14)).toBe(750);
    expect(moved.readUInt16LE(0x4e)).toBe(200);
  });

  it('repairs a bank saved before these fields were known (0x14 == 0)', () => {
    // Exactly what the old writer produced: everything else preserved, but the
    // six invariant fields left at 0. Re-saving such a file must fix all six,
    // otherwise reloading the rejected bank and saving it again changes nothing.
    const broken = Buffer.alloc(ESLI_DATA_SIZE, 0);
    broken.writeUInt16LE(921, 0x00);
    broken.writeUInt32LE(48000, 0x48);
    const fixed = buildEsliData({ _raw: broken, slotNumber: 921, sampleRate: 48000 });
    expect(fixed.readUInt16LE(0x12)).toBe(17);      // 'User' — 0 is a firmware slot
    expect(fixed.readUInt16LE(0x14)).toBe(971);
    expect(fixed.readUInt16LE(0x4e)).toBe(421);
    expect(fixed.readUInt16LE(0x22)).toBe(15360);
    expect(fixed.readUInt16LE(0x24)).toBe(0xFFFF);
    expect(fixed.readUInt32LE(0x34)).toBe(1);
  });

  it('never writes category 0 or 1 — those are firmware oscillator slots', () => {
    expect(buildEsliData({}).readUInt16LE(0x12)).toBe(17);
    expect(buildEsliData({ category: 0 }).readUInt16LE(0x12)).toBe(17);
    expect(buildEsliData({ category: 1 }).readUInt16LE(0x12)).toBe(17);
    // Every category a user sample may legitimately carry passes through.
    for (let c = 2; c <= 17; c++) {
      expect(buildEsliData({ category: c }).readUInt16LE(0x12)).toBe(c);
    }
  });

  it('leaves every byte from 0x50 on untouched (slice table stays zero)', () => {
    const buf = buildEsliData({ slotNumber: 700, sampleRate: 48000, endPoint: 100 });
    for (let o = 0x50; o < ESLI_DATA_SIZE; o++) expect(buf[o], `0x${o.toString(16)}`).toBe(0);
  });
});

// Two real cards disagree on 0x4E: a stock-layout dump stores slot − 500, while
// a Hacktribe card the hardware loads without complaint stores the slot itself.
// Both are accepted, so a fresh sample must copy whichever convention the file
// it is being added to already uses instead of a hardcoded constant.
describe('E2S - index fields follow the conventions of the file being edited', () => {
  const rawAt = (slot, { imp, user }) => {
    const b = Buffer.alloc(ESLI_DATA_SIZE, 0);
    b.writeUInt16LE(slot, 0x00);
    b.writeUInt16LE(imp, 0x14);
    b.writeUInt16LE(user, 0x4e);
    return b;
  };

  it('defaults to the dump convention when nothing can be observed', () => {
    expect(deriveEsliNumbering([])).toEqual({ importNumOffset: 50, userNumOffset: -500 });
    expect(deriveEsliNumbering([{ slot: 600 }, null])).toEqual({
      importNumOffset: 50, userNumOffset: -500,
    });
  });

  it('reads the stock-dump offsets back off preserved blocks', () => {
    const samples = [518, 519, 520].map(slot => ({
      slot, _raw: rawAt(slot, { imp: slot + 50, user: slot - 500 }),
    }));
    expect(deriveEsliNumbering(samples)).toEqual({ importNumOffset: 50, userNumOffset: -500 });
  });

  it('reads the Hacktribe-card offset (0x4e == slot) off preserved blocks', () => {
    const samples = [518, 919, 920].map(slot => ({
      slot, _raw: rawAt(slot, { imp: slot + 50, user: slot }),
    }));
    expect(deriveEsliNumbering(samples)).toEqual({ importNumOffset: 50, userNumOffset: 0 });
  });

  it('ignores blocks whose index fields were never written', () => {
    const samples = [
      { slot: 921, _raw: rawAt(921, { imp: 0, user: 0 }) },   // old writer's output
      { slot: 518, _raw: rawAt(518, { imp: 568, user: 518 }) },
    ];
    expect(deriveEsliNumbering(samples)).toEqual({ importNumOffset: 50, userNumOffset: 0 });
  });

  it('falls back to the default when the file is not self-consistent', () => {
    const samples = [
      { slot: 518, _raw: rawAt(518, { imp: 568, user: 18 }) },
      { slot: 519, _raw: rawAt(519, { imp: 569, user: 519 }) },
    ];
    expect(deriveEsliNumbering(samples).userNumOffset).toBe(-500);
  });

  it('honours an explicit offset in buildEsliData', () => {
    const buf = buildEsliData({ slotNumber: 921, userNumOffset: 0, importNumOffset: 50 });
    expect(buf.readUInt16LE(0x14)).toBe(971);
    expect(buf.readUInt16LE(0x4e)).toBe(921);
  });

  it('falls back to the slot itself when an offset would go below 1', () => {
    // 0 is illegal at 0x4e, so an offset the slot cannot carry yields the other
    // hardware-accepted encoding rather than the rejected value.
    expect(buildEsliData({ slotNumber: 100, userNumOffset: -500 }).readUInt16LE(0x4e)).toBe(100);
  });

  it('gives an appended sample the same 0x4e convention as its neighbours', () => {
    const pcm = Buffer.alloc(64);
    const samples = new Array(MAX_SLOTS).fill(null);
    // Two preserved samples off a Hacktribe card, then a fresh import next to them.
    for (const slot of [518, 519]) {
      samples[slot] = {
        slot, pcmData: pcm, sampleRate: NATIVE_RATE, name: `S${slot}`,
        _raw: rawAt(slot, { imp: slot + 50, user: slot }),
      };
    }
    samples[520] = { slot: 520, pcmData: pcm, sampleRate: NATIVE_RATE, name: 'FRESH' };

    const built = buildE2sAllFile(samples);
    const parsed = parseE2sAllFile(built);
    const rawOf = slot => parsed.samples[slot].esli._raw;

    expect(rawOf(518).readUInt16LE(0x4e)).toBe(518);   // preserved, unchanged
    expect(rawOf(520).readUInt16LE(0x4e)).toBe(520);   // fresh, matches the file
    expect(rawOf(520).readUInt16LE(0x14)).toBe(570);
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
// Real .e2sSample.all files (verified against a 403-sample Hacktribe dump and
// the Oe2sSLE reference implementation) use a 1020-entry offset table of
// 4-byte uint32LE START offsets at 0x10 (0 = empty slot); data begins at
// 0x1000 = 4096. Table index == hardware sample number − 1, and the ESLI
// uint16 @0x00 stores that same 0-based index (the osc number).
//
// The previous reader treated the table as 510 × 8-byte [start, end] pairs —
// double stride — and therefore saw only every SECOND sample ("202" of 403);
// its writer produced files whose samples the hardware never referenced.
describe('E2S - real hardware offset-table format (regression)', () => {
  // Extract a single valid WAV body from a built all-file.
  function extractWav(allBuf, slot = 0) {
    const off = allBuf.readUInt32LE(HEADER_SIZE + slot * OFFSET_ENTRY);
    const riffLen = allBuf.readUInt32LE(off + 4) + 8; // RIFF size + 8-byte tag/size
    return allBuf.slice(off, off + riffLen);
  }

  // Lay out an all-file exactly like real hardware: 4-byte start-offset table,
  // WAV data back-to-back from 4096.
  function buildHardwareFormatFile(entries) {
    const dataLen = entries.reduce((n, e) => n + e.wav.length, 0);
    const buf = Buffer.alloc(DATA_START + dataLen, 0);
    MAGIC.copy(buf, 0);
    let pos = DATA_START;
    for (const e of entries) {
      buf.writeUInt32LE(pos, HEADER_SIZE + e.slot * OFFSET_ENTRY);
      e.wav.copy(buf, pos);
      pos += e.wav.length;
    }
    return buf;
  }

  it('uses a 1020-entry table of 4-byte start offsets, data at 4096', () => {
    expect(DATA_START).toBe(4096);
    expect(MAX_SLOTS).toBe(1020);
    expect(OFFSET_ENTRY).toBe(4);
    expect(HEADER_SIZE + MAX_SLOTS * OFFSET_ENTRY).toBe(DATA_START);
  });

  it('buildE2sAllFile writes start offsets only, back-to-back data @4096', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
    const buf = buildE2sAllFile([
      { slot: 500, name: 'A', pcmData: pcm, sampleRate: NATIVE_RATE },
      { slot: 501, name: 'B', pcmData: pcm, sampleRate: NATIVE_RATE },
    ]);

    const offA = buf.readUInt32LE(HEADER_SIZE + 500 * OFFSET_ENTRY);
    const offB = buf.readUInt32LE(HEADER_SIZE + 501 * OFFSET_ENTRY);
    const wavLenA = buf.readUInt32LE(offA + 4) + 8;

    expect(offA).toBe(DATA_START);         // first sample starts at 4096
    expect(offB).toBe(offA + wavLenA);     // contiguous, no gaps
    // Every untouched entry is 0.
    expect(buf.readUInt32LE(HEADER_SIZE)).toBe(0);
    expect(buf.readUInt32LE(HEADER_SIZE + 502 * OFFSET_ENTRY)).toBe(0);
  });

  it('stamps the ESLI osc index (u16 @0x00) with the slot', () => {
    const pcm = Buffer.alloc(200);
    const buf = buildE2sAllFile([{ slot: 518, name: 'OSC', pcmData: pcm, sampleRate: NATIVE_RATE }]);
    const wav = extractWav(buf, 518);
    const esliAt = wav.indexOf(Buffer.from('esli')) + 8;
    expect(wav.readUInt16LE(esliAt)).toBe(518);

    const parsed = parseE2sAllFile(buf);
    expect(parsed.samples[518].esli.slotNumber).toBe(518);
  });

  it('parses samples in high Hacktribe slots (user area starts at 500)', () => {
    const pcm = Buffer.alloc(400);
    for (let i = 0; i < 200; i++) pcm.writeInt16LE(i * 50 - 5000, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 518, name: 'REAL', pcmData: pcm, sampleRate: NATIVE_RATE }]), 518
    );
    const buf = buildHardwareFormatFile([{ slot: 518, wav }, { slot: 920, wav }]);

    let parsed;
    expect(() => { parsed = parseE2sAllFile(buf); }).not.toThrow();
    expect(parsed.samples[518]).not.toBeNull();
    expect(parsed.samples[518].esli.name).toBe('REAL');
    expect(parsed.samples[518].pcmData.equals(pcm)).toBe(true);
    expect(parsed.samples[920]).not.toBeNull();
    expect(parsed.samples[919]).toBeNull();
  });

  it('parses CONSECUTIVE slots — the double-stride bug dropped every 2nd sample', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 0, name: 'SEQ', pcmData: pcm, sampleRate: NATIVE_RATE }])
    );
    // Four consecutive slots, like every real dump. The old 8-byte-stride
    // reader saw slots 10 and 12 only.
    const buf = buildHardwareFormatFile(
      [10, 11, 12, 13].map(slot => ({ slot, wav })));

    const parsed = parseE2sAllFile(buf);
    for (const slot of [10, 11, 12, 13]) {
      expect(parsed.samples[slot], `slot ${slot}`).not.toBeNull();
      expect(parsed.samples[slot].esli.name).toBe('SEQ');
    }
  });

  it('skips garbage/out-of-range table entries instead of throwing', () => {
    const pcm = Buffer.alloc(200);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
    const wav = extractWav(
      buildE2sAllFile([{ slot: 0, name: 'OK', pcmData: pcm, sampleRate: NATIVE_RATE }])
    );
    const buf = buildHardwareFormatFile([{ slot: 5, wav }]);
    // Corrupt a neighbouring entry with an out-of-range offset.
    buf.writeUInt32LE(buf.length + 1_000_000, HEADER_SIZE + 6 * OFFSET_ENTRY);

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
