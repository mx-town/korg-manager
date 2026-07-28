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
