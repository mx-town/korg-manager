/**
 * ESX Pattern Parsing Tests
 * Covers pattern header parsing, part types, step data,
 * keyboard note decoding, accent inversion, and edge cases.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect, beforeAll
const {
  parseEsxPatterns,
  parseEsxPattern,
  createEmptyEsx,
  buildEsxFile,
  ADDR,
  SIZE,
  NUM,
  PATTERN_SIZE,
  PATTERN_COUNT,
  PATTERN_OFFSETS,
} = require('../../src/esx-format');
const {
  generateMinimalESX,
  generateESXWithSample,
  generateESXWithNSamples,
} = require('../fixtures/generators/minimal-esx');

// ── Pattern count & structure ────────────────────────────

describe('ESX Patterns - Count & structure', () => {
  let patterns;

  beforeAll(() => {
    patterns = parseEsxPatterns(generateMinimalESX());
  });

  it('should parse all 256 patterns', () => {
    expect(patterns).toHaveLength(PATTERN_COUNT);
  });

  it('should have 16 parts per pattern', () => {
    expect(patterns[0].parts).toHaveLength(16);
  });

  it('should have correct part type distribution', () => {
    const types = patterns[0].parts.map(p => p.type);
    // 9 drums, 2 keyboards, 2 stretch, 1 slice, 1 audioin, 1 accent
    expect(types.filter(t => t === 'drum')).toHaveLength(9);
    expect(types.filter(t => t === 'keyboard')).toHaveLength(2);
    expect(types.filter(t => t === 'stretch')).toHaveLength(2);
    expect(types.filter(t => t === 'slice')).toHaveLength(1);
    expect(types.filter(t => t === 'audioin')).toHaveLength(1);
    expect(types.filter(t => t === 'accent')).toHaveLength(1);
  });

  it('should have correct part order', () => {
    const parts = patterns[0].parts;
    for (let i = 0; i < 9; i++) expect(parts[i].type).toBe('drum');
    expect(parts[9].type).toBe('keyboard');
    expect(parts[10].type).toBe('keyboard');
    expect(parts[11].type).toBe('stretch');
    expect(parts[12].type).toBe('stretch');
    expect(parts[13].type).toBe('slice');
    expect(parts[14].type).toBe('audioin');
    expect(parts[15].type).toBe('accent');
  });
});

// ── Pattern header defaults ──────────────────────────────

describe('ESX Patterns - Header defaults', () => {
  let pattern;

  beforeAll(() => {
    pattern = parseEsxPatterns(generateMinimalESX())[0];
  });

  it('should parse default pattern name as "Init"', () => {
    expect(pattern.name).toBe('Init');
  });

  it('should parse default tempo as 120.0 BPM', () => {
    expect(pattern.tempo).toBe(120.0);
  });

  it('should parse default swing as 0', () => {
    expect(pattern.swing).toBe(0);
  });

  it('should parse default lastStep as 15 (16 steps)', () => {
    expect(pattern.lastStep).toBe(15);
  });

  it('should have 3 FX entries', () => {
    expect(pattern.effects).toHaveLength(3);
  });

  it('should parse FX defaults (type=1, params=0x40/0x40/0x00)', () => {
    for (const fx of pattern.effects) {
      expect(fx.type).toBe(0x01);
      expect(fx.param1).toBe(0x40);
      expect(fx.param2).toBe(0x40);
      expect(fx.param3).toBe(0x00);
    }
  });
});

// ── All patterns named "Init" ────────────────────────────

describe('ESX Patterns - All 256 defaults', () => {
  let patterns;

  beforeAll(() => {
    patterns = parseEsxPatterns(generateMinimalESX());
  });

  it('should have all patterns named "Init"', () => {
    for (const p of patterns) {
      expect(p.name).toBe('Init');
    }
  });

  it('should have all patterns at 120 BPM', () => {
    for (const p of patterns) {
      expect(p.tempo).toBe(120.0);
    }
  });

  it('should have all patterns with 16 steps', () => {
    for (const p of patterns) {
      expect(p.lastStep).toBe(15);
    }
  });
});

// ── Drum parts ───────────────────────────────────────────

describe('ESX Patterns - Drum parts', () => {
  let parts;

  beforeAll(() => {
    parts = parseEsxPatterns(generateMinimalESX())[0].parts.filter(p => p.type === 'drum');
  });

  it('should have 9 drum parts', () => {
    expect(parts).toHaveLength(9);
  });

  it('should name drum parts "Drum 1" through "Drum 9"', () => {
    for (let i = 0; i < 9; i++) {
      expect(parts[i].name).toBe(`Drum ${i + 1}`);
    }
  });

  it('should have 16 steps per drum part', () => {
    for (const p of parts) {
      expect(p.steps).toHaveLength(16);
    }
  });

  it('should have all steps OFF in Init pattern', () => {
    for (const p of parts) {
      expect(p.steps.every(s => s === false)).toBe(true);
    }
  });

  it('should parse default level as 0x64 (100)', () => {
    for (const p of parts) {
      expect(p.level).toBe(0x64);
    }
  });

  it('should parse default pan as 0x40 (center)', () => {
    for (const p of parts) {
      expect(p.pan).toBe(0x40);
    }
  });

  it('should parse sample pointer as uint16BE', () => {
    for (const p of parts) {
      expect(p.sampleNum).toBe(0x0000);
    }
  });
});

// ── Keyboard parts ───────────────────────────────────────

describe('ESX Patterns - Keyboard parts', () => {
  let kbParts;

  beforeAll(() => {
    kbParts = parseEsxPatterns(generateMinimalESX())[0].parts.filter(p => p.type === 'keyboard');
  });

  it('should have 2 keyboard parts', () => {
    expect(kbParts).toHaveLength(2);
  });

  it('should name keyboard parts "KB 1" and "KB 2"', () => {
    expect(kbParts[0].name).toBe('KB 1');
    expect(kbParts[1].name).toBe('KB 2');
  });

  it('should have 128 note entries', () => {
    for (const kb of kbParts) {
      expect(kb.notes).toHaveLength(128);
    }
  });

  it('should have 128 gate entries', () => {
    for (const kb of kbParts) {
      expect(kb.gates).toHaveLength(128);
    }
  });

  it('should decode Init note bytes: all OFF, note = C4 (0x3C)', () => {
    // Init keyboard notes are 0xBC = bit7 set (OFF) + 0x3C (C4)
    for (const kb of kbParts) {
      for (const note of kb.notes) {
        expect(note.active).toBe(false);
        expect(note.note).toBe(0x3C); // C4
      }
    }
  });

  it('should parse default gate values as 0x02', () => {
    for (const kb of kbParts) {
      for (const gate of kb.gates) {
        expect(gate).toBe(0x02);
      }
    }
  });

  it('should parse default level as 0x64 (100)', () => {
    for (const kb of kbParts) {
      expect(kb.level).toBe(0x64);
    }
  });
});

// ── Stretch & Slice parts ────────────────────────────────

describe('ESX Patterns - Stretch & Slice parts', () => {
  let parts;

  beforeAll(() => {
    const allParts = parseEsxPatterns(generateMinimalESX())[0].parts;
    parts = allParts.filter(p => p.type === 'stretch' || p.type === 'slice');
  });

  it('should have 2 stretch + 1 slice = 3 parts', () => {
    expect(parts).toHaveLength(3);
    expect(parts.filter(p => p.type === 'stretch')).toHaveLength(2);
    expect(parts.filter(p => p.type === 'slice')).toHaveLength(1);
  });

  it('should have 16 steps per part', () => {
    for (const p of parts) {
      expect(p.steps).toHaveLength(16);
    }
  });

  it('should have all steps OFF in Init pattern', () => {
    for (const p of parts) {
      expect(p.steps.every(s => s === false)).toBe(true);
    }
  });

  it('should parse default level as 0x64 (100)', () => {
    for (const p of parts) {
      expect(p.level).toBe(0x64);
    }
  });
});

// ── Audio In part ────────────────────────────────────────

describe('ESX Patterns - Audio In part', () => {
  let audioIn;

  beforeAll(() => {
    audioIn = parseEsxPatterns(generateMinimalESX())[0].parts.find(p => p.type === 'audioin');
  });

  it('should exist and be named "Audio In"', () => {
    expect(audioIn).toBeDefined();
    expect(audioIn.name).toBe('Audio In');
  });

  it('should have 16 steps', () => {
    expect(audioIn.steps).toHaveLength(16);
  });

  it('should have 128 gate entries', () => {
    expect(audioIn.gates).toHaveLength(128);
  });

  it('should have all steps OFF in Init', () => {
    expect(audioIn.steps.every(s => s === false)).toBe(true);
  });

  it('should parse default gate values as 0x02', () => {
    for (const gate of audioIn.gates) {
      expect(gate).toBe(0x02);
    }
  });

  it('should parse default level as 0x64 (100)', () => {
    expect(audioIn.level).toBe(0x64);
  });
});

// ── Accent part (inverted logic) ─────────────────────────

describe('ESX Patterns - Accent part', () => {
  let accent;

  beforeAll(() => {
    accent = parseEsxPatterns(generateMinimalESX())[0].parts.find(p => p.type === 'accent');
  });

  it('should exist and be named "Accent"', () => {
    expect(accent).toBeDefined();
    expect(accent.name).toBe('Accent');
  });

  it('should have 16 steps', () => {
    expect(accent.steps).toHaveLength(16);
  });

  it('should decode inverted logic: 0xFF → OFF (false)', () => {
    // Init accent bytes are 0xFF = OFF
    expect(accent.steps.every(s => s === false)).toBe(true);
  });

  it('should parse default level as 0x40 (64)', () => {
    expect(accent.level).toBe(0x40);
  });
});

// ── Accent inversion verification ────────────────────────

describe('ESX Patterns - Accent inversion manual test', () => {
  it('should decode 0x00 as ON and 0xFF as OFF', () => {
    const buf = generateMinimalESX();
    const accentOff = ADDR.PATTERN_DATA + PATTERN_OFFSETS.ACCENT;

    // Write step 0 as ON (0x00) and step 1 as OFF (0xFF)
    buf.writeUInt8(0x00, accentOff + 2);   // step 0 ON
    buf.writeUInt8(0xFF, accentOff + 3);   // step 1 OFF

    const patterns = parseEsxPatterns(buf);
    const accent = patterns[0].parts.find(p => p.type === 'accent');

    expect(accent.steps[0]).toBe(true);    // 0x00 = ON
    expect(accent.steps[1]).toBe(false);   // 0xFF = OFF
  });
});

// ── Keyboard note bit decoding ───────────────────────────

describe('ESX Patterns - Keyboard note bit decoding', () => {
  it('should decode bit 7 = 0 as active, bit 7 = 1 as inactive', () => {
    const buf = generateMinimalESX();
    const kb1Off = ADDR.PATTERN_DATA + PATTERN_OFFSETS.KB1;

    // Write note byte: 0x3C = active (bit7=0), note=60 (C4)
    buf.writeUInt8(0x3C, kb1Off + 18);
    // Write note byte: 0xBC = inactive (bit7=1), note=60 (C4)
    buf.writeUInt8(0xBC, kb1Off + 19);
    // Write note byte: 0x00 = active (bit7=0), note=0
    buf.writeUInt8(0x00, kb1Off + 20);
    // Write note byte: 0x7F = active (bit7=0), note=127
    buf.writeUInt8(0x7F, kb1Off + 21);

    const patterns = parseEsxPatterns(buf);
    const kb = patterns[0].parts.find(p => p.name === 'KB 1');

    expect(kb.notes[0]).toEqual({ active: true, note: 60 });
    expect(kb.notes[1]).toEqual({ active: false, note: 60 });
    expect(kb.notes[2]).toEqual({ active: true, note: 0 });
    expect(kb.notes[3]).toEqual({ active: true, note: 127 });
  });
});

// ── Custom pattern header ────────────────────────────────

describe('ESX Patterns - Custom pattern header', () => {
  it('should parse custom name and tempo', () => {
    const buf = generateMinimalESX();
    const patOff = ADDR.PATTERN_DATA;

    // Write custom name
    buf.fill(0x20, patOff, patOff + 8);
    buf.write('MYBEAT', patOff, 'ascii');

    // Write 140 BPM (140 × 128 = 17920 = 0x4600)
    buf.writeUInt16BE(Math.round(140 * 128), patOff + 8);

    // Set swing to 60
    buf.writeUInt8(60, patOff + 10);

    // Set last step to 31 (32 steps)
    buf.writeUInt8(31, patOff + 13);

    const patterns = parseEsxPatterns(buf);
    expect(patterns[0].name).toBe('MYBEAT');
    expect(patterns[0].tempo).toBe(140.0);
    expect(patterns[0].swing).toBe(60);
    expect(patterns[0].lastStep).toBe(31);
  });
});

// ── Drum step activation ─────────────────────────────────

describe('ESX Patterns - Drum step activation', () => {
  it('should detect active drum steps (non-zero bytes)', () => {
    const buf = generateMinimalESX();
    const drumOff = ADDR.PATTERN_DATA + PATTERN_OFFSETS.DRUM_START;

    // Activate steps 0, 4, 8, 12 (4-on-the-floor)
    buf.writeUInt8(0x11, drumOff + 18 + 0);
    buf.writeUInt8(0x11, drumOff + 18 + 4);
    buf.writeUInt8(0x11, drumOff + 18 + 8);
    buf.writeUInt8(0x11, drumOff + 18 + 12);

    const patterns = parseEsxPatterns(buf);
    const drum1 = patterns[0].parts[0];

    expect(drum1.steps[0]).toBe(true);
    expect(drum1.steps[1]).toBe(false);
    expect(drum1.steps[2]).toBe(false);
    expect(drum1.steps[3]).toBe(false);
    expect(drum1.steps[4]).toBe(true);
    expect(drum1.steps[8]).toBe(true);
    expect(drum1.steps[12]).toBe(true);
  });
});

// ── Pattern with samples ─────────────────────────────────

describe('ESX Patterns - File with samples', () => {
  it('should parse patterns from ESX file containing samples', () => {
    const buf = generateESXWithNSamples(9);
    const patterns = parseEsxPatterns(buf);

    expect(patterns).toHaveLength(PATTERN_COUNT);
    // Pattern 0 should have samples assigned to drums
    const drum1 = patterns[0].parts[0];
    expect(drum1.sampleNum).toBe(0);
  });

  it('should detect active steps in pattern with samples', () => {
    const buf = generateESXWithNSamples(1);
    const patterns = parseEsxPatterns(buf);

    // buildEsxFile activates all 16 steps for drum part 0
    const drum1 = patterns[0].parts[0];
    const activeCount = drum1.steps.filter(s => s).length;
    expect(activeCount).toBe(16);
  });
});

// ── Validation ───────────────────────────────────────────

describe('ESX Patterns - Validation', () => {
  it('should throw on too-small buffer', () => {
    expect(() => parseEsxPatterns(Buffer.alloc(100))).toThrow('too small');
  });

  it('should throw on wrong magic bytes', () => {
    const bad = Buffer.alloc(SIZE.FILE_MIN, 0);
    bad.write('NOPE', 0, 'ascii');
    expect(() => parseEsxPatterns(bad)).toThrow('KORG');
  });

  it('should accept valid ESX file with samples', () => {
    const buf = generateESXWithSample('PTEST', 100);
    expect(() => parseEsxPatterns(buf)).not.toThrow();
  });
});

// ── Constants ────────────────────────────────────────────

describe('ESX Patterns - Constants', () => {
  it('should export correct PATTERN_SIZE', () => {
    expect(PATTERN_SIZE).toBe(4280);
  });

  it('should export correct PATTERN_COUNT', () => {
    expect(PATTERN_COUNT).toBe(256);
  });

  it('should export correct PATTERN_OFFSETS', () => {
    expect(PATTERN_OFFSETS.HEADER).toBe(0);
    expect(PATTERN_OFFSETS.DRUM_START).toBe(24);
    expect(PATTERN_OFFSETS.KB1).toBe(330);
    expect(PATTERN_OFFSETS.KB2).toBe(604);
    expect(PATTERN_OFFSETS.STRETCH1).toBe(878);
    expect(PATTERN_OFFSETS.STRETCH2).toBe(910);
    expect(PATTERN_OFFSETS.SLICE).toBe(942);
    expect(PATTERN_OFFSETS.AUDIOIN).toBe(974);
    expect(PATTERN_OFFSETS.ACCENT).toBe(1130);
    expect(PATTERN_OFFSETS.FX).toBe(1148);
    expect(PATTERN_OFFSETS.MOTION).toBe(1160);
  });

  it('should have part sizes that add up to PATTERN_SIZE', () => {
    // 24 header + 9×34 drums + 2×274 kb + 2×32 stretch + 32 slice
    // + 156 audioin + 18 accent + 12 fx + 24×130 motion = 4280
    const total = 24 + 9*34 + 2*274 + 2*32 + 32 + 156 + 18 + 12 + 24*130;
    expect(total).toBe(PATTERN_SIZE);
  });
});
