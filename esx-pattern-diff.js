#!/usr/bin/env node
'use strict';

/**
 * esx-pattern-diff.js — differential byte inspector for ESX-1 pattern reverse-engineering.
 *
 * Workflow:
 *   1. On hardware, save the card/file (BEFORE.esx).
 *   2. Change exactly ONE knob/parameter, save again (AFTER.esx).
 *   3. node esx-pattern-diff.js BEFORE.esx AFTER.esx
 *
 * It lists every differing byte and maps its absolute offset back to
 * Pattern → Part → Parameter using the SAME tables the parser uses
 * (PATTERN_OFFSETS / PARAM_OFFSETS from src/esx-format.js). If a change
 * lands on a byte the current map labels differently than expected — or on
 * an UNMAPPED byte — that is exactly the signal that the mapping is wrong
 * for that parameter.
 *
 * Tip: to strip file-format noise (padding / current-pattern pointer that
 * change even on a no-op re-save), diff two BASELINE saves first with
 * --baseline to see which offsets to ignore, or pass --ignore 0xADDR,0xADDR.
 */

const fs = require('fs');
const { PATTERN_OFFSETS, PARAM_OFFSETS } = require('./src/esx-format');

// ── Layout constants (mirror src/esx-format.js) ──────────────
const PATTERN_DATA = 0x200;
const PATTERN_SIZE = 4280;
const PATTERN_COUNT = 256;
const PATTERNS_END = PATTERN_DATA + PATTERN_COUNT * PATTERN_SIZE;

const DRUM_PART_SIZE = 34;
const KB_PART_SIZE = 274;
const STRETCH_PART_SIZE = 32;
const AUDIOIN_PART_SIZE = 156;
const ACCENT_PART_SIZE = 18;
const MOTION_SLOT_SIZE = 130;

// Reverse a PARAM_OFFSETS table: { relOffset -> paramName }
function reverseParams(tbl) {
  const m = {};
  for (const [k, v] of Object.entries(tbl)) m[v] = k;
  return m;
}
const REV = {
  drum: reverseParams(PARAM_OFFSETS.drum),
  keyboard: reverseParams(PARAM_OFFSETS.keyboard),
  stretch: reverseParams(PARAM_OFFSETS.stretch),
  slice: reverseParams(PARAM_OFFSETS.slice),
  audioin: reverseParams(PARAM_OFFSETS.audioin),
  accent: reverseParams(PARAM_OFFSETS.accent),
};

// Describe a byte position within a given part type.
function describePart(type, rel) {
  const p = REV[type] && REV[type][rel];
  if (p) return `param:${p}`;
  switch (type) {
    case 'drum':
      if (rel <= 1) return 'sampleNum(u16BE)';
      if (rel >= 18 && rel < 34) return `stepByte[${rel - 18}] (8 steps, LSB-first)`;
      return `UNMAPPED(+${rel})`;
    case 'keyboard':
      if (rel <= 1) return 'sampleNum(u16BE)';
      if (rel >= 18 && rel < 146) return `note[${rel - 18}] (bit7=gate 0=ON)`;
      if (rel >= 146 && rel < 274) return `gate[${rel - 146}]`;
      return `UNMAPPED(+${rel})`;
    case 'stretch':
    case 'slice':
      if (rel <= 1) return 'sampleNum(u16BE)';
      if (rel >= 16 && rel < 32) return `stepByte[${rel - 16}] (LSB-first)`;
      return `UNMAPPED(+${rel})`;
    case 'audioin':
      if (rel >= 12 && rel < 28) return `stepByte[${rel - 12}] (LSB-first)`;
      if (rel >= 28 && rel < 156) return `gate[${rel - 28}]`;
      return `UNMAPPED(+${rel})`;
    case 'accent':
      if (rel === 0) return 'param:level';
      if (rel === 1) return 'reserved';
      if (rel >= 2 && rel < 18) return `stepByte[${rel - 2}] (INVERTED: 1=OFF)`;
      return `UNMAPPED(+${rel})`;
    default:
      return `UNMAPPED(+${rel})`;
  }
}

