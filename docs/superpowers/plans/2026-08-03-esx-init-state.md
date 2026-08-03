# ESX-1 Init-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neu gebaute `.esx`-Files sollen im Pattern-, Song- und Global-Bereich byte-genau dem entsprechen, was die ESX-1-Hardware selbst als Leerzustand schreibt — statt der bisherigen Korg-Manager-Erfindung `A.001…D.064` plus 27 Auto-Demo-Patterns.

**Architecture:** Alle Änderungen an `src/esx-format.js` sind Byte-Korrekturen an drei bestehenden Init-Funktionen plus das Entfernen eines Blocks aus `buildEsxFile()`. Verifiziert wird gegen zwei eingecheckte Binär-Fixtures, die aus einem echten Factory-File extrahiert werden. Zwei UI-Änderungen an `src/index.html` (Pattern-Liste, Export-Guard) haben keine Testabdeckung — dafür stehen exakte manuelle Prüfschritte im Plan.

**Tech Stack:** Node.js, Vitest, Electron 28. Kein Bundler, kein UI-Framework.

**Spec:** `docs/superpowers/specs/2026-08-03-esx-init-state-design.md` (Commit `4564061`)

## Global Constraints

- Branch: `feat/unified-sample-manager`. Nicht auf `main` committen.
- `npm test` muss nach **jeder** Task grün sein (240+ Tests).
- `src/index.html` ist reiner Inline-Code ohne Modul-Loading; `vitest.config.js` nutzt `environment: 'node'` ohne jsdom und schließt `src/index.html` aus der Coverage aus. Renderer-Code ist in diesem Repo **nicht** unit-testbar — Tasks 4 und 5 werden manuell verifiziert. Kein jsdom einführen, kein Refactoring von `index.html` zu Modulen.
- Einmal-Skripte liegen im Repo-Root (bestehende Beispiele: `analyze-esx.js`, `compare-fixes.js`, `esx-pattern-diff.js`).
- Byte-Werte niemals raten. Jede Änderung an einem Byte muss durch eine Fixture-Assertion abgesichert sein.
- Commit-Messages auf Englisch, Konvention des Repos: `fix(esx): …`, `test(esx): …`, `feat(ui): …`.

## Domain-Kontext (der Umsetzer kennt die ESX-1 nicht)

Eine `.esx`-Datei enthält ab Offset `0x200` genau **256 Patterns à 4280 Bytes**, ab `0x130000` **64 Songs à 528 Bytes**, ab `0x20` **192 Bytes Global-Parameter**. Ein Pattern besteht aus einem 24-Byte-Header (Byte 0-7 = Name in ASCII, space-gepaddet) und danach den Parts:

| Offset im Pattern | Part | Größe |
|---|---|---|
| 24 | Drum 1–9 (je 34 B) | 306 |
| 330 | Keyboard 1 | 274 |
| 604 | Keyboard 2 | 274 |
| 878 | Stretch 1 | 32 |
| 910 | Stretch 2 | 32 |
| 942 | Slice | 32 |
| 974 | Audio In | 156 |
| 1130 | Accent | 18 |
| 1148 | FX-Params | 12 |
| 1160 | Motion-Sequences | 3120 |

Drum-Part: Byte +0..1 = Sample-Nummer (uint16BE), +18..33 = 16 Byte bit-gepackte Steps.
Keyboard-Part: +0..1 = Sample-Nummer, +2 = Slice-Byte, +18..145 = Note-Bytes, +146..273 = Gate-Bytes.
Stretch/Slice-Part: +0..1 = Sample-Nummer, +16..31 = 16 Byte Steps.
Audio-In-Part hat **keine** Sample-Nummer.

Diese Offsets stehen als `PATTERN_OFFSETS` in `src/esx-format.js:65-77` und sind bereits korrekt — nicht ändern.

---

### Task 1: Fixtures extrahieren und Init-Pattern byte-exakt machen

**Files:**
- Create: `extract-init-fixtures.js` (Repo-Root, Einmal-Skript)
- Create: `tests/fixtures/esx-init-pattern.bin` (4280 B)
- Create: `tests/fixtures/esx-empty-song.bin` (528 B)
- Create: `tests/parsers/esx-init-state.test.js`
- Modify: `src/esx-format.js:427-432` (`initDefaultPattern` — Name)
- Modify: `src/esx-format.js:306` (`initKeyboardPart` — Slice-Byte)
- Modify: `tests/parsers/esx.test.js:167-175`
- Modify: `tests/parsers/esx-patterns.test.js:78-80`
- Modify: `tests/parsers/esx-patterns.test.js:117-123`

**Interfaces:**
- Consumes: nichts (erste Task)
- Produces: `tests/fixtures/esx-init-pattern.bin` und `tests/fixtures/esx-empty-song.bin` — Task 2 liest die Song-Fixture, Task 3 liest die Pattern-Fixture.

- [ ] **Step 1: Extraktions-Skript schreiben**

