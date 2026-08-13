/**
 * EMX-1 SmartCard slot mapping — rearranging, clearing and renaming patterns.
 *
 * Every test runs against all three real hardware cards in test-data/emx/.
 * Synthetic buffers would only prove the writer agrees with the writer's own
 * assumptions; these files came off actual devices.
 *
 * The hard limit this suite exists to enforce: outside the pattern area
 * (0x200 … 0x12C7FF) not one byte may change, and the file length stays at
 * exactly 1,736,704. That protects the 506 KB of song and global data whose
 * structure is not understood — and it runs without hardware.
 *
 * Spec: docs/superpowers/specs/2026-08-12-emx-slot-mapping-design.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  applySlotMapping,
  renamePattern,
  emptyPatternBlock,
  mappingIdentity,
  mappingMove,
  mappingSwap,
  mappingClear,
  verifySlotMapping,
  verifyRename,
  parseSmartCardDump,
} = require('../../src/emx-format');
const { generateMinimalEMX } = require('../fixtures/generators/minimal-emx');

const CARD_DIR = path.join(__dirname, '../../test-data/emx');
const CARDS = ['BEST.EMX', 'DA4TOFE.EMX', 'ZRITERLY.EMX'];
const FIXTURE = path.join(__dirname, '../fixtures/emx-empty-pattern.bin');

const BASE = 0x200;
const SIZE = 4806;
const COUNT = 256;
const AREA_END = 0x12C800;   // first byte after the pattern area
const CARD_SIZE = 1736704;

// ── Helpers ──────────────────────────────────────────────

/** The raw 4806-byte block sitting in `slot`. */
function blockAt(buf, slot) {
  return buf.slice(BASE + slot * SIZE, BASE + (slot + 1) * SIZE);
}

/** Indices of every byte that differs between two equal-length buffers. */
function diffOffsets(a, b) {
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** Slots whose block changed between two cards. */
function changedSlots(a, b) {
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    if (!blockAt(a, i).equals(blockAt(b, i))) out.push(i);
  }
  return out;
}

/**
 * The hard limit, asserted directly rather than through verifySlotMapping —
 * a bug in the production check must not be able to hide behind itself.
 */
function expectOutsideUntouched(original, result) {
  expect(result.length).toBe(CARD_SIZE);
  expect(result.slice(0, BASE).equals(original.slice(0, BASE))).toBe(true);
  expect(result.slice(AREA_END).equals(original.slice(AREA_END))).toBe(true);
}

