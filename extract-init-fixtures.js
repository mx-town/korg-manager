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