Das Skript lädt ein echtes Factory-File aus dem Netz, sucht den häufigsten `Init`-Pattern-Block, neutralisiert die Werks-Sample-Referenzen, und **prüft sich selbst**: die verbleibende Abweichung zu `createEmptyEsx()` muss exakt die 7 bekannten Offsets sein. Weicht sie ab, bricht das Skript ab, statt eine falsche Fixture zu schreiben.

Create `extract-init-fixtures.js`:

```js
/**
 * One-off: extract the ESX-1's canonical empty pattern and empty song from a
 * real factory file and write them as test fixtures.
 *
 * Run:  node extract-init-fixtures.js
 *
 * The factory file is downloaded, never committed. The two .bin files it
 * produces ARE committed, so the test suite needs no network access.
 *
 * Ground truth: 104 of the 105 patterns named "Init" in this file are
 * byte-identical, and the same block appears 98 times in an independent
 * hardware dump. The canonical block references factory sample numbers
 * (21, 54, 55, 130, 138, 165, 183) and runs a four-on-the-floor on drum
 * part 1 — both are meaningless in a user's own bank, so both are zeroed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esx = require('./src/esx-format.js');

const URL = 'https://projects.skratchdot.com/esx-files/esx/ESX-Factory-Data.esx';
const WORK = path.join(__dirname, 'ESX-Factory-Data.esx');
const OUT = path.join(__dirname, 'tests', 'fixtures');

const PAT_BASE = 0x200, PAT_SIZE = 4280, PAT_COUNT = 256;
const SONG_BASE = 0x130000, SONG_SIZE = 528, SONG_COUNT = 64;

function download() {
  if (fs.existsSync(WORK)) {
    console.log('using cached', WORK);
    return;
  }
  console.log('downloading', URL);
  execFileSync('curl', ['-sSL', '-o', WORK, URL], { stdio: 'inherit' });
}

/** Return the byte block that occurs most often in `blocks`. */
function modal(blocks) {
  const counts = new Map();
  for (const b of blocks) {
    const k = b.toString('base64');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const [k, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { block: Buffer.from(k, 'base64'), count: n, total: blocks.length };
}

/** Zero every sample pointer and every step field in a 4280-byte pattern. */
function neutralize(pattern) {
  const p = Buffer.from(pattern);
  // 9 drum parts: sample pointer at +0 (uint16BE), 16 step bytes at +18
  for (let d = 0; d < 9; d++) {
    const o = 24 + d * 34;
    p.writeUInt16BE(0, o);
    p.fill(0x00, o + 18, o + 34);
  }
  // Keyboard 1 + 2: sample pointer only. Note bytes (0xBC) and gate bytes
  // (0x02) are the empty state already — do NOT touch them.
  p.writeUInt16BE(0, 330);
  p.writeUInt16BE(0, 604);
  // Stretch 1, Stretch 2, Slice: sample pointer at +0, 16 step bytes at +16
  for (const o of [878, 910, 942]) {
    p.writeUInt16BE(0, o);
    p.fill(0x00, o + 16, o + 32);
  }
  // Audio In has no sample pointer.
  return p;
}

function diffOffsets(a, b) {
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

function main() {
  download();
  const buf = fs.readFileSync(WORK);
  const empty = esx.createEmptyEsx();

  // ── Pattern ────────────────────────────────────────────
  const inits = [];
  for (let i = 0; i < PAT_COUNT; i++) {
    const o = PAT_BASE + i * PAT_SIZE;
    if (buf.toString('ascii', o, o + 8).trim() === 'Init') {
      inits.push(buf.slice(o, o + PAT_SIZE));
    }
  }
  if (inits.length < 50) throw new Error(`only ${inits.length} Init patterns found — wrong file?`);
  const pat = modal(inits);
  console.log(`Init patterns: ${pat.total}, canonical block occurs ${pat.count}x`);
  if (pat.count < pat.total * 0.9) throw new Error('no clear canonical Init block');

  const fixture = neutralize(pat.block);
  const ours = empty.slice(PAT_BASE, PAT_BASE + PAT_SIZE);
  const patDiff = diffOffsets(fixture, ours);
  const EXPECTED = [0, 1, 2, 3, 4, 332, 606];
  console.log('pattern deltas vs createEmptyEsx():', patDiff.join(','));
  if (patDiff.join(',') !== EXPECTED.join(',')) {
    throw new Error(`unexpected pattern deltas — expected ${EXPECTED.join(',')}, got ${patDiff.join(',')}`);
  }

  // ── Song ───────────────────────────────────────────────
  const blanks = [];
  for (let i = 0; i < SONG_COUNT; i++) {
    const o = SONG_BASE + i * SONG_SIZE;
    const name = buf.slice(o, o + 8);
    if (name.every(b => b === 0x20)) blanks.push(buf.slice(o, o + SONG_SIZE));
  }
  if (blanks.length < 10) throw new Error(`only ${blanks.length} blank songs found`);
  const song = modal(blanks);
  console.log(`blank songs: ${song.total}, canonical block occurs ${song.count}x`);
  if (song.count !== song.total) throw new Error('blank songs are not all identical');

  const ourSong = empty.slice(SONG_BASE, SONG_BASE + SONG_SIZE);
  const songDiff = diffOffsets(song.block, ourSong);
  console.log('song deltas vs createEmptyEsx():', songDiff.join(','));
  if (songDiff.join(',') !== '0,1,2,3,4,5,6,7') {
    throw new Error(`unexpected song deltas: ${songDiff.join(',')}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'esx-init-pattern.bin'), fixture);
  fs.writeFileSync(path.join(OUT, 'esx-empty-song.bin'), song.block);
  console.log('wrote tests/fixtures/esx-init-pattern.bin (4280 B)');
  console.log('wrote tests/fixtures/esx-empty-song.bin (528 B)');
}