// Map a within-pattern offset to part + rel description.
function describeWithinPattern(w) {
  const O = PATTERN_OFFSETS;
  if (w < O.DRUM_START) return { region: 'pattern-header', detail: nameHeader(w) };
  if (w < O.KB1) {
    const idx = Math.floor((w - O.DRUM_START) / DRUM_PART_SIZE);
    const rel = (w - O.DRUM_START) % DRUM_PART_SIZE;
    return { region: `Drum ${idx + 1}`, detail: describePart('drum', rel) };
  }
  if (w < O.KB2) return { region: 'KB 1', detail: describePart('keyboard', w - O.KB1) };
  if (w < O.STRETCH1) return { region: 'KB 2', detail: describePart('keyboard', w - O.KB2) };
  if (w < O.STRETCH2) return { region: 'Stretch 1', detail: describePart('stretch', w - O.STRETCH1) };
  if (w < O.SLICE) return { region: 'Stretch 2', detail: describePart('stretch', w - O.STRETCH2) };
  if (w < O.AUDIOIN) return { region: 'Slice', detail: describePart('slice', w - O.SLICE) };
  if (w < O.ACCENT) return { region: 'Audio In', detail: describePart('audioin', w - O.AUDIOIN) };
  if (w < O.FX) return { region: 'Accent', detail: describePart('accent', w - O.ACCENT) };
  if (w < O.MOTION) {
    const rel = w - O.FX;
    return { region: 'FX', detail: `fx${Math.floor(rel / 4) + 1}.${['type', 'param1', 'param2', 'param3'][rel % 4]}` };
  }
  const rel = w - O.MOTION;
  return { region: `Motion slot ${Math.floor(rel / MOTION_SLOT_SIZE)}`, detail: `+${rel % MOTION_SLOT_SIZE}` };
}

function nameHeader(w) {
  if (w < 16) return `name[${w}]`;
  if (w === 16 || w === 17) return 'tempo(u16BE)/128=BPM';
  return `header+${w}`;
}

// Full mapping for an absolute file offset.
function describeOffset(off) {
  if (off < PATTERN_DATA) return { zone: 'GLOBAL/HEADER', label: `offset 0x${off.toString(16)}` };
  if (off < PATTERNS_END) {
    const patIdx = Math.floor((off - PATTERN_DATA) / PATTERN_SIZE);
    const w = (off - PATTERN_DATA) % PATTERN_SIZE;
    const d = describeWithinPattern(w);
    return { zone: `Pattern ${patIdx}`, label: `${d.region} → ${d.detail}`, patIdx, within: w };
  }
  return { zone: 'SONG/SAMPLE-DATA', label: `offset 0x${off.toString(16)}` };
}

// ── Main ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const files = [];
  const ignore = new Set();
  let baseline = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') baseline = true;
    else if (a === '--ignore') {
      (argv[++i] || '').split(',').forEach(s => { if (s) ignore.add(parseInt(s, 16)); });
    } else files.push(a);
  }
  return { files, ignore, baseline };
}

function diff(bufA, bufB, ignore) {
  const diffs = [];
  const n = Math.min(bufA.length, bufB.length);
  for (let i = 0; i < n; i++) {
    if (bufA[i] !== bufB[i] && !ignore.has(i)) diffs.push(i);
  }
  return diffs;
}

function main() {
  const { files, ignore, baseline } = parseArgs(process.argv);
  if (files.length !== 2) {
    console.error('usage: node esx-pattern-diff.js <BEFORE.esx> <AFTER.esx> [--ignore 0xADDR,..] [--baseline]');
    process.exit(1);
  }
  const [pa, pb] = files;
  const bufA = fs.readFileSync(pa);
  const bufB = fs.readFileSync(pb);

  console.log(`A: ${pa} (${bufA.length.toLocaleString()} bytes)`);
  console.log(`B: ${pb} (${bufB.length.toLocaleString()} bytes)`);
  if (bufA.length !== bufB.length) console.log(`⚠️  size mismatch (${bufA.length} vs ${bufB.length})`);

  const diffs = diff(bufA, bufB, ignore);
  console.log(`\n${diffs.length} differing byte(s)${ignore.size ? ` (${ignore.size} offset(s) ignored)` : ''}\n`);

  if (baseline) {
    // Just emit an --ignore list for a no-op baseline pair.
    console.log('Baseline noise offsets (feed back via --ignore):');
    console.log('--ignore ' + diffs.map(o => '0x' + o.toString(16)).join(','));
    return;
  }

  let unmapped = 0;
  for (const off of diffs) {
    const a = bufA[off], b = bufB[off];
    const d = describeOffset(off);
    const flag = /UNMAPPED/.test(d.label) ? '  ⚠️ UNMAPPED' : '';
    if (flag) unmapped++;
    console.log(
      `0x${off.toString(16).toUpperCase().padStart(8, '0')}  ` +
      `${d.zone.padEnd(18)}  ${d.label.padEnd(42)}  ` +
      `0x${a.toString(16).padStart(2, '0')}→0x${b.toString(16).padStart(2, '0')} ` +
      `(${a}→${b}, Δ${b - a >= 0 ? '+' : ''}${b - a})${flag}`
    );
  }
  if (unmapped) {
    console.log(`\n⚠️  ${unmapped} change(s) landed on UNMAPPED bytes — likely a wrong/missing mapping.`);
  }
  if (diffs.length === 0) console.log('(files identical in overlapping range)');
}

if (require.main === module) main();

module.exports = { describeOffset, describeWithinPattern, describePart };