/** Deterministic PRNG — the suite must not depend on a random source. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIdentity(seed) {
  const m = mappingIdentity();
  const rnd = mulberry32(seed);
  for (let i = m.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [m[i], m[j]] = [m[j], m[i]];
  }
  return m;
}

const cards = {};
beforeAll(() => {
  for (const name of CARDS) cards[name] = fs.readFileSync(path.join(CARD_DIR, name));
});

// ── The empty block ──────────────────────────────────────

describe('EMX slot mapping - empty pattern block', () => {
  it('is 4806 bytes with a blank name', () => {
    const blk = emptyPatternBlock();
    expect(blk.length).toBe(SIZE);
    expect(blk.slice(0, 8).toString('latin1')).toBe('        ');
  });

  it('matches the committed fixture byte for byte', () => {
    // src/emx-empty-pattern.js is a second copy of tests/fixtures/
    // emx-empty-pattern.bin, because electron-builder excludes tests/ from
    // the package. This test is what keeps the two from drifting apart.
    expect(emptyPatternBlock().equals(fs.readFileSync(FIXTURE))).toBe(true);
  });

  it('returns a fresh buffer each call, so callers cannot corrupt it', () => {
    const a = emptyPatternBlock();
    a.fill(0xFF);
    expect(emptyPatternBlock()[0]).toBe(0x20);
  });
});

// ── Mapping helpers (pure, no file involved) ─────────────

describe('EMX slot mapping - mapping helpers', () => {
  it('identity maps every slot to itself', () => {
    const m = mappingIdentity();
    expect(m).toHaveLength(COUNT);
    expect(m.every((src, dst) => src === dst)).toBe(true);
  });

  it('swap exchanges two slots and leaves the other 254 alone', () => {
    const m = mappingSwap(mappingIdentity(), 3, 200);
    expect(m[3]).toBe(200);
    expect(m[200]).toBe(3);
    const moved = m.map((src, dst) => (src === dst ? null : dst)).filter(x => x !== null);
    expect(moved).toEqual([3, 200]);
  });

  it('move shifts the patterns in between rather than overwriting one', () => {
    // Moving slot 5 to slot 2: 5 lands on 2, and 2,3,4 each shift up one.
    const m = mappingMove(mappingIdentity(), 5, 2);
    expect(m.slice(0, 8)).toEqual([0, 1, 5, 2, 3, 4, 6, 7]);
  });

  it('move downward shifts the other way', () => {
    const m = mappingMove(mappingIdentity(), 2, 5);
    expect(m.slice(0, 8)).toEqual([0, 1, 3, 4, 5, 2, 6, 7]);
  });

  it('move keeps the mapping a permutation - nothing lost, nothing doubled', () => {
    const m = mappingMove(mappingMove(mappingIdentity(), 200, 1), 7, 255);
    expect(new Set(m).size).toBe(COUNT);
    expect([...m].sort((a, b) => a - b)).toEqual(mappingIdentity());
  });

  it('clear marks the named slots empty and touches no others', () => {
    const m = mappingClear(mappingIdentity(), [0, 42, 255]);
    expect(m[0]).toBe(null);
    expect(m[42]).toBe(null);
    expect(m[255]).toBe(null);
    expect(m[1]).toBe(1);
    expect(m.filter(x => x === null)).toHaveLength(3);
  });

  it('leaves the input mapping untouched', () => {
    const original = mappingIdentity();
    mappingSwap(original, 1, 2);
    mappingMove(original, 1, 2);
    mappingClear(original, [1]);
    expect(original).toEqual(mappingIdentity());
  });
});

// ── The renderer's own copy of the move ──────────────────
//
// src/index.html cannot require() this module — it is one inline script with no
// loader — so emxMoveSlot repeats the splice, and the drag handler works out
// the destination index itself. Both are pinned here against mappingMove,
// because the code the user actually drives must not drift away from the code
// that is tested. If these fail, index.html changed and this file did not.

/** Verbatim from emxMoveSlot() in src/index.html. */
function rendererMove(mapping, from, to) {
  const next = mapping.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Verbatim from the drop handler in src/index.html. */
function rendererDropIndex(dragFrom, over, above) {
  let to = above ? over : over + 1;
  if (dragFrom < to) to--;
  return to;
}

/** Verbatim from emxSwapSelected() in src/index.html. */
function rendererSwap(mapping, a, b) {
  const next = mapping.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

describe('EMX slot mapping - the renderer repeats the move correctly', () => {
  it('the inline splice agrees with mappingMove everywhere', () => {
    for (const [from, to] of [[5, 2], [2, 5], [0, 255], [255, 0], [128, 129], [7, 7]]) {
      expect(rendererMove(mappingIdentity(), from, to))
        .toEqual(mappingMove(mappingIdentity(), from, to));
    }
  });

  it('dropping above a row lands on that row', () => {
    // Dragging slot 9 onto the upper half of row 3 puts it at 3.
    expect(rendererDropIndex(9, 3, true)).toBe(3);
    expect(rendererMove(mappingIdentity(), 9, 3).slice(2, 6)).toEqual([2, 9, 3, 4]);
  });

  it('dropping below a row lands after it, index shift included', () => {
    // Dragging slot 3 onto the lower half of row 9 must land after 9. Splicing
    // 3 out first shifts everything past it down, so the raw 10 becomes 9.
    expect(rendererDropIndex(3, 9, false)).toBe(9);
    const m = rendererMove(mappingIdentity(), 3, 9);
    expect(m[9]).toBe(3);
    expect(m[8]).toBe(9);
  });

  it('dropping a row onto itself is a no-op in both halves', () => {
    expect(rendererDropIndex(4, 4, true)).toBe(4);
    expect(rendererDropIndex(4, 4, false)).toBe(4);
  });

  it('the inline swap agrees with mappingSwap', () => {
    for (const [a, b] of [[0, 255], [3, 200], [128, 129], [7, 7]]) {
      expect(rendererSwap(mappingIdentity(), a, b))
        .toEqual(mappingSwap(mappingIdentity(), a, b));
    }
  });

  it('swapping stays a permutation, and swapping twice is a no-op', () => {
    const once = rendererSwap(mappingIdentity(), 12, 200);
    expect(new Set(once).size).toBe(COUNT);
    expect(rendererSwap(once, 12, 200)).toEqual(mappingIdentity());
  });

  it('swap moves exactly two slots, unlike a move which shifts a run', () => {
    const swapped = rendererSwap(mappingIdentity(), 5, 9);
    const moved = mappingMove(mappingIdentity(), 5, 9);
    expect(swapped.filter((src, dst) => src !== dst)).toHaveLength(2);
    expect(moved.filter((src, dst) => src !== dst).length).toBeGreaterThan(2);
  });

  it('never produces an index outside 0…255', () => {
    for (let from = 0; from < COUNT; from++) {
      for (const over of [0, 1, 127, 254, 255]) {
        for (const above of [true, false]) {
          const to = rendererDropIndex(from, over, above);
          expect(to).toBeGreaterThanOrEqual(0);
          expect(to).toBeLessThan(COUNT);
        }
      }
    }
  });
});

// ── Per-card behaviour ───────────────────────────────────

describe.each(CARDS)('EMX slot mapping - %s', (cardName) => {
  let card;
  beforeAll(() => { card = cards[cardName]; });

  it('identity mapping reproduces the card byte for byte', () => {
    const out = applySlotMapping(card, mappingIdentity());
    expect(out.length).toBe(CARD_SIZE);
    expect(out.equals(card)).toBe(true);
  });

  it('swapping two slots changes exactly those two blocks', () => {
    const out = applySlotMapping(card, mappingSwap(mappingIdentity(), 4, 137));
    expect(changedSlots(card, out)).toEqual([4, 137]);
    expect(blockAt(out, 4).equals(blockAt(card, 137))).toBe(true);
    expect(blockAt(out, 137).equals(blockAt(card, 4))).toBe(true);
    expectOutsideUntouched(card, out);
  });

  it('swapping a slot with itself is a no-op', () => {
    const out = applySlotMapping(card, mappingSwap(mappingIdentity(), 9, 9));
    expect(out.equals(card)).toBe(true);
  });

  it('moving a pattern shifts the ones in between and loses none', () => {
    const m = mappingMove(mappingIdentity(), 10, 3);
    const out = applySlotMapping(card, m);

    // Every destination holds the block its mapping names.
    for (let dst = 0; dst < COUNT; dst++) {
      expect(blockAt(out, dst).equals(blockAt(card, m[dst]))).toBe(true);
    }
    // No block vanished and none appeared twice.
    const before = new Set();
    const after = new Set();
    for (let i = 0; i < COUNT; i++) {
      before.add(blockAt(card, i).toString('base64'));
      after.add(blockAt(out, i).toString('base64'));
    }
    expect(after).toEqual(before);
    expectOutsideUntouched(card, out);
  });

  it('clearing a slot writes the empty block and nothing else', () => {
    const out = applySlotMapping(card, mappingClear(mappingIdentity(), [77]));
    expect(blockAt(out, 77).equals(emptyPatternBlock())).toBe(true);
    expect(changedSlots(card, out)).toEqual([77]);
    expectOutsideUntouched(card, out);
  });

  it('reads back in the order the mapping describes', () => {
    const m = mappingSwap(mappingMove(mappingIdentity(), 0, 99), 12, 240);
    const out = applySlotMapping(card, m);

    const before = parseSmartCardDump(card).patterns;
    const after = parseSmartCardDump(out).patterns;
    expect(after).toHaveLength(COUNT);
    for (let dst = 0; dst < COUNT; dst++) {
      expect(after[dst].header).toEqual(before[m[dst]].header);
    }
  });

  it('holds the invariant across 5 fixed-seed permutations of all 256 slots', () => {
    for (const seed of [1, 7, 1337, 20260812, 0x5EED]) {
      const m = shuffledIdentity(seed);
      const out = applySlotMapping(card, m);
      expectOutsideUntouched(card, out);
      for (let dst = 0; dst < COUNT; dst++) {
        expect(blockAt(out, dst).equals(blockAt(card, m[dst]))).toBe(true);
      }
      expect(verifySlotMapping(card, out, m).ok).toBe(true);
    }
  });

  it('renames a pattern by changing eight bytes in the name field only', () => {
    const slot = 5;
    const out = renamePattern(card, slot, 'ZZZZZZZZ');
    const offsets = diffOffsets(card, out);
    const nameBase = BASE + slot * SIZE;

    // 'ZZZZZZZZ' cannot collide with the original in any position unless the
    // original already reads ZZZZZZZZ — none of the three cards does.
    expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => nameBase + i));
    expect(out.slice(nameBase, nameBase + 8).toString('latin1')).toBe('ZZZZZZZZ');
    expectOutsideUntouched(card, out);
  });

  it('pads a short name with spaces and never with NULs', () => {
    const out = renamePattern(card, 200, 'AB');
    const at = BASE + 200 * SIZE;
    expect(out.slice(at, at + 8).toString('latin1')).toBe('AB      ');
  });

  it('renaming touches no other slot', () => {
    const out = renamePattern(card, 100, 'RENAMED');
    expect(changedSlots(card, out)).toEqual([100]);
  });
});

