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
  rebuildEsxFile,
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
    patterns.forEach((p) => {
      expect(p.name).toBe('Init');
    });
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

  it('should have 128 steps per drum part (bit-packed)', () => {
    for (const p of parts) {
      expect(p.steps).toHaveLength(128);
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

  it('should have 128 steps per part (bit-packed)', () => {
    for (const p of parts) {
      expect(p.steps).toHaveLength(128);
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

  it('should have 128 steps (bit-packed)', () => {
    expect(audioIn.steps).toHaveLength(128);
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

  it('should have 128 steps (bit-packed)', () => {
    expect(accent.steps).toHaveLength(128);
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
  it('should decode inverted bit-packed accent steps (LSB-first)', () => {
    const buf = generateMinimalESX();
    const accentOff = ADDR.PATTERN_DATA + PATTERN_OFFSETS.ACCENT;

    // LSB-first, inverted: bit=0 means ON, bit=1 means OFF
    // Byte 0 = 0xFE = 1111_1110 → bit0=0 → step 0 ON; bits 1-7=1 → steps 1-7 OFF
    buf.writeUInt8(0xFE, accentOff + 2);
    // Byte 1 = 0xFF → all bits=1 → all OFF
    buf.writeUInt8(0xFF, accentOff + 3);

    const patterns = parseEsxPatterns(buf);
    const accent = patterns[0].parts.find(p => p.type === 'accent');

    expect(accent.steps[0]).toBe(true);    // bit0=0 → inverted → ON
    expect(accent.steps[1]).toBe(false);   // bit1=1 → inverted → OFF
    expect(accent.steps[7]).toBe(false);   // bit7=1 → inverted → OFF
    expect(accent.steps[8]).toBe(false);   // byte 1 all 1s → all OFF
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
  it('should detect active drum steps from bit-packed bytes (LSB-first)', () => {
    const buf = generateMinimalESX();
    const drumOff = ADDR.PATTERN_DATA + PATTERN_OFFSETS.DRUM_START;

    // LSB-first bit-packed: byte 0 covers steps 0-7, byte 1 covers steps 8-15
    // Four-on-the-floor: steps 0,4,8,12 active
    // Byte 0: step 0 = bit0, step 4 = bit4 → 0001_0001 = 0x11
    // Byte 1: step 8 = bit0, step 12 = bit4 → 0001_0001 = 0x11
    buf.writeUInt8(0x11, drumOff + 18 + 0);
    buf.writeUInt8(0x11, drumOff + 18 + 1);

    const patterns = parseEsxPatterns(buf);
    const drum1 = patterns[0].parts[0];

    expect(drum1.steps[0]).toBe(true);
    expect(drum1.steps[1]).toBe(false);
    expect(drum1.steps[2]).toBe(false);
    expect(drum1.steps[3]).toBe(false);
    expect(drum1.steps[4]).toBe(true);
    expect(drum1.steps[5]).toBe(false);
    expect(drum1.steps[8]).toBe(true);
    expect(drum1.steps[12]).toBe(true);
    expect(drum1.steps[15]).toBe(false);
  });
});

// ── Pattern with samples ─────────────────────────────────

describe('ESX Patterns - File with samples', () => {
  it('should parse patterns from ESX file containing samples', () => {
    const buf = generateESXWithNSamples(9);
    const patterns = parseEsxPatterns(buf);

    expect(patterns).toHaveLength(PATTERN_COUNT);
    const drum1 = patterns[0].parts[0];
    expect(drum1.sampleNum).toBe(0);
  });

  it('should leave patterns empty — loading samples programs no steps', () => {
    const buf = generateESXWithNSamples(1);
    const patterns = parseEsxPatterns(buf);

    const drum1 = patterns[0].parts[0];
    expect(drum1.steps.filter(s => s)).toHaveLength(0);
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

// ── Filter params on all part types ─────────────────────

describe('ESX Patterns - Filter params on all part types', () => {
  let pattern;

  beforeAll(() => {
    pattern = parseEsxPatterns(generateMinimalESX())[0];
  });

  it('drum parts should have all filter/mod params', () => {
    for (const p of pattern.parts.filter(p => p.type === 'drum')) {
      expect(p.filterType).toBeDefined();
      expect(p.cutoff).toBeDefined();
      expect(p.resonance).toBeDefined();
      expect(p.egInt).toBeDefined();
      expect(p.pitch).toBeDefined();
      expect(p.egTime).toBeDefined();
      expect(p.startPoint).toBeDefined();
      expect(p.modSpeed).toBeDefined();
      expect(p.modDepth).toBeDefined();
    }
  });

  it('drum parts should have correct Init defaults', () => {
    const d = pattern.parts[0];
    expect(d.filterType).toBe(0x00);  // LPF
    expect(d.cutoff).toBe(0x7F);      // open
    expect(d.resonance).toBe(0x00);
    expect(d.egInt).toBe(0x40);       // center
    expect(d.pitch).toBe(0x40);       // center
    expect(d.egTime).toBe(0x7F);
    expect(d.startPoint).toBe(0x00);
    expect(d.modSpeed).toBe(0x40);
    expect(d.modDepth).toBe(0x40);    // center
  });

  it('keyboard parts should have all filter/mod params plus glide', () => {
    for (const p of pattern.parts.filter(p => p.type === 'keyboard')) {
      expect(p.filterType).toBeDefined();
      expect(p.cutoff).toBeDefined();
      expect(p.resonance).toBeDefined();
      expect(p.egInt).toBeDefined();
      expect(p.glide).toBeDefined();
      expect(p.egTime).toBeDefined();
      expect(p.startPoint).toBeDefined();
      expect(p.modSpeed).toBeDefined();
      expect(p.modDepth).toBeDefined();
    }
  });

  it('keyboard parts should have correct Init defaults', () => {
    const kb = pattern.parts[9];
    expect(kb.glide).toBe(0x00);
    expect(kb.filterType).toBe(0x00);
    expect(kb.cutoff).toBe(0x7F);
    expect(kb.resonance).toBe(0x00);
    expect(kb.egInt).toBe(0x40);
    expect(kb.egTime).toBe(0x40);
    expect(kb.startPoint).toBe(0x00);
    expect(kb.modSpeed).toBe(0x40);
    expect(kb.modDepth).toBe(0x40);
  });

  it('stretch/slice parts should have all filter/mod params', () => {
    for (const p of pattern.parts.filter(p => p.type === 'stretch' || p.type === 'slice')) {
      expect(p.filterType).toBeDefined();
      expect(p.cutoff).toBeDefined();
      expect(p.resonance).toBeDefined();
      expect(p.egInt).toBeDefined();
      expect(p.pitch).toBeDefined();
      expect(p.egTime).toBeDefined();
      expect(p.startPoint).toBeDefined();
      expect(p.modSpeed).toBeDefined();
      expect(p.modDepth).toBeDefined();
    }
  });

  it('stretch parts should have correct Init defaults', () => {
    const st = pattern.parts[11];
    expect(st.filterType).toBe(0x00);
    expect(st.cutoff).toBe(0x7F);
    expect(st.resonance).toBe(0x00);
    expect(st.egInt).toBe(0x40);
    expect(st.pitch).toBe(0x40);
    expect(st.egTime).toBe(0x7F);
    expect(st.startPoint).toBe(0x00);
    expect(st.modSpeed).toBe(0x40);
    expect(st.modDepth).toBe(0x40);
  });

  it('audio-in part should have filter/mod params (no pitch, no sample)', () => {
    const ain = pattern.parts[14];
    expect(ain.filterType).toBeDefined();
    expect(ain.cutoff).toBeDefined();
    expect(ain.resonance).toBeDefined();
    expect(ain.egInt).toBeDefined();
    expect(ain.egTime).toBeDefined();
    expect(ain.modSpeed).toBeDefined();
    expect(ain.modDepth).toBeDefined();
    expect(ain.pitch).toBeUndefined();
    expect(ain.sampleNum).toBeUndefined();
  });

  it('audio-in part should have correct Init defaults', () => {
    const ain = pattern.parts[14];
    expect(ain.filterType).toBe(0x00);
    expect(ain.cutoff).toBe(0x7F);
    expect(ain.resonance).toBe(0x00);
    expect(ain.egInt).toBe(0x40);
    expect(ain.egTime).toBe(0x40);
    expect(ain.modSpeed).toBe(0x40);
    expect(ain.modDepth).toBe(0x40);
  });

  it('all cutoff values should be in 0-127 range', () => {
    for (const p of pattern.parts) {
      if ('cutoff' in p) {
        expect(p.cutoff).toBeGreaterThanOrEqual(0);
        expect(p.cutoff).toBeLessThanOrEqual(127);
      }
    }
  });
});

// ── Custom filter param values via byte injection ───────

describe('ESX Patterns - Custom filter param byte injection', () => {
  it('drum part: custom filter values round-trip correctly', () => {
    const buf = generateMinimalESX();
    const off = ADDR.PATTERN_DATA + PATTERN_OFFSETS.DRUM_START; // drum 1
    buf.writeUInt8(2, off + 4);    // filterType = BPF
    buf.writeUInt8(100, off + 5);  // cutoff = 100
    buf.writeUInt8(80, off + 6);   // resonance = 80
    buf.writeUInt8(30, off + 7);   // egInt = 30
    buf.writeUInt8(0x7F, off + 11); // egTime = 127
    buf.writeUInt8(50, off + 12);  // startPoint = 50
    buf.writeUInt8(90, off + 15);  // modSpeed = 90
    buf.writeUInt8(10, off + 16);  // modDepth = 10

    const d = parseEsxPatterns(buf)[0].parts[0];
    expect(d.filterType).toBe(2);
    expect(d.cutoff).toBe(100);
    expect(d.resonance).toBe(80);
    expect(d.egInt).toBe(30);
    expect(d.egTime).toBe(127);
    expect(d.startPoint).toBe(50);
    expect(d.modSpeed).toBe(90);
    expect(d.modDepth).toBe(10);
  });

  it('stretch part: custom filter values round-trip correctly', () => {
    const buf = generateMinimalESX();
    const off = ADDR.PATTERN_DATA + PATTERN_OFFSETS.STRETCH1;
    buf.writeUInt8(1, off + 2);    // filterType = HPF
    buf.writeUInt8(60, off + 3);   // cutoff = 60
    buf.writeUInt8(40, off + 4);   // resonance = 40
    buf.writeUInt8(20, off + 5);   // egInt = 20
    buf.writeUInt8(70, off + 6);   // pitch = 70
    buf.writeUInt8(55, off + 9);   // egTime = 55
    buf.writeUInt8(33, off + 10);  // startPoint = 33
    buf.writeUInt8(77, off + 13);  // modSpeed = 77
    buf.writeUInt8(88, off + 14);  // modDepth = 88

    const st = parseEsxPatterns(buf)[0].parts[11];
    expect(st.filterType).toBe(1);
    expect(st.cutoff).toBe(60);
    expect(st.resonance).toBe(40);
    expect(st.egInt).toBe(20);
    expect(st.pitch).toBe(70);
    expect(st.egTime).toBe(55);
    expect(st.startPoint).toBe(33);
    expect(st.modSpeed).toBe(77);
    expect(st.modDepth).toBe(88);
  });

  it('audio-in part: custom filter values round-trip correctly', () => {
    const buf = generateMinimalESX();
    const off = ADDR.PATTERN_DATA + PATTERN_OFFSETS.AUDIOIN;
    buf.writeUInt8(3, off + 0);    // filterType = BPF+
    buf.writeUInt8(45, off + 1);   // cutoff = 45
    buf.writeUInt8(55, off + 2);   // resonance = 55
    buf.writeUInt8(65, off + 3);   // egInt = 65
    buf.writeUInt8(75, off + 6);   // egTime = 75
    buf.writeUInt8(85, off + 9);   // modSpeed = 85
    buf.writeUInt8(95, off + 10);  // modDepth = 95

    const ain = parseEsxPatterns(buf)[0].parts[14];
    expect(ain.filterType).toBe(3);
    expect(ain.cutoff).toBe(45);
    expect(ain.resonance).toBe(55);
    expect(ain.egInt).toBe(65);
    expect(ain.egTime).toBe(75);
    expect(ain.modSpeed).toBe(85);
    expect(ain.modDepth).toBe(95);
  });

  it('keyboard part: custom filter values round-trip correctly', () => {
    const buf = generateMinimalESX();
    const off = ADDR.PATTERN_DATA + PATTERN_OFFSETS.KB1;
    buf.writeUInt8(42, off + 4);   // glide = 42
    buf.writeUInt8(2, off + 5);    // filterType = BPF
    buf.writeUInt8(111, off + 6);  // cutoff = 111
    buf.writeUInt8(22, off + 7);   // resonance = 22
    buf.writeUInt8(33, off + 8);   // egInt = 33
    buf.writeUInt8(44, off + 11);  // egTime = 44
    buf.writeUInt8(55, off + 12);  // startPoint = 55
    buf.writeUInt8(66, off + 15);  // modSpeed = 66
    buf.writeUInt8(77, off + 16);  // modDepth = 77

    const kb = parseEsxPatterns(buf)[0].parts[9];
    expect(kb.glide).toBe(42);
    expect(kb.filterType).toBe(2);
    expect(kb.cutoff).toBe(111);
    expect(kb.resonance).toBe(22);
    expect(kb.egInt).toBe(33);
    expect(kb.egTime).toBe(44);
    expect(kb.startPoint).toBe(55);
    expect(kb.modSpeed).toBe(66);
    expect(kb.modDepth).toBe(77);
  });
});

// ── rebuildEsxFile — pattern preservation ────────────────

describe('ESX rebuildEsxFile - Pattern preservation', () => {
  it('should preserve pattern data when rebuilding with samples', () => {
    // Create an original ESX with a named pattern and active steps
    const original = generateMinimalESX();
    const patOff = ADDR.PATTERN_DATA;

    // Write a custom pattern name
    original.fill(0x20, patOff, patOff + 8);
    original.write('MYBEAT', patOff, 'ascii');

    // Write tempo 120 BPM (120 * 128 = 15360)
    original.writeUInt16BE(Math.round(120 * 128), patOff + 8);

    // Set active drum steps on part 0 (four-on-the-floor)
    const drumOff = patOff + 24;
    original.writeUInt8(0x11, drumOff + 18 + 0); // steps 0,4
    original.writeUInt8(0x11, drumOff + 18 + 1); // steps 8,12

    // Rebuild with a single sample
    const samples = [{
      name: 'KICK',
      pcmData: Buffer.alloc(1000, 0x42),
      sampleRate: 44100,
      numFrames: 500,
    }];

    const rebuilt = rebuildEsxFile(original, samples);

    // Verify patterns are preserved
    const patterns = parseEsxPatterns(rebuilt);
    expect(patterns[0].name).toBe('MYBEAT');
    expect(patterns[0].tempo).toBe(120.0);

    // Verify drum steps are preserved
    const drum0 = patterns[0].parts[0];
    expect(drum0.steps[0]).toBe(true);
    expect(drum0.steps[4]).toBe(true);
    expect(drum0.steps[8]).toBe(true);
    expect(drum0.steps[12]).toBe(true);
    expect(drum0.steps[1]).toBe(false);
  });

  it('should write correct sample headers when rebuilding', () => {
    const original = generateMinimalESX();
    const samples = [{
      name: 'SNARE',
      pcmData: Buffer.alloc(2000, 0x33),
      sampleRate: 44100,
      numFrames: 1000,
    }];

    const rebuilt = rebuildEsxFile(original, samples);

    // Check mono sample count
    expect(rebuilt.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(1);

    // Check sample header name
    const hdrOff = ADDR.SAMPLE_HDR_MONO;
    const name = rebuilt.slice(hdrOff, hdrOff + 8).toString('ascii').trim();
    expect(name).toBe('SNARE');

    // Check sample rate
    expect(rebuilt.readUInt32BE(hdrOff + 28)).toBe(44100);

    // Check numFrames - 1 at end frame offset
    expect(rebuilt.readUInt32BE(hdrOff + 20)).toBe(999);
  });

  it('should preserve song data when rebuilding', () => {
    const original = generateMinimalESX();

    // Write some recognizable data into song area
    original.writeUInt8(0xAB, ADDR.SONG_DATA + 0);
    original.writeUInt8(0xCD, ADDR.SONG_DATA + 1);

    const rebuilt = rebuildEsxFile(original, [{
      name: 'TEST', pcmData: Buffer.alloc(100, 0x11),
      sampleRate: 44100, numFrames: 50,
    }]);

    // Song data should be preserved
    expect(rebuilt.readUInt8(ADDR.SONG_DATA + 0)).toBe(0xAB);
    expect(rebuilt.readUInt8(ADDR.SONG_DATA + 1)).toBe(0xCD);
  });
});
