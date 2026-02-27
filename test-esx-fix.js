#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createEmptyEsx } = require('./src/esx-format.js');

console.log('🔧 Testing ESX file generation fix...\n');

// Generate a new empty ESX file
console.log('Generating empty ESX file...');
const generatedBuffer = createEmptyEsx();
const generatedSize = generatedBuffer.length;

console.log(`✅ Generated ESX file: ${(generatedSize / 1024 / 1024).toFixed(2)} MB (${generatedSize.toLocaleString()} bytes)\n`);

// Load factory file for comparison
const factoryPath = 'c:\\Users\\mel2497\\Downloads\\ESX1_Fact.ESX';
const factoryBuffer = fs.readFileSync(factoryPath);
const factorySize = factoryBuffer.length;

console.log(`Factory ESX file: ${(factorySize / 1024 / 1024).toFixed(2)} MB (${factorySize.toLocaleString()} bytes)\n`);

// Compare key sections
console.log('📊 COMPARISON OF KEY SECTIONS:\n');

function compareSection(name, offset, length) {
  const gen = generatedBuffer.slice(offset, offset + length);
  const fact = factoryBuffer.slice(offset, offset + length);

  let matches = 0;
  let diffs = 0;

  for (let i = 0; i < length; i++) {
    if (gen[i] === fact[i]) {
      matches++;
    } else {
      diffs++;
    }
  }

  const pct = ((matches / length) * 100).toFixed(1);
  const status = diffs === 0 ? '✅' : `⚠️ (${diffs} diffs)`;

  console.log(`${status} ${name}: ${pct}% match (${matches}/${length} bytes)`);

  if (diffs > 0 && diffs <= 20) {
    for (let i = 0; i < length; i++) {
      if (gen[i] !== fact[i]) {
        console.log(`   Offset 0x${(offset + i).toString(16).toUpperCase().padStart(8, '0')}: 0x${gen[i].toString(16).toUpperCase().padStart(2, '0')} vs 0x${fact[i].toString(16).toUpperCase().padStart(2, '0')}`);
      }
    }
  }

  return diffs === 0;
}

// Header
compareSection('Header (KORG)', 0x00, 32);

// Global Parameters
compareSection('Global Parameters', 0x20, 64);

// Pattern 1 (first 128 bytes)
compareSection('Pattern 1 Header', 0x200, 128);

// Pattern 2 header (offset 0x200 + 4280 = 0x1298)
compareSection('Pattern 2 Header', 0x1298, 128);

// Song 1 header (first 64 bytes)
compareSection('Song 1 Header', 0x130000, 64);

// Sample section header
compareSection('Sample Header (BPX)', 0x1B0000, 32);

// Sample counters
compareSection('Sample Counters', 0x1B0020, 12);

console.log('\n' + '='.repeat(80));

// Check for the specific bug we fixed
console.log('\n🔴 BUG CHECK: Global Parameters midiClock field\n');
const genMidiClock = generatedBuffer.readUInt8(0x24);
const factMidiClock = factoryBuffer.readUInt8(0x24);

console.log(`Generated at offset 0x24: 0x${genMidiClock.toString(16).toUpperCase().padStart(2, '0')} (should be 0x00)`);
console.log(`Factory at offset 0x24:  0x${factMidiClock.toString(16).toUpperCase().padStart(2, '0')}`);

if (genMidiClock === 0x00) {
  console.log('✅ BUG FIXED! midiClock is correctly set to 0x00 (INT)\n');
} else {
  console.log('❌ BUG STILL EXISTS! midiClock should be 0x00\n');
}

// Check pattern tempos
console.log('🎵 PATTERN TEMPO CHECK:\n');
let patternTemposCorrect = 0;
let patternTemposWrong = 0;

for (let p = 0; p < 10; p++) {
  const offset = 0x200 + p * 4280 + 8; // tempo is at +8 within pattern
  const genTempo = generatedBuffer.readUInt16BE(offset);
  const factTempo = factoryBuffer.readUInt16BE(offset);

  if (genTempo === 0x3C00) {
    patternTemposCorrect++;
  } else {
    patternTemposWrong++;
  }

  const match = genTempo === factTempo ? '✅' : '⚠️';
  console.log(`${match} Pattern ${p}: Generated 0x${genTempo.toString(16).toUpperCase().padStart(4, '0')} (120 BPM = ${genTempo >> 7}.${genTempo & 0x0F})`);
}

console.log(`\n✅ Patterns with correct 120.0 BPM: ${patternTemposCorrect}/10`);

// Save the generated file for inspection
const outputPath = 'c:\\Users\\mel2497\\Downloads\\generated_test.esx';
fs.writeFileSync(outputPath, generatedBuffer);
console.log(`\n📄 Generated test file saved to: ${outputPath}`);
console.log(`File size: ${(generatedBuffer.length / 1024 / 1024).toFixed(2)} MB\n`);