// ── Refusals ─────────────────────────────────────────────

describe('EMX slot mapping - refuses rather than guessing', () => {
  it('rejects a SysEx dump instead of writing at SmartCard offsets', () => {
    const sysex = generateMinimalEMX();
    expect(() => applySlotMapping(sysex, mappingIdentity())).toThrow(/SmartCard/i);
    expect(() => renamePattern(sysex, 0, 'NOPE')).toThrow(/SmartCard/i);
  });

  it('rejects a mapping of the wrong length', () => {
    const card = cards['BEST.EMX'];
    expect(() => applySlotMapping(card, mappingIdentity().slice(0, 255))).toThrow(/256/);
  });

  it('rejects a source slot outside 0..255', () => {
    const card = cards['BEST.EMX'];
    const m = mappingIdentity();
    m[0] = 256;
    expect(() => applySlotMapping(card, m)).toThrow(/slot/i);
  });

  it('rejects non-printable characters in a name instead of substituting', () => {
    const card = cards['BEST.EMX'];
    expect(() => renamePattern(card, 0, 'BAD\u0000X')).toThrow(/printable/i);
    expect(() => renamePattern(card, 0, 'DEL\u007F')).toThrow(/printable/i);
    expect(() => renamePattern(card, 0, 'CAFÉ')).toThrow(/printable/i);
    expect(() => renamePattern(card, 0, 'TAB\there')).toThrow(/printable/i);
  });

  it('allows a space inside a name - 0x20 is printable', () => {
    // The hardware pads names with 0x20 itself and a space is reachable on
    // the device. Rejecting it would be stricter than the hardware, not safer.
    const card = cards['BEST.EMX'];
    const out = renamePattern(card, 0, 'MY BEAT');
    expect(out.slice(BASE, BASE + 8).toString('latin1')).toBe('MY BEAT ');
  });

  it('rejects a name longer than eight characters instead of truncating', () => {
    const card = cards['BEST.EMX'];
    expect(() => renamePattern(card, 0, 'NINECHARS')).toThrow(/eight|8/i);
  });

  it('rejects a slot number outside 0..255', () => {
    const card = cards['BEST.EMX'];
    expect(() => renamePattern(card, 256, 'X')).toThrow(/slot/i);
    expect(() => renamePattern(card, -1, 'X')).toThrow(/slot/i);
  });
});

