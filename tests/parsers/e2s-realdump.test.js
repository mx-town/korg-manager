/**
 * E2S real-hardware dump validation.
 * Runs only when test-data/e2s/hacktribe.e2sSample.all is present (17 MB
 * Hacktribe dump, gitignored — factory sample content is not committed).
 *
 * Ground truth established 2026-07-28 by direct inspection of the dump:
 * 403 samples at contiguous table entries 518–920, all valid RIFF WAVs
 * back-to-back from 0x1000, ESLI u16 @0x00 == table index for every sample.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseE2sAllFile,
  buildE2sAllFile,
  ESLI_DATA_SIZE,
} = require('../../src/e2s-format');

const DUMP = path.join(__dirname, '../../test-data/e2s/hacktribe.e2sSample.all');
const hasDump = fs.existsSync(DUMP);

describe.skipIf(!hasDump)('E2S - real Hacktribe hardware dump', () => {
  let buf, parsed;
  beforeAll(() => {
    buf = fs.readFileSync(DUMP);
    parsed = parseE2sAllFile(buf);
  });

  it('finds all 403 samples at their true slots (518–920)', () => {
    const used = [];
    parsed.samples.forEach((s, i) => { if (s && !s.error) used.push(i); });
    expect(used).toHaveLength(403);
    expect(used[0]).toBe(518);
    expect(used[used.length - 1]).toBe(920);
    // Contiguous — the double-stride bug produced gaps at every odd slot.
    for (let k = 1; k < used.length; k++) expect(used[k]).toBe(used[k - 1] + 1);
  });

  it('reads ESLI osc index == table slot for every sample', () => {
    for (const s of parsed.samples) {
      if (!s || s.error) continue;
      expect(s.esli.slotNumber).toBe(s.slot);
    }
  });

  // Ground truth for the fields a freshly imported sample must also fill in.
  // Every one of these holds for all 403 samples in the dump; a cross-device
  // import used to leave them at 0, which the hardware rejects on LOAD ALL.
  it('satisfies the slot-derived and playback ESLI invariants for every sample', () => {
    let checked = 0;
    for (const s of parsed.samples) {
      if (!s || s.error) continue;
      const r = s.esli._raw;
      const i = s.slot;
      expect(r.readUInt16LE(0x00), `slot ${i} osc index`).toBe(i);
      expect(r.readUInt16LE(0x14), `slot ${i} import number`).toBe(i + 50);
      expect(r.readUInt16LE(0x4e), `slot ${i} user number`).toBe(i - 500);
      // playLogPeriod is a pure function of the sample rate (exact, 403/403).
      const sr = r.readUInt32LE(0x48);
      expect(r.readUInt16LE(0x22), `slot ${i} playLogPeriod`)
        .toBe(Math.round(63132 - 3072 * Math.log2(sr)));
      // playVolume is a 16-bit level, never zero (0xFFFF = 100%).
      expect(r.readUInt16LE(0x24), `slot ${i} playVolume`).toBeGreaterThan(0);
      // 0x34 is an explicit ONE-SHOT flag, not derived: 1 = one-shot, 0 = loop.
      const looped = r.readUInt32LE(0x2c) < r.readUInt32LE(0x30);
      expect(r.readUInt32LE(0x34), `slot ${i} one-shot flag`).toBe(looped ? 0 : 1);
      // Categories 0 (Analog) and 1 (Audio In) are firmware-only.
      expect(r.readUInt16LE(0x12), `slot ${i} category`).toBeGreaterThan(1);
      checked++;
    }
    expect(checked).toBe(403);
  });

  it('round-trips the ENTIRE file byte-identically (load → save)', () => {
    const rebuilt = buildE2sAllFile(
      parsed.samples
        .filter(s => s && !s.error)
        .map(s => ({
          slot: s.slot,
          name: s.esli.name,
          pcmData: s.pcmData,
          channels: s.channels,
          sampleRate: s.esli.sampleRate,
          category: s.esli.category,
          loudness: s.esli.loudness,
          playLogPeriod: s.esli.playLogPeriod,
          playVolume: s.esli.playVolume,
          startPoint: s.esli.startPoint,
          endPoint: s.esli.endPoint,
          loopStart: s.esli.loopType ? s.esli.loopStart : null,
          _raw: s.esli._raw,
        }))
    );
    expect(rebuilt.length).toBe(buf.length);
    expect(rebuilt.equals(buf)).toBe(true);
    // And the raw ESLI blocks survive a re-parse intact.
    const reparsed = parseE2sAllFile(rebuilt);
    for (let i = 0; i < parsed.samples.length; i++) {
      const a = parsed.samples[i], b = reparsed.samples[i];
      if (!a || a.error) { expect(b).toBeNull(); continue; }
      expect(b.esli._raw).toHaveLength(ESLI_DATA_SIZE);
      expect(b.esli._raw.equals(a.esli._raw), `slot ${i} ESLI`).toBe(true);
    }
  });
});