main();
```

- [ ] **Step 2: Skript ausführen**

Run: `node extract-init-fixtures.js`

Expected output (die Delta-Zeilen müssen exakt so lauten):
```
Init patterns: 105, canonical block occurs 104x
pattern deltas vs createEmptyEsx(): 0,1,2,3,4,332,606
blank songs: 60, canonical block occurs 60x
song deltas vs createEmptyEsx(): 0,1,2,3,4,5,6,7
wrote tests/fixtures/esx-init-pattern.bin (4280 B)
wrote tests/fixtures/esx-empty-song.bin (528 B)
```

Bricht das Skript mit `unexpected pattern deltas` ab: **nicht** die Erwartungswerte anpassen. Das heißt, `createEmptyEsx()` weicht an einer weiteren Stelle ab, die im Spec nicht erfasst ist — dann anhalten und die neue Abweichung melden.

Danach das heruntergeladene File löschen, es gehört nicht ins Repo:

```bash
rm ESX-Factory-Data.esx
```

- [ ] **Step 3: Failing test schreiben**

Create `tests/parsers/esx-init-state.test.js`:

```js
/**
 * The empty state of a newly built .esx must be byte-identical to what the
 * ESX-1 hardware itself writes. Fixtures were extracted from a real factory
 * file by extract-init-fixtures.js — see that script for provenance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createEmptyEsx, ADDR, NUM } = require('../../src/esx-format.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const INIT_PATTERN = fs.readFileSync(path.join(FIXTURES, 'esx-init-pattern.bin'));

describe('ESX init state - pattern', () => {
  let buf;

  beforeAll(() => {
    buf = createEmptyEsx();
  });

  it('fixture is one pattern block', () => {
    expect(INIT_PATTERN).toHaveLength(4280);
  });

  it('every one of the 256 patterns matches the hardware init block', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const block = buf.slice(off, off + 4280);
      const firstDiff = block.findIndex((b, i) => b !== INIT_PATTERN[i]);
      expect(
        firstDiff,
        `pattern ${p} differs at byte +${firstDiff}: got 0x${block[firstDiff]?.toString(16)}, want 0x${INIT_PATTERN[firstDiff]?.toString(16)}`
      ).toBe(-1);
    }
  });

  it('names every pattern "Init"', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      expect(buf.toString('ascii', off, off + 8)).toBe('Init    ');
    }
  });

  it('writes 0x00 in both keyboard slice bytes', () => {
    const off = ADDR.PATTERN_DATA;
    expect(buf[off + 332]).toBe(0x00); // KB1 +2
    expect(buf[off + 606]).toBe(0x00); // KB2 +2
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`

Expected: FAIL. `pattern 0 differs at byte +0: got 0x41, want 0x49` (`0x41` = `A` aus `A.001`, `0x49` = `I` aus `Init`).

- [ ] **Step 5: Pattern-Name korrigieren**

In `src/esx-format.js`, `initDefaultPattern` (Zeile 427-432) ersetzen:

```js
function initDefaultPattern(buffer, patternOffset, patternIndex) {
  // +0-7: name = bank naming "A.001" .. "D.064" (space-padded, factory default)
  const bank = String.fromCharCode(65 + Math.floor(patternIndex / 64));
  const num = String((patternIndex % 64) + 1).padStart(3, '0');
  const name = `${bank}.${num}`.padEnd(8, ' ');
  buffer.write(name, patternOffset, 'ascii');
```

durch:

```js
function initDefaultPattern(buffer, patternOffset) {
  // +0-7: name = "Init" — what the hardware itself writes for an empty pattern.
  // 104 of the 105 "Init" patterns in a real factory file are byte-identical,
  // and the same block appears 98x in an independent hardware dump. The bank
  // notation "A.001".."D.064" this used to write is a Korg Manager invention;
  // the device shows the bank position from the slot, not from the name.
  buffer.write('Init    ', patternOffset, 'ascii');
```

Und den Aufrufer in `createEmptyEsx` (Zeile 601) von

```js
    initDefaultPattern(buffer, patternOffset, p);
```

auf

```js
    initDefaultPattern(buffer, patternOffset);
```

- [ ] **Step 6: Keyboard-Slice-Byte korrigieren**

In `src/esx-format.js`, `initKeyboardPart` (Zeile 306) ersetzen:

```js
  buffer.writeUInt8(0xFF, offset + 2);       // slice = 0xFF (no slice — plays whole sample)
```

durch:

```js
  buffer.writeUInt8(0x00, offset + 2);       // slice — 958 of 1024 keyboard parts in
                                             // two real files hold 0x00 here; 0xFF
                                             // appears only 14 times and is not the
                                             // hardware's empty state
```

- [ ] **Step 7: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`
Expected: PASS, 4 Tests.

- [ ] **Step 8: Vollständige Suite laufen lassen**

Run: `npm test`

Expected: **3 Fehlschläge**, alle wegen der alten Bank-Benennung:
- `tests/parsers/esx.test.js` — „should have 256 patterns with bank names A.001-D.064"
- `tests/parsers/esx-patterns.test.js` — „should parse default pattern name as \"A.001\""
- `tests/parsers/esx-patterns.test.js` — „should have all patterns with bank names A.001-D.064"

Andere Fehlschläge sind ein Signal, dass etwas übersehen wurde — dann anhalten und melden.

- [ ] **Step 9: Die 3 Alt-Tests umstellen**

In `tests/parsers/esx.test.js` den Block bei Zeile 167-175 ersetzen:

```js
  it('should have 256 patterns with bank names A.001-D.064', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const name = buf.toString('ascii', off, off + 8).trim();
      const bank = String.fromCharCode(65 + Math.floor(p / 64));
      const num = String((p % 64) + 1).padStart(3, '0');
      expect(name).toBe(`${bank}.${num}`);
    }
  });
```

durch:

```js
  it('should name all 256 patterns "Init" like the hardware does', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      expect(buf.toString('ascii', off, off + 8)).toBe('Init    ');
    }
  });
```

In `tests/parsers/esx-patterns.test.js` bei Zeile 78-80 ersetzen:

```js
  it('should parse default pattern name as "A.001"', () => {
    expect(pattern.name).toBe('A.001');
  });
```

durch:

```js
  it('should parse default pattern name as "Init"', () => {
    expect(pattern.name).toBe('Init');
  });
```

Und bei Zeile 117-123 ersetzen:

```js
  it('should have all patterns with bank names A.001-D.064', () => {
    patterns.forEach((p, i) => {
      const bank = String.fromCharCode(65 + Math.floor(i / 64));
      const num = String((i % 64) + 1).padStart(3, '0');
      expect(p.name).toBe(`${bank}.${num}`);
    });
  });
```

durch:

```js
  it('should have all patterns named "Init"', () => {
    patterns.forEach((p) => {
      expect(p.name).toBe('Init');
    });
  });
```

(`parseEsxPattern` trimmt den Namen — deshalb `'Init'` ohne Padding, anders als beim Roh-Byte-Vergleich.)

- [ ] **Step 10: Volle Suite grün**

Run: `npm test`
Expected: PASS, keine Fehlschläge.

- [ ] **Step 11: Commit**

```bash
git add extract-init-fixtures.js tests/fixtures/esx-init-pattern.bin tests/fixtures/esx-empty-song.bin tests/parsers/esx-init-state.test.js src/esx-format.js tests/parsers/esx.test.js tests/parsers/esx-patterns.test.js
git commit -m "fix(esx): name empty patterns Init and match hardware keyboard slice byte

The bank notation A.001..D.064 was a Korg Manager invention; the ESX-1
names empty patterns Init and shows the bank position from the slot.
Verified against a factory file (104 of 105 Init patterns byte-identical)
and an independent hardware dump (same block 98x).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Leeren Song byte-exakt machen

**Files:**
- Modify: `src/esx-format.js:497-501` (`initDefaultSong`)
- Modify: `tests/parsers/esx-init-state.test.js` (Song-Block ergänzen)

**Interfaces:**
- Consumes: `tests/fixtures/esx-empty-song.bin` aus Task 1
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Failing test schreiben**

An `tests/parsers/esx-init-state.test.js` anhängen (nach dem bestehenden `describe`):

```js
const EMPTY_SONG = fs.readFileSync(path.join(FIXTURES, 'esx-empty-song.bin'));

describe('ESX init state - song', () => {
  let buf;

  beforeAll(() => {
    buf = createEmptyEsx();
  });

  it('fixture is one song block', () => {
    expect(EMPTY_SONG).toHaveLength(528);
  });

  it('every one of the 64 songs matches the hardware empty song', () => {
    for (let s = 0; s < NUM.SONGS; s++) {
      const off = ADDR.SONG_DATA + s * 528;
      const block = buf.slice(off, off + 528);
      const firstDiff = block.findIndex((b, i) => b !== EMPTY_SONG[i]);
      expect(
        firstDiff,
        `song ${s} differs at byte +${firstDiff}: got 0x${block[firstDiff]?.toString(16)}, want 0x${EMPTY_SONG[firstDiff]?.toString(16)}`
      ).toBe(-1);
    }
  });

  it('pads song names with spaces, not NULs', () => {
    const off = ADDR.SONG_DATA;
    expect(buf.toString('ascii', off, off + 8)).toBe('        ');
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`
Expected: FAIL. `song 0 differs at byte +0: got 0x0, want 0x20`

- [ ] **Step 3: Song-Namen korrigieren**

In `src/esx-format.js`, `initDefaultSong` (Zeile 498-501) ersetzen:

```js
  // +0-7: name = 8x 0x00 (empty)
  for (let i = 0; i < 8; i++) {
    buffer.writeUInt8(0x00, songOffset + i);
  }
```

durch:

```js
  // +0-7: name = 8x 0x20. All 60 unused songs in a real factory file are
  // byte-identical and space-padded here, not NUL-padded.
  buffer.fill(0x20, songOffset, songOffset + 8);
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`
Expected: PASS, 7 Tests (4 aus Task 1 + 3 neue).

- [ ] **Step 5: Volle Suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/esx-format.js tests/parsers/esx-init-state.test.js
git commit -m "fix(esx): space-pad empty song names to match hardware

All 60 unused songs in a real factory file are byte-identical with
0x20 padding; we were writing NULs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Auto-Demo-Patterns aus `buildEsxFile()` entfernen

Das ist die Änderung, die den ursprünglichen Datenverlust betrifft: `buildEsxFile()` schrieb bisher `ceil(n/9)` Patterns mit Namen, Sample-Zuweisungen und einem Four-on-the-floor. Bei 241 Samples waren das 27 Wegwerf-Patterns.

**Files:**
- Modify: `src/esx-format.js:806-829` (Block in `buildEsxFile` entfernen)
- Modify: `tests/parsers/esx-patterns.test.js:451-473` (zwei Tests umstellen)
- Modify: `tests/parsers/esx-init-state.test.js` (zwei neue describe-Blöcke)

**Interfaces:**
- Consumes: `tests/fixtures/esx-init-pattern.bin` aus Task 1
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Failing test schreiben**

An `tests/parsers/esx-init-state.test.js` anhängen. Der Import oben muss dafür erweitert werden — Zeile

```js
const { createEmptyEsx, ADDR, NUM } = require('../../src/esx-format.js');
```

ersetzen durch:

```js
const { createEmptyEsx, buildEsxFile, rebuildEsxFile, parseEsxFile, ADDR, NUM } = require('../../src/esx-format.js');
```

Dann anhängen:

```js
/** 12 tiny mono samples, enough to have triggered 2 auto-demo patterns before. */
function tinySamples(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pcmData = Buffer.alloc(200);
    for (let f = 0; f < 100; f++) pcmData.writeInt16BE(f * 10, f * 2);
    out.push({
      name: `SMP${String(i).padStart(3, '0')}`,
      pcmData,
      sampleRate: 44100,
      numFrames: 100,
    });
  }
  return out;
}

