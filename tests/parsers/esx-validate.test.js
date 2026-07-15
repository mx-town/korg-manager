/**
 * ESX Export Validation Tests
 * validateAndRepairEsx() — pre-export check that auto-repairs unsafe
 * sample-header values (the KB1 loop-point bug class) and flags
 * file-integrity problems it cannot safely fix.
 */
'use strict';

const { validateAndRepairEsx } = require('../../src/esx-validate');
const { buildEsxFile, ADDR, SIZE, ESX_FILE_SIZE } = require('../../src/esx-format');

const CHECKSUM_ADDR = ADDR.BPS_HEADER + 0x0C;

function makeSample(name, numFrames, sampleRate = 44100) {
  const pcmData = Buffer.alloc(numFrames * 2);
  for (let i = 0; i < numFrames; i++) pcmData.writeInt16BE((i % 100) - 50, i * 2);
  return { name, pcmData, sampleRate, numFrames };
}

function buildTestFile() {
  return buildEsxFile([makeSample('KICK', 100), makeSample('SNARE', 200)]);
}

// Header offset of mono sample i
const hdr = (i) => ADDR.SAMPLE_HDR_MONO + i * SIZE.SAMPLE_HDR_MONO;

describe('ESX validate - clean file', () => {
  it('returns no issues and an unmodified buffer', () => {
    const buf = buildTestFile();
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues).toEqual([]);
    expect(Buffer.compare(buffer, buf)).toBe(0);
  });
});

describe('ESX validate - loop point (the KB1 silence bug)', () => {
  it('fixes loopStart 0xFFFFFFFF to endFrame', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(0xFFFFFFFF, hdr(0) + 24);
    const { buffer, issues } = validateAndRepairEsx(buf);
    const loop = issues.find(i => i.code === 'LOOP');
    expect(loop).toBeDefined();
    expect(loop.severity).toBe('fixed');
    expect(loop.sampleIndex).toBe(0);
    expect(buffer.readUInt32BE(hdr(0) + 24)).toBe(99); // endFrame of 100-frame sample
  });

  it('fixes loopStart beyond endFrame', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(5000, hdr(1) + 24);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'LOOP' && i.sampleIndex === 1)).toBe(true);
    expect(buffer.readUInt32BE(hdr(1) + 24)).toBe(199);
  });
});

describe('ESX validate - header trailer', () => {
  it('fixes a non-hardware trailer (old app wrote 0xFF stretch byte)', () => {
    const buf = buildTestFile();
    buf.writeUInt8(0xFF, hdr(0) + 35);
    buf.writeUInt8(0x00, hdr(0) + 36);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'TRAILER' && i.severity === 'fixed')).toBe(true);
    expect(buffer.readUInt8(hdr(0) + 35)).toBe(0x00);
    expect(buffer.readUInt8(hdr(0) + 36)).toBe(0x80);
    expect(buffer.readUInt8(hdr(0) + 37)).toBe(0x00);
    expect(buffer.readUInt8(hdr(0) + 38)).toBe(0x00);
    expect(buffer.readUInt8(hdr(0) + 39)).toBe(0x00);
  });
});

describe('ESX validate - sample rate', () => {
  it('fixes a zero sample rate to 44100', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(0, hdr(0) + 28);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'RATE' && i.severity === 'fixed')).toBe(true);
    expect(buffer.readUInt32BE(hdr(0) + 28)).toBe(44100);
  });

  it('fixes an absurd sample rate (> 192000) to 44100', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(9999999, hdr(0) + 28);
    const { buffer } = validateAndRepairEsx(buf);
    expect(buffer.readUInt32BE(hdr(0) + 28)).toBe(44100);
  });

  it('leaves a legitimate nonstandard rate (32000) alone', () => {
    const buf = buildEsxFile([makeSample('LOFI', 100, 32000)]);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'RATE')).toBe(false);
    expect(buffer.readUInt32BE(hdr(0) + 28)).toBe(32000);
  });
});

