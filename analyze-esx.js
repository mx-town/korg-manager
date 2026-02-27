#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Offsets from the lammas/electribe constants
const ADDRESSES = {
  HEADER: 0x00,
  GLOBAL_PARAMS: 0x00,
  PATTERN_DATA: 0x0000,     // Placeholder - will check
  SONG_DATA: 0x0000,        // Placeholder
  SAMPLE_HEADER: 0x1B0000,  // Factory file header for samples
};

function hexBytes(buf, offset, length) {
  return buf.slice(offset, offset + length)
    .toString('hex')
    .toUpperCase()
    .replace(/(.{2})/g, '$1 ');
}

function analyzeFile(filePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 Analyzing: ${path.basename(filePath)}`);
  console.log('='.repeat(80));

  const buf = fs.readFileSync(filePath);
  console.log(`File size: ${(buf.length / 1024 / 1024).toFixed(2)} MB (${buf.length.toLocaleString()} bytes)`);

  // 1. Check Header
  console.log('\n📍 HEADER (Offset 0x00):');
  const header = buf.slice(0, 16).toString('utf8', 0, 4);
  console.log(`  Magic: "${header}" (bytes: ${hexBytes(buf, 0, 4)})`);
  console.log(`  Next 12 bytes: ${hexBytes(buf, 4, 12)}`);

  // 2. Check Global Parameters at various offsets
  console.log('\n📍 GLOBAL PARAMETERS (around offset 0x24):');
  console.log(`  Offset 0x24 (midiClock?): ${hexBytes(buf, 0x24, 4)}`);
  console.log(`  Offset 0x25 (bitflags?): ${hexBytes(buf, 0x25, 4)}`);
  console.log(`  Offset 0x26-0x30: ${hexBytes(buf, 0x26, 11)}`);

  // 3. Look for pattern data - find the first non-zero pattern
  console.log('\n📍 PATTERNS (offset 0x200 = first pattern):');
  const pattern1Offset = 0x200;
  const pattern1 = buf.slice(pattern1Offset, pattern1Offset + 24);
  console.log(`  Pattern 1 header (24 bytes): ${hexBytes(buf, pattern1Offset, 24)}`);

  // Try to read as tempo (uint16BE at offset +8)
  const tempoBytes = buf.readUInt16BE(pattern1Offset + 8);
  console.log(`  Tempo bytes (offset +8): 0x${tempoBytes.toString(16).toUpperCase().padStart(4, '0')}`);
  console.log(`    → If decoded as (tempo << 7) | decimal: ${tempoBytes >> 7}.${(tempoBytes & 0x0F)}`);

  // 4. Check all patterns for non-zero data
  console.log('\n📊 PATTERN ANALYSIS:');
  let patternCount = 0;
  for (let i = 0; i < 256; i++) {
    const offset = 0x200 + (i * 4280);
    if (offset + 24 <= buf.length) {
      const pattern = buf.slice(offset, offset + 24);
      const hasData = !pattern.every(b => b === 0);
      if (hasData) {
        patternCount++;
        if (patternCount <= 5) {
          console.log(`  Pattern ${i}: Non-zero at offset 0x${offset.toString(16).toUpperCase()}`);
          console.log(`    Name+Tempo: ${hexBytes(buf, offset, 16)}`);
        }
      }
    }
  }
  console.log(`  Total patterns with data: ${patternCount}`);

  // 5. Check sample section header
  console.log('\n📍 SAMPLE SECTION (offset 0x1B0000):');
  const sampleHeaderOffset = 0x1B0000;
  if (sampleHeaderOffset < buf.length) {
    const sampleHeader = buf.slice(sampleHeaderOffset, sampleHeaderOffset + 16);
    console.log(`  Sample header magic: "${sampleHeader.toString('utf8', 0, 4)}"`);
    console.log(`  Next bytes: ${hexBytes(buf, sampleHeaderOffset + 4, 12)}`);
  } else {
    console.log(`  Offset 0x1B0000 is beyond file size (${buf.length.toLocaleString()} bytes)`);
  }

  // 6. Find where actual audio data starts
  console.log('\n🔍 LOOKING FOR AUDIO DATA MARKERS:');
  // Audio data typically starts with non-repetitive patterns different from metadata
  // Look for "KORG" or other patterns
  let korgCount = 0;
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.toString('utf8', i, i + 4) === 'KORG') {
      korgCount++;
      if (korgCount <= 3) {
        console.log(`  "KORG" found at offset 0x${i.toString(16).toUpperCase()} (${(i / 1024 / 1024).toFixed(2)} MB)`);
      }
    }
  }
  console.log(`  Total "KORG" markers: ${korgCount}`);

  // 7. Check file structure
  console.log('\n📊 FILE STRUCTURE:');
  console.log(`  Offset 0x00-0x200: Header/Global Parameters (${0x200} bytes)`);
  console.log(`  Offset 0x200-0x1A0000: Patterns (256 × 4280 = ${256 * 4280} bytes)`);
  console.log(`  Expected End of Patterns: 0x${(0x200 + 256 * 4280).toString(16).toUpperCase()}`);
  console.log(`  Offset 0x1A0000-...: Songs & Sample Data`);
  console.log(`  File ends at: 0x${buf.length.toString(16).toUpperCase()} (${buf.length.toLocaleString()} bytes)`);
}

// Compare two files
function compareFiles(file1Path, file2Path) {
  console.log(`\n${'='.repeat(80)}\n⚙️  COMPARISON\n${'='.repeat(80)}`);

  const buf1 = fs.readFileSync(file1Path);
  const buf2 = fs.readFileSync(file2Path);

  console.log(`File 1 size: ${buf1.length.toLocaleString()} bytes`);
  console.log(`File 2 size: ${buf2.length.toLocaleString()} bytes`);

  if (buf1.length !== buf2.length) {
    console.log(`⚠️  Different sizes!`);
    return;
  }

  // Find first 10 differences
  console.log(`\n🔴 First differences (up to offset 0x1000):`);
  let diffCount = 0;
  for (let i = 0; i < Math.min(0x1000, buf1.length); i++) {
    if (buf1[i] !== buf2[i]) {
      diffCount++;
      if (diffCount <= 10) {
        console.log(`  Offset 0x${i.toString(16).toUpperCase().padStart(8, '0')}: 0x${buf1[i].toString(16).toUpperCase().padStart(2, '0')} vs 0x${buf2[i].toString(16).toUpperCase().padStart(2, '0')}`);
      }
    }
  }
  console.log(`  Total differences in first 0x1000 bytes: ${diffCount}`);
}

// Main
const factoryPath = 'c:\\Users\\mel2497\\Downloads\\ESX1_Fact.ESX';
const geschrubbePath = 'c:\\Users\\mel2497\\Downloads\\geschrubbe.esx';

analyzeFile(factoryPath);
analyzeFile(geschrubbePath);

if (fs.existsSync(factoryPath) && fs.existsSync(geschrubbePath)) {
  compareFiles(factoryPath, geschrubbePath);
}