describe('ESX init state - buildEsxFile leaves patterns alone', () => {
  let built;

  beforeAll(() => {
    built = buildEsxFile(tinySamples(12));
  });

  it('writes no demo patterns — all 256 stay at the hardware init block', () => {
    for (let p = 0; p < NUM.PATTERNS; p++) {
      const off = ADDR.PATTERN_DATA + p * 4280;
      const block = built.slice(off, off + 4280);
      const firstDiff = block.findIndex((b, i) => b !== INIT_PATTERN[i]);
      expect(
        firstDiff,
        `pattern ${p} differs at byte +${firstDiff}`
      ).toBe(-1);
    }
  });

  it('assigns no samples to drum parts', () => {
    const off = ADDR.PATTERN_DATA;
    for (let d = 0; d < 9; d++) {
      expect(built.readUInt16BE(off + 24 + d * 34)).toBe(0);
    }
  });

  it('still writes the sample data itself', () => {
    expect(built.readUInt32BE(ADDR.NUM_MONO_SAMPLES)).toBe(12);
  });
});

describe('ESX init state - rebuildEsxFile preserves everything', () => {
  it('changes no pattern, song or global byte', () => {
    const original = buildEsxFile(tinySamples(12));
    const parsed = parseEsxFile(original);
    const rebuilt = rebuildEsxFile(original, parsed.monoSamples);

    const patternBytes = 256 * 4280;
    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.PATTERN_DATA, ADDR.PATTERN_DATA + patternBytes),
        original.slice(ADDR.PATTERN_DATA, ADDR.PATTERN_DATA + patternBytes)
      )
    ).toBe(0);

    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.SONG_DATA, ADDR.SONG_DATA + 64 * 528),
        original.slice(ADDR.SONG_DATA, ADDR.SONG_DATA + 64 * 528)
      )
    ).toBe(0);

    expect(
      Buffer.compare(
        rebuilt.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + 192),
        original.slice(ADDR.GLOBAL_PARAMS, ADDR.GLOBAL_PARAMS + 192)
      )
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`

Expected: FAIL in „writes no demo patterns" (Pattern 0 weicht bei Byte +42 ab — dort steht `0x11` statt `0x00`) und in „assigns no samples to drum parts".

Der `rebuildEsxFile`-Test sollte bereits **passieren** — er ist ein Regressions-Netz, kein neues Verhalten.

- [ ] **Step 3: Auto-Demo-Block entfernen**

In `src/esx-format.js`, `buildEsxFile`, den kompletten Block Zeile 806-829 löschen:

```js
  // Auto-assign loaded samples to drum parts across patterns (9 parts per pattern).
  // Only Part 0 gets active steps — rest are silent until user programs them.
  if (monoCount > 0) {
    const patternsNeeded = Math.ceil(monoCount / 9);
    for (let pat = 0; pat < Math.min(patternsNeeded, NUM.PATTERNS); pat++) {
      const patOff = ADDR.PATTERN_DATA + pat * 4280;

      // Name the pattern
      const patName = 'A.' + String(pat + 1).padStart(3, '0');
      headerBuffer.fill(0x20, patOff, patOff + 8);
      headerBuffer.write(patName, patOff, 'ascii');

      // Assign samples to this pattern's 9 drum parts
      for (let p = 0; p < 9; p++) {
        const sampleIdx = pat * 9 + p;
        const partOff = patOff + 24 + p * 34;
        if (sampleIdx < monoCount) {
          headerBuffer.writeUInt16BE(sampleIdx, partOff + 0);
        }
        // Only Part 0 gets active steps (four-on-the-floor: steps 0,4,8,12)
        // LSB-first bit-packed: byte 0 = steps 0-7, step 0 (bit0) + step 4 (bit4) = 0x11
        if (p === 0) {
          headerBuffer.writeUInt8(0x11, partOff + 18 + 0); // steps 0,4
          headerBuffer.writeUInt8(0x11, partOff + 18 + 1); // steps 8,12
          // bytes 2-15 remain 0x00 (no active steps beyond step 15)
        }
      }
    }
  }