describe('ESX validate - frame counts', () => {
  it('fixes endFrame that disagrees with the PCM byte span', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(999999, hdr(0) + 20);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'FRAMES' && i.severity === 'fixed')).toBe(true);
    expect(buffer.readUInt32BE(hdr(0) + 20)).toBe(99);
  });

  it('resets startFrame greater than endFrame to 0', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(500, hdr(0) + 16);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'FRAMES')).toBe(true);
    expect(buffer.readUInt32BE(hdr(0) + 16)).toBe(0);
  });

  it('loop check uses the corrected endFrame', () => {
    const buf = buildTestFile();
    // endFrame corrupted high AND loopStart pointing at the corrupt value
    buf.writeUInt32BE(999999, hdr(0) + 20);
    buf.writeUInt32BE(999999, hdr(0) + 24);
    const { buffer } = validateAndRepairEsx(buf);
    expect(buffer.readUInt32BE(hdr(0) + 20)).toBe(99);
    expect(buffer.readUInt32BE(hdr(0) + 24)).toBe(99);
  });
});

describe('ESX validate - BPS checksum', () => {
  it('recomputes a corrupted checksum', () => {
    const buf = buildTestFile();
    const good = buf.readUInt32BE(CHECKSUM_ADDR);
    buf.writeUInt32BE((good + 1) >>> 0, CHECKSUM_ADDR);
    const { buffer, issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'CHECKSUM' && i.severity === 'fixed')).toBe(true);
    expect(buffer.readUInt32BE(CHECKSUM_ADDR)).toBe(good);
  });
});

describe('ESX validate - file integrity warnings (flag-only)', () => {
  it('flags a wrong file size without crashing or modifying', () => {
    const buf = buildTestFile().slice(0, 1000);
    const { buffer, issues } = validateAndRepairEsx(buf);
    const size = issues.find(i => i.code === 'SIZE');
    expect(size).toBeDefined();
    expect(size.severity).toBe('warning');
    expect(Buffer.compare(buffer, buf)).toBe(0);
  });

  it('flags corrupted ESX magic bytes', () => {
    const buf = buildTestFile();
    buf.write('XORG', 0, 'ascii');
    const { issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'MAGIC_ESX' && i.severity === 'warning')).toBe(true);
  });

  it('flags a corrupted BPS magic', () => {
    const buf = buildTestFile();
    buf.write('XPS ', ADDR.BPS_HEADER + 8, 'ascii');
    const { issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'MAGIC_BPS' && i.severity === 'warning')).toBe(true);
  });

  it('flags sample channel pointers that run past the sample data region', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(0x00FFFFFF, hdr(0) + 12); // ch1End way past currentOffset
    const { issues } = validateAndRepairEsx(buf);
    expect(issues.some(i => i.code === 'CHANNEL' && i.severity === 'warning' && i.sampleIndex === 0)).toBe(true);
  });
});

describe('ESX validate - idempotence', () => {
  it('re-validating a repaired file reports no issues', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(0xFFFFFFFF, hdr(0) + 24);
    buf.writeUInt8(0xFF, hdr(1) + 35);
    buf.writeUInt32BE(0, hdr(1) + 28);
    const first = validateAndRepairEsx(buf);
    expect(first.issues.length).toBeGreaterThan(0);
    const second = validateAndRepairEsx(first.buffer);
    expect(second.issues).toEqual([]);
    expect(Buffer.compare(second.buffer, first.buffer)).toBe(0);
  });
});

describe('ESX validate - issue metadata', () => {
  it('includes the sample name and a human-readable message', () => {
    const buf = buildTestFile();
    buf.writeUInt32BE(0xFFFFFFFF, hdr(0) + 24);
    const { issues } = validateAndRepairEsx(buf);
    const loop = issues.find(i => i.code === 'LOOP');
    expect(loop.sampleName).toBe('KICK');
    expect(typeof loop.message).toBe('string');
    expect(loop.message.length).toBeGreaterThan(0);
  });
});
