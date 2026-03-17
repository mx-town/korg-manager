/**
 * File I/O Integration Tests
 * Covers format auto-detection from magic bytes, file size, and extension,
 * plus end-to-end parse routing.
 */
'use strict';

// globals: true in vitest.config.js provides describe, it, expect
const {
  detectFormat,
  getFormatInfo,
  parseFile,
  FORMAT_INFO,
} = require('../../src/file-io');
const { generateMinimalESX, generateESXWithSample } = require('../fixtures/generators/minimal-esx');
const { generateEmptyE2S, generateE2SWithSample } = require('../fixtures/generators/minimal-e2s');
const { generateMinimalEMX, generateMinimalEMXSmartCard } = require('../fixtures/generators/minimal-emx');
const { buildAllPatterns, createDefaultPattern, DEVICE_E2, ALL_FILE_SIZE } = require('../../src/e2pat-format');

// ── Magic byte detection ─────────────────────────────────

describe('File I/O - Magic byte detection', () => {
  it('should detect ESX from magic bytes', () => {
    const buf = generateMinimalESX();
    expect(detectFormat(buf)).toBe('esx');
  });

  it('should detect E2S from magic bytes', () => {
    const buf = generateE2SWithSample(0, 'TEST');
    expect(detectFormat(buf)).toBe('e2s');
  });

  it('should detect E2PAT all-patterns from magic bytes', () => {
    const pats = [createDefaultPattern(DEVICE_E2)];
    pats[0].header.name = 'TEST';
    const buf = buildAllPatterns(pats, DEVICE_E2);
    expect(detectFormat(buf)).toBe('e2pat');
  });

  it('should detect EMX from magic + exact size', () => {
    const buf = generateMinimalEMX();
    expect(detectFormat(buf)).toBe('emx');
  });

  it('should detect EMX SmartCard from magic + size 1736704', () => {
    const buf = generateMinimalEMXSmartCard();
    expect(detectFormat(buf)).toBe('emx');
  });
});

// ── Size-based detection ─────────────────────────────────

describe('File I/O - Size-based detection', () => {
  it('should detect single E2PAT by size (16641 bytes)', () => {
    const buf = Buffer.alloc(16641, 0);
    expect(detectFormat(buf)).toBe('e2pat');
  });

  it('should detect EMX by exact size (1728000 bytes)', () => {
    const buf = Buffer.alloc(1728000, 0);
    expect(detectFormat(buf)).toBe('emx');
  });

  it('should detect EMX SmartCard by exact size (1736704 bytes)', () => {
    const buf = Buffer.alloc(1736704, 0);
    expect(detectFormat(buf)).toBe('emx');
  });
});

// ── Extension fallback ───────────────────────────────────

describe('File I/O - Extension fallback', () => {
  const tiny = Buffer.alloc(100, 0);

  it('should detect .esx by extension', () => {
    expect(detectFormat(tiny, 'test.esx')).toBe('esx');
  });

  it('should detect .e2sSample.all by extension', () => {
    expect(detectFormat(tiny, 'bank.e2sSample.all')).toBe('e2s');
  });

  it('should detect .e2pat by extension', () => {
    expect(detectFormat(tiny, 'pattern.e2pat')).toBe('e2pat');
  });

  it('should detect .e2allpat by extension', () => {
    expect(detectFormat(tiny, 'all.e2allpat')).toBe('e2pat');
  });

  it('should detect .emx by extension', () => {
    expect(detectFormat(tiny, 'dump.emx')).toBe('emx');
  });

  it('should return null for unknown format', () => {
    expect(detectFormat(tiny)).toBeNull();
    expect(detectFormat(tiny, 'file.txt')).toBeNull();
  });
});

// ── FORMAT_INFO lookup ───────────────────────────────────

describe('File I/O - FORMAT_INFO', () => {
  it('should return info for known formats', () => {
    expect(getFormatInfo('esx')).toBeDefined();
    expect(getFormatInfo('esx').name).toBe('Korg ESX-1');
    expect(getFormatInfo('e2s').name).toBe('Korg E2S Samples');
    expect(getFormatInfo('e2pat').name).toBe('Korg E2/E2S Pattern');
    expect(getFormatInfo('emx').name).toBe('Korg EMX-1');
  });

  it('should return null for unknown format', () => {
    expect(getFormatInfo('unknown')).toBeNull();
  });
});

// ── End-to-end parse routing ─────────────────────────────

describe('File I/O - Parse routing', () => {
  it('should route ESX file to ESX parser', () => {
    const buf = generateESXWithSample('ROUTED', 50);
    const result = parseFile(buf, 'test.esx');

    expect(result.format).toBe('esx');
    expect(result.data.monoSamples).toBeDefined();
  });

  it('should route E2S file to E2S parser', () => {
    const buf = generateE2SWithSample(0, 'ROUTE2');
    const result = parseFile(buf, 'samples.e2sSample.all');

    expect(result.format).toBe('e2s');
    expect(result.data.samples).toBeDefined();
    expect(result.data.samples[0]).not.toBeNull();
  });

  it('should route E2PAT all-file to E2PAT parser', () => {
    const pats = [createDefaultPattern(DEVICE_E2)];
    pats[0].header.name = 'ROUTE';
    const buf = buildAllPatterns(pats, DEVICE_E2);
    const result = parseFile(buf);

    expect(result.format).toBe('e2pat');
    expect(result.data.patterns).toHaveLength(250);
  });

  it('should route EMX dump to EMX parser', () => {
    const buf = generateMinimalEMX();
    const result = parseFile(buf, 'dump.emx');

    expect(result.format).toBe('emx');
    expect(result.data.numPatterns).toBe(256);
  });

  it('should throw for unknown format', () => {
    expect(() => parseFile(Buffer.alloc(100))).toThrow('Unknown file format');
  });
});