// ── The invariant check itself ───────────────────────────

describe('EMX slot mapping - verifySlotMapping', () => {
  it('passes a buffer that applySlotMapping produced', () => {
    const card = cards['BEST.EMX'];
    const m = mappingSwap(mappingIdentity(), 1, 2);
    expect(verifySlotMapping(card, applySlotMapping(card, m), m)).toEqual({ ok: true, errors: [] });
  });

  it('catches a byte changed outside the pattern area', () => {
    const card = cards['BEST.EMX'];
    const m = mappingIdentity();
    const tampered = applySlotMapping(card, m);
    tampered[AREA_END + 10] ^= 0xFF;

    const res = verifySlotMapping(card, tampered, m);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/outside/i);
  });

  it('catches a byte changed in the header', () => {
    const card = cards['BEST.EMX'];
    const m = mappingIdentity();
    const tampered = applySlotMapping(card, m);
    tampered[0x100] ^= 0xFF;

    expect(verifySlotMapping(card, tampered, m).ok).toBe(false);
  });

  it('catches a wrong length', () => {
    const card = cards['BEST.EMX'];
    const m = mappingIdentity();
    const short = applySlotMapping(card, m).slice(0, CARD_SIZE - 1);

    const res = verifySlotMapping(card, short, m);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/length/i);
  });

  it('catches a slot holding the wrong pattern', () => {
    const card = cards['BEST.EMX'];
    const m = mappingIdentity();
    // Claim we swapped, but hand over an untouched card.
    const claimed = mappingSwap(m, 3, 4);

    const res = verifySlotMapping(card, applySlotMapping(card, m), claimed);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/slot 3|slot 4/i);
  });

  it('accepts a cleared slot holding the empty block', () => {
    const card = cards['BEST.EMX'];
    const m = mappingClear(mappingIdentity(), [8]);
    expect(verifySlotMapping(card, applySlotMapping(card, m), m).ok).toBe(true);
  });

  it('rejects a cleared slot that kept its old pattern', () => {
    const card = cards['BEST.EMX'];
    const m = mappingClear(mappingIdentity(), [8]);
    expect(verifySlotMapping(card, card, m).ok).toBe(false);
  });

  it('rejects a malformed mapping outright instead of failing by accident', () => {
    const card = cards['BEST.EMX'];
    const res = verifySlotMapping(card, Buffer.from(card), [0, 1, 2]);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/256 entries/);
    // One clear reason, not 256 slot mismatches produced by NaN offsets.
    expect(res.errors).toHaveLength(1);
  });
});