```

Ersetzen durch einen Kommentar, damit niemand den Block wieder einbaut:

```js
  // Patterns, songs and globals stay at the hardware init state from
  // createEmptyEsx(). This used to auto-assign samples to drum parts and write a
  // four-on-the-floor into ceil(n/9) patterns — with 241 samples that produced 27
  // throwaway patterns a user then had to clear on the device. Callers who want to
  // keep an existing file's patterns must use rebuildEsxFile(), not this function.
```

**Wichtig:** Der `loopStart = endFrame`-Code weiter oben in derselben Funktion (Zeile 756-759) bleibt unverändert. Der ist korrekt: im echten Factory-File kommt `loopStart = 0xFFFFFFFF` kein einziges Mal vor, und ohne gültigen Loop-Point halten Keyboard-Parts keinen Ton.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/parsers/esx-init-state.test.js`
Expected: PASS, 11 Tests.

- [ ] **Step 5: Volle Suite laufen lassen**

Run: `npm test`

Expected: **1 Fehlschlag** in `tests/parsers/esx-patterns.test.js` — „should detect active steps in pattern with samples". Der Test erwartet die 4 Demo-Steps.

- [ ] **Step 6: Die beiden Alt-Tests umstellen**

In `tests/parsers/esx-patterns.test.js` den Block bei Zeile 451-473 ersetzen:

```js
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

    // buildEsxFile writes four-on-the-floor: steps 0,4,8,12 active
    const drum1 = patterns[0].parts[0];
    const activeCount = drum1.steps.filter(s => s).length;
    expect(activeCount).toBe(4);
    expect(drum1.steps[0]).toBe(true);
    expect(drum1.steps[4]).toBe(true);
    expect(drum1.steps[8]).toBe(true);
    expect(drum1.steps[12]).toBe(true);
  });
});
```

durch:

```js
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
```

- [ ] **Step 7: Volle Suite grün**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/esx-format.js tests/parsers/esx-patterns.test.js tests/parsers/esx-init-state.test.js
git commit -m "fix(esx): stop writing auto-demo patterns when building a new file

buildEsxFile wrote ceil(n/9) patterns with sample assignments and a
four-on-the-floor. With 241 samples that was 27 throwaway patterns. A
new file now carries the hardware init state untouched.

Adds a regression test that rebuildEsxFile changes zero pattern, song
and global bytes — the guarantee that separates SAVE from EXPORT NEW.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pattern-Liste zeigt die Bank-Position

Ohne diese Änderung ist ein frisches File im Viewer eine Wand aus 256× „Init" mit rohem Index `0…255` daneben. Die Geräte selbst adressieren Patterns über die Bank-Position.

