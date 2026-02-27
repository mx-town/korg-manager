/**
 * File I/O – Auto-detection & routing
 * Detects Korg file formats from magic bytes, file size, and extension,
 * then routes to the correct parser module.
 */

'use strict';

const path = require('path');

// Lazy-load parsers to avoid circular dependencies
let _esxFormat, _e2sFormat, _e2patFormat, _emxFormat;
function esxFormat()   { return _esxFormat   || (_esxFormat   = require('./esx-format'));   }
function e2sFormat()   { return _e2sFormat   || (_e2sFormat   = require('./e2s-format'));   }
function e2patFormat() { return _e2patFormat || (_e2patFormat = require('./e2pat-format')); }
function emxFormat()   { return _emxFormat   || (_emxFormat   = require('./emx-format'));   }

// ── Format info table ─────────────────────────────────────

const FORMAT_INFO = {
  esx: {
    id:          'esx',
    name:        'Korg ESX-1',
    description: 'Electribe SX sample bank',
    extensions:  ['.esx'],
    minSize:     0x00250010,
    parser:      'esx-format',
  },
  e2s: {
    id:          'e2s',
    name:        'Korg E2S Samples',
    description: 'Electribe 2 Sampler sample bank (.e2sSample.all)',
    extensions:  ['.all'],
    minSize:     16 + 1000 * 8,    // header + offset table minimum
    parser:      'e2s-format',
  },
  e2pat: {
    id:          'e2pat',
    name:        'Korg E2/E2S Pattern',
    description: 'Electribe 2 single pattern or all-patterns',
    extensions:  ['.e2pat', '.e2allpat'],
    minSize:     16641,            // single pattern
    parser:      'e2pat-format',
  },
  emx: {
    id:          'emx',
    name:        'Korg EMX-1',
    description: 'Electribe MX memory dump',
    extensions:  ['.emx'],
    minSize:     1728000,
    parser:      'emx-format',
  },
};

// ── Detection ─────────────────────────────────────────────

/**
 * Detect file format from buffer contents and optional filename.
 * Returns a format ID string ('esx', 'e2s', 'e2pat', 'emx') or null.
 *
 * Detection order:
 *   1. Magic bytes (most reliable)
 *   2. File size (for fixed-size formats)
 *   3. File extension (fallback)
 */
function detectFormat(buffer, filename) {
  // ── 1. Magic bytes ──

  // ESX: starts with "KORG" + 0x00000071 + "ESX"
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'KORG' &&
      buffer.readUInt32BE(4) === 0x00000071 &&
      buffer.toString('ascii', 8, 11) === 'ESX') {
    return 'esx';
  }

  // E2S: starts with "e2s sample all\x1A"
  if (buffer.length >= 16) {
    const e2sMagic = buffer.toString('binary', 0, 15);
    if (e2sMagic === 'e2s sample all\x1A') {
      return 'e2s';
    }
  }

  // E2PAT all-patterns: starts with "KORG" + type marker + "E2P"
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'KORG' &&
      buffer.toString('ascii', 8, 11) === 'E2P') {
    return 'e2pat';
  }

  // EMX: starts with "KORG" and exact size 1,728,000
  if (buffer.length === 1728000 &&
      buffer.toString('ascii', 0, 4) === 'KORG') {
    return 'emx';
  }

  // ── 2. File size ──

  // Single E2 pattern: exactly 16,641 bytes
  if (buffer.length === 16641) {
    return 'e2pat';
  }

  // EMX dump: exactly 1,728,000 bytes
  if (buffer.length === 1728000) {
    return 'emx';
  }

  // ── 3. Extension ──
  if (filename) {
    const ext  = path.extname(filename).toLowerCase();
    const base = filename.toLowerCase();

    if (ext === '.esx')                    return 'esx';
    if (base.endsWith('.e2ssample.all'))    return 'e2s';
    if (ext === '.all' && base.includes('e2s'))  return 'e2s';
    if (ext === '.e2pat' || ext === '.e2allpat')  return 'e2pat';
    if (ext === '.emx')                    return 'emx';
  }

  return null;
}

/**
 * Get the FORMAT_INFO entry for a detected or specified format.
 */
function getFormatInfo(formatId) {
  return FORMAT_INFO[formatId] || null;
}

// ── Routing ───────────────────────────────────────────────

/**
 * Parse a file buffer, auto-detecting the format.
 *
 * @param {Buffer} buffer   – raw file contents
 * @param {string} [filename] – original filename (helps with extension detection)
 * @returns {{ format: string, data: object }} parsed result
 */