// ── The rename's own limit ───────────────────────────────
//
// A rename replaces the buffer that verifySlotMapping later measures against.
// If it ever wrote outside its eight bytes, that check would compare a damaged
// buffer with itself and see nothing. verifyRename is what keeps the chain back
// to the file as loaded unbroken.

describe('EMX slot mapping - verifyRename', () => {
  it.each(CARDS)('passes a real rename on %s', (cardName) => {
    const card = cards[cardName];
    const renamed = renamePattern(card, 42, 'LIVE SET');
    expect(verifyRename(card, renamed, 42)).toEqual({ ok: true, errors: [] });
  });

  it('passes when the name is unchanged', () => {
    const card = cards['BEST.EMX'];
    const before = card.slice(BASE + 7 * SIZE, BASE + 7 * SIZE + 8).toString('latin1');
    expect(verifyRename(card, renamePattern(card, 7, before), 7).ok).toBe(true);
  });

  it('catches a byte changed past the name field, in the same slot', () => {
    const card = cards['BEST.EMX'];
    const tampered = renamePattern(card, 42, 'LIVE SET');
    tampered[BASE + 42 * SIZE + 8] ^= 0xFF;   // first byte after the name

    const res = verifyRename(card, tampered, 42);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/after/i);
  });

  it('catches a byte changed in the song area', () => {
    const card = cards['BEST.EMX'];
    const tampered = renamePattern(card, 42, 'LIVE SET');
    tampered[AREA_END + 100] ^= 0xFF;
    expect(verifyRename(card, tampered, 42).ok).toBe(false);
  });

  it('catches a byte changed in the header', () => {
    const card = cards['BEST.EMX'];
    const tampered = renamePattern(card, 42, 'LIVE SET');
    tampered[0x40] ^= 0xFF;

    const res = verifyRename(card, tampered, 42);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/before/i);
  });

  it('catches a rename attributed to the wrong slot', () => {
    const card = cards['BEST.EMX'];
    const renamed = renamePattern(card, 42, 'LIVE SET');
    expect(verifyRename(card, renamed, 43).ok).toBe(false);
  });

  it('catches a wrong length', () => {
    const card = cards['BEST.EMX'];
    const short = renamePattern(card, 42, 'LIVE SET').slice(0, CARD_SIZE - 1);

    const res = verifyRename(card, short, 42);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/length/i);
  });

  it('rejects a slot outside 0…255 rather than reading past the card', () => {
    const card = cards['BEST.EMX'];
    expect(verifyRename(card, Buffer.from(card), 256).ok).toBe(false);
    expect(verifyRename(card, Buffer.from(card), -1).ok).toBe(false);
  });
});