**Files:**
- Modify: `src/index.html:3888` (Zeile in `patBuildListDOM`)
- Modify: `src/index.html:3893-3897` (Schleife in `patRenderList`)
- Modify: `src/index.html:3927` (`patUpdateInfoBar`)
- Modify: `src/index.html` — neue Funktion `patPosLabel` direkt vor `patBuildListDOM` (Zeile 3875)

**Interfaces:**
- Consumes: `patData[i].deviceId` aus dem Unified-Pattern-Format (`'esx' | 'emx' | 'e2' | 'e2s'`), dokumentiert in `CLAUDE.md`
- Produces: `patPosLabel(deviceId, index)` → String

**Hinweis zur Verifikation:** `src/index.html` enthält ausschließlich Inline-Script und wird von Vitest nicht geladen (`environment: 'node'`, kein jsdom, `src/index.html` ist aus der Coverage ausgeschlossen). Diese Task wird manuell verifiziert. Kein jsdom einführen.

- [ ] **Step 1: Positions-Label-Funktion einfügen**

In `src/index.html` direkt vor `let _patListItems=[];` (Zeile 3875) einfügen:

```js
// Pattern position as the device itself addresses it. ESX-1 and EMX-1 hold 256
// patterns in four banks of 64 (A.001..D.064); E2/E2S hold 250 numbered flat.
// Empty patterns are all named "Init" on the hardware, so the position — not the
// name — is what identifies a slot.
function patPosLabel(deviceId,i){
  if(deviceId==='e2'||deviceId==='e2s')return String(i+1).padStart(3,'0');
  return String.fromCharCode(65+Math.floor(i/64))+'.'+String((i%64)+1).padStart(3,'0');
}
```

- [ ] **Step 2: Listenzeile umstellen**

In `patBuildListDOM` (Zeile 3883) ersetzen:

```js
    el.innerHTML=`<div class="pi">${i}</div><div class="pn"></div><span class="pat-active-dots"></span><div class="pb2"></div>`;
```

durch:

```js
    el.innerHTML=`<div class="pi"></div><div class="pn"></div><span class="pat-active-dots"></span><div class="pb2"></div>`;
```

(Die Position wird jetzt in `patRenderList` gesetzt, weil sie das `deviceId` braucht — das steht beim Bauen des DOM noch nicht zwingend fest.)

In `patRenderList` (Zeile 3893-3897) ersetzen:

```js
  for(let i=0;i<patData.length;i++){
    const p=patData[i];
    const name=p.name||'Pattern';
    const el=_patListItems[i];
    el.style.display='';
```

durch:

```js
  for(let i=0;i<patData.length;i++){
    const p=patData[i];
    const name=p.name||'Pattern';
    const el=_patListItems[i];
    el.children[0].textContent=patPosLabel(p.deviceId,i);
    el.style.display='';
```

- [ ] **Step 3: Infobar ergänzen**

In `patUpdateInfoBar` (Zeile 3927) ersetzen:

```js
    <span class="pat-badge pat-badge-name">${esc(p.name||'Pattern')}</span>
```

durch:

```js
    <span class="pat-badge">${esc(patPosLabel(p.deviceId,patSel))}</span>
    <span class="pat-badge pat-badge-name">${esc(p.name||'Pattern')}</span>
```

- [ ] **Step 4a: Label-Funktion isoliert prüfen**

`test-data/` enthält weder ein `.esx` noch ein E2-Pattern-File (nur `emx/*.EMX` und `e2s/*.e2sSample.all` — letztere sind Sample-Bänke, keine Patterns). Die reine Rechenlogik lässt sich deshalb zuerst ohne UI prüfen:

```bash
node -e '
function patPosLabel(deviceId,i){
  if(deviceId==="e2"||deviceId==="e2s")return String(i+1).padStart(3,"0");
  return String.fromCharCode(65+Math.floor(i/64))+"."+String((i%64)+1).padStart(3,"0");
}
const cases=[["esx",0,"A.001"],["esx",63,"A.064"],["esx",64,"B.001"],["esx",128,"C.001"],
             ["esx",192,"D.001"],["esx",255,"D.064"],["emx",0,"A.001"],["emx",255,"D.064"],
             ["e2",0,"001"],["e2",249,"250"],["e2s",0,"001"],["e2s",249,"250"]];
let bad=0;
for(const [d,i,want] of cases){const got=patPosLabel(d,i);
  if(got!==want){console.log("FAIL",d,i,"got",got,"want",want);bad++}}
console.log(bad?bad+" FAILED":"all 12 OK");
'
```

Expected: `all 12 OK`

- [ ] **Step 4b: Im laufenden Programm verifizieren**

Ein `.esx` zum Laden gibt es im Repo nicht. Zwei Wege, einen zu bekommen:

```bash
# Variante A — ein echtes Factory-File mit sprechenden Pattern-Namen
curl -sSL -o /tmp/factory.esx https://projects.skratchdot.com/esx-files/esx/ESX-Factory-Data.esx

# Variante B — ein frisch gebautes File, also der eigentliche Zielfall:
#   in der App ein WAV importieren, dann EXPORT NEW
```