function parseFile(buffer, filename) {
  const format = detectFormat(buffer, filename);
  if (!format) {
    throw new Error(
      `Unknown file format (size=${buffer.length}` +
      (filename ? `, name="${filename}"` : '') + ')'
    );
  }

  let data;
  switch (format) {
    case 'esx':
      data = esxFormat().parseEsxFile(buffer);
      break;
    case 'e2s':
      data = e2sFormat().parseE2sAllFile(buffer);
      break;
    case 'e2pat':
      if (buffer.length === 16641) {
        data = e2patFormat().parsePattern(buffer, 0);
      } else {
        data = e2patFormat().parseAllPatterns(buffer);
      }
      break;
    case 'emx':
      data = emxFormat().parseEmxDump(buffer);
      break;
    default:
      throw new Error(`No parser for format "${format}"`);
  }

  return { format, info: FORMAT_INFO[format], data };
}

/**
 * Get the parser module for a given format ID.
 */
function getParser(formatId) {
  switch (formatId) {
    case 'esx':   return esxFormat();
    case 'e2s':   return e2sFormat();
    case 'e2pat': return e2patFormat();
    case 'emx':   return emxFormat();
    default:      return null;
  }
}

// ── Exports ───────────────────────────────────────────────

module.exports = {
  FORMAT_INFO,
  detectFormat,
  getFormatInfo,
  parseFile,
  getParser,
};

// ── Self-test ─────────────────────────────────────────────

if (require.main === module) {
  console.log('── file-io self-test ──');

  // 1. ESX detection
  const esxBuf = Buffer.alloc(0x00250010, 0);
  esxBuf.write('KORG', 0, 'ascii');
  esxBuf.writeUInt32BE(0x00000071, 4);
  esxBuf.write('ESX', 8, 'ascii');
  console.assert(detectFormat(esxBuf) === 'esx', 'ESX magic detection');
  console.log('  ESX magic detection ✓');

  // 2. E2S detection
  const e2sMagic = Buffer.from('e2s sample all\x1A\x00', 'binary');
  const e2sBuf = Buffer.alloc(16 + 1000 * 8 + 100, 0);
  e2sMagic.copy(e2sBuf, 0);
  console.assert(detectFormat(e2sBuf) === 'e2s', 'E2S magic detection');
  console.log('  E2S magic detection ✓');

  // 3. E2PAT all-patterns detection
  const e2patAllBuf = Buffer.alloc(32 + 250 * 16641, 0);
  e2patAllBuf.write('KORG', 0, 'ascii');
  e2patAllBuf.writeUInt32BE(0x00000072, 4);
  e2patAllBuf.write('E2P', 8, 'ascii');
  console.assert(detectFormat(e2patAllBuf) === 'e2pat', 'E2PAT all-patterns magic detection');
  console.log('  E2PAT all-patterns magic detection ✓');

  // 4. E2PAT single-pattern detection (by size)
  const singlePatBuf = Buffer.alloc(16641, 0);
  console.assert(detectFormat(singlePatBuf) === 'e2pat', 'E2PAT single-pattern size detection');
  console.log('  E2PAT single-pattern size detection ✓');

  // 5. EMX detection
  const emxBuf = Buffer.alloc(1728000, 0);
  emxBuf.write('KORG', 0, 'ascii');
  console.assert(detectFormat(emxBuf) === 'emx', 'EMX magic + size detection');
  console.log('  EMX magic + size detection ✓');

  // 6. Extension fallback
  console.assert(detectFormat(Buffer.alloc(100), 'test.esx') === 'esx', 'ESX extension');
  console.assert(detectFormat(Buffer.alloc(100), 'bank.e2sSample.all') === 'e2s', 'E2S extension');
  console.assert(detectFormat(Buffer.alloc(100), 'pat.e2pat') === 'e2pat', 'E2PAT extension');
  console.assert(detectFormat(Buffer.alloc(100), 'dump.emx') === 'emx', 'EMX extension');
  console.log('  Extension fallback detection ✓');

  // 7. Unknown format
  console.assert(detectFormat(Buffer.alloc(100)) === null, 'Unknown format returns null');
  console.log('  Unknown format → null ✓');

  // 8. FORMAT_INFO lookup
  const info = getFormatInfo('esx');
  console.assert(info !== null, 'FORMAT_INFO lookup');
  console.assert(info.name === 'Korg ESX-1', 'FORMAT_INFO name');
  console.log('  FORMAT_INFO lookup ✓');

  // 9. End-to-end parse routing with E2S
  const e2s = require('./e2s-format');
  const testPcm = Buffer.alloc(100);
  for (let i = 0; i < 50; i++) testPcm.writeInt16LE(i * 100, i * 2);
  const allFile = e2s.buildE2sAllFile([{ slot: 0, name: 'TEST', pcmData: testPcm }]);
  const result = parseFile(allFile, 'samples.e2sSample.all');
  console.assert(result.format === 'e2s', 'parseFile routing');
  console.assert(result.data.samples[0] !== null, 'parseFile data present');
  console.log('  End-to-end parse routing ✓');

  console.log('  All assertions passed ✓');
}