Run: `npm start`

Prüfen, in dieser Reihenfolge:

1. Tab **PATTERNS VIEWER** → `/tmp/factory.esx` laden.
2. Erste Listenzeile zeigt `A.001  House1`, nicht `0  House1`.
3. Zeile 65 zeigt `B.001`, Zeile 129 `C.001`, Zeile 193 `D.001`, letzte Zeile `D.064`.
4. Ab Zeile 152 stehen die Werks-Init-Patterns: Position sichtbar, Name `Init`.
5. Infobar oben zeigt zwei Badges nebeneinander: erst Position, dann Name.
6. `test-data/emx/BEST.EMX` laden → gleiche `A.001`-Notation, 256 Zeilen.
7. Ein per EXPORT NEW gebautes File laden → 256 Zeilen `A.001 Init` … `D.064 Init`, jede Zeile eindeutig adressierbar.

E2/E2S ist in Schritt 4a abgedeckt; ein E2-Pattern-File liegt im Repo nicht vor.

Stimmt einer der Punkte nicht: anhalten und melden, nicht raten.

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): show bank position instead of raw index in pattern list

Empty patterns are all named Init on the hardware, so the position is
what identifies a slot. ESX-1 and EMX-1 use A.001..D.064, E2/E2S number
250 patterns flat.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Guard auf EXPORT NEW

**Files:**
- Modify: `src/index.html:2128-2131` (`exportNewEsx`)

**Interfaces:**
- Consumes: die Renderer-Globale `fp` (Pfad des geladenen Files, `null` wenn keins geladen ist) und `S.numSamples`
- Produces: nichts

**Hinweis zur Verifikation:** Renderer-Code, manuell zu prüfen — siehe Hinweis in Task 4.

- [ ] **Step 1: Bestätigungsdialog einbauen**

In `src/index.html`, `exportNewEsx` (Zeile 2128-2131) ersetzen:

```js
async function exportNewEsx(){
  if(_fxBusy)return;_fxBusy=true;
  try{
  if(!S.numSamples){toast('NO SAMPLES','error');return}
```

durch:

```js
async function exportNewEsx(){
  if(_fxBusy)return;_fxBusy=true;
  try{
  if(!S.numSamples){toast('NO SAMPLES','error');return}
  // EXPORT NEW builds from scratch: only the samples carry over. Everything the
  // loaded file holds besides samples is dropped. SAVE keeps all of it.
  if(fp&&!confirm('EXPORT NEW baut ein leeres File und übernimmt nur die Samples.\n\nVerworfen werden: alle 256 Patterns, alle 64 Songs und die MIDI-Globals des geladenen Files.\n\nWenn du die behalten willst: abbrechen und SAVE benutzen.\n\nTrotzdem exportieren?')){return}
```

- [ ] **Step 2: Manuell verifizieren**

Run: `npm start`

1. Ohne geladenes File Samples importieren → **EXPORT NEW** → **kein** Dialog, Speichern-Dialog erscheint direkt.
2. App neu starten. Ein `.esx` laden → **EXPORT NEW** → Dialog erscheint mit dem Text oben.
3. Im Dialog auf **Abbrechen** → nichts passiert, kein Speichern-Dialog, kein Toast, der Fortschrittsbalken bleibt aus.
4. Nochmal **EXPORT NEW** → **OK** → Speichern-Dialog erscheint wie bisher.
5. Danach **SAVE** drücken → **kein** Dialog (SAVE verwirft nichts).

- [ ] **Step 3: Volle Suite**

Run: `npm test`
Expected: PASS (Renderer-Code ist nicht abgedeckt, die Suite muss trotzdem grün bleiben).

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): warn before EXPORT NEW discards patterns and songs

EXPORT NEW builds from scratch and carries over only the samples. It
silently dropped 256 patterns, 64 songs and the MIDI globals of a loaded
file. Now it asks first, and only when a file is actually loaded.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Nach Abschluss

- [ ] `npm test` läuft komplett grün
- [ ] `git log --oneline -5` zeigt die fünf Commits
- [ ] Der Spec (`docs/superpowers/specs/2026-08-03-esx-init-state-design.md`) ist unverändert — Abweichungen davon wären ein Fehler im Plan und gehören gemeldet, nicht stillschweigend umgesetzt

## Bewusst nicht Teil dieses Plans

- **Reparatur bestehender Files.** Ein `Y3.esx` aus `Y.ESX` (Patterns behalten, `loopStart = 0xFFFFFFFF` auf allen 241 Samples korrigieren) ist eine Einmal-Aktion an Anwenderdaten, kein Produktcode.
- **Pattern Set** (GP+0x40…0xBF): bleibt bei Identity `0…127`. Begründung im Spec.
- **MIDI-Globals-Defaults:** bleiben Ch.1/Ch.2/Ch.10 wie im Factory-File. Kollisionen mit EMX-Defaults sind Gerätekonfiguration und werden vom MIDI-Globals-Editor abgedeckt.
