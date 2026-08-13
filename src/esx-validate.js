/**
 * ESX Export Validation
 * Pre-export check for .esx buffers: auto-repairs unsafe sample-header
 * values (the class of bug that silenced keyboard parts when loopStart
 * was written as 0xFFFFFFFF) and flags file-integrity problems that
 * cannot be fixed without guessing.
 *
 * validateAndRepairEsx(buffer) → { buffer, issues }
 *   buffer — repaired copy (byte-identical to input if nothing was fixed)
 *   issues — [{ severity: 'fixed'|'warning', code, message, sampleIndex?, sampleName? }]
 */

'use strict';

const { ADDR, SIZE, NUM } = require('./esx-format');

const CHECKSUM_ADDR = ADDR.BPS_HEADER + 0x0C;
const BLOCK_HEADER_SIZE = 16; // per-sample data block header before PCM
const MAX_SANE_RATE = 192000;

function validateAndRepairEsx(input) {
  const issues = [];
  const flag = (code, message, sampleIndex, sampleName) => {
    const issue = { severity: 'warning', code, message };
    if (sampleIndex != null) { issue.sampleIndex = sampleIndex; issue.sampleName = sampleName; }
    issues.push(issue);
  };
  const fixed = (code, message, sampleIndex, sampleName) => {
    const issue = { severity: 'fixed', code, message };
    if (sampleIndex != null) { issue.sampleIndex = sampleIndex; issue.sampleName = sampleName; }
    issues.push(issue);
  };

  // .esx files are variable-sized: filesize = 0x250010 + currentOffset. A file shorter
  // than the fixed header region makes every absolute offset below unreliable, so flag
  // and stop. Anything long enough to hold the headers is parsed; a size that disagrees
  // with currentOffset is reported further down, once that field can be read safely.
  if (input.length < SIZE.FILE_MIN) {
    flag('SIZE', `File is ${input.length} bytes — too short to contain the ESX header region ` +
                 `(minimum ${SIZE.FILE_MIN})`);
    return { buffer: input, issues };
  }

  const buf = Buffer.from(input); // repairs mutate a copy, never the caller's buffer

  if (buf.toString('ascii', 0, 4) !== 'KORG' || buf.toString('ascii', 8, 11) !== 'ESX') {
    flag('MAGIC_ESX', 'ESX file signature is corrupt — hardware will reject this file');
  }
  if (buf.toString('ascii', ADDR.BPS_HEADER, ADDR.BPS_HEADER + 4) !== 'KORG' ||
      buf.toString('ascii', ADDR.BPS_HEADER + 8, ADDR.BPS_HEADER + 12) !== 'BPS ') {
    flag('MAGIC_BPS', 'Sample bank (BPS) signature is corrupt');
  }

  let numMono = buf.readUInt32BE(ADDR.NUM_MONO_SAMPLES);
  const numStereo = buf.readUInt32BE(ADDR.NUM_STEREO_SAMPLES);
  if (numMono > NUM.MONO_SAMPLES) {
    flag('COUNT', `Mono sample count ${numMono} exceeds maximum ${NUM.MONO_SAMPLES}`);
    numMono = NUM.MONO_SAMPLES;
  }
  if (numStereo > NUM.STEREO_SAMPLES) {
    flag('COUNT', `Stereo sample count ${numStereo} exceeds maximum ${NUM.STEREO_SAMPLES}`);
  }

  const currentOffset = buf.readUInt32BE(ADDR.CURRENT_OFFSET);

  // Real files end right after the PCM data plus a 16-byte free-space block.
  const expectedSize = SIZE.FILE_MIN + currentOffset;
  if (input.length !== expectedSize) {
    flag('SIZE', `File is ${input.length} bytes but currentOffset ${currentOffset} implies ` +
                 `${expectedSize} (0x250010 + currentOffset)` +
                 (input.length < expectedSize ? ' — sample data is truncated' : ''));
  }

  let maxCh1End = 0;

  for (let i = 0; i < numMono; i++) {
    const h = ADDR.SAMPLE_HDR_MONO + i * SIZE.SAMPLE_HDR_MONO;
    const name = buf.toString('ascii', h, h + 8).trim();
    const ch1Start = buf.readUInt32BE(h + 8);
    const ch1End = buf.readUInt32BE(h + 12);

    // PCM pointers we cannot reconstruct — frame/loop/block checks need them
    const channelOk = ch1End > ch1Start + BLOCK_HEADER_SIZE && ch1End <= currentOffset;
    if (!channelOk) {
      flag('CHANNEL', `${name}: PCM data pointers are invalid (start ${ch1Start}, end ${ch1End}) — cannot verify sample data`, i, name);
    } else {
      maxCh1End = Math.max(maxCh1End, ch1End);
    }

    if (channelOk) {
      // Frame counts must match the PCM byte span (16-bit mono → 2 bytes/frame)
      const expectedEnd = ((ch1End - ch1Start - BLOCK_HEADER_SIZE) >> 1) - 1;
      const startFrame = buf.readUInt32BE(h + 16);
      const endFrame = buf.readUInt32BE(h + 20);
      if (endFrame !== expectedEnd || startFrame > expectedEnd) {
        buf.writeUInt32BE(expectedEnd, h + 20);
        if (startFrame > expectedEnd) buf.writeUInt32BE(0, h + 16);
        fixed('FRAMES', `${name}: start/end frame did not match sample length — corrected to 0…${expectedEnd}`, i, name);
      }

      // The KB1 silence bug: no/out-of-range loop point mutes keyboard parts
      const effectiveEnd = buf.readUInt32BE(h + 20);
      const loopStart = buf.readUInt32BE(h + 24);
      if (loopStart === 0xFFFFFFFF || loopStart > effectiveEnd) {
        buf.writeUInt32BE(effectiveEnd, h + 24);
        fixed('LOOP', `${name}: loop point missing or out of range — keyboard parts would be silent; set to end frame`, i, name);
      }
    }

    const rate = buf.readUInt32BE(h + 28);
    if (rate === 0 || rate > MAX_SANE_RATE) {
      buf.writeUInt32BE(44100, h + 28);
      fixed('RATE', `${name}: sample rate ${rate} is invalid — set to 44100 Hz`, i, name);
    }

    // Hardware-saved files always end the header with 00 80 00 00 00
    if (buf[h + 35] !== 0x00 || buf[h + 36] !== 0x80 ||
        buf[h + 37] !== 0x00 || buf[h + 38] !== 0x00 || buf[h + 39] !== 0x00) {
      buf.writeUInt8(0x00, h + 35);
      buf.writeUInt8(0x80, h + 36);
      buf.writeUInt8(0x00, h + 37);
      buf.writeUInt8(0x00, h + 38);
      buf.writeUInt8(0x00, h + 39);
      fixed('TRAILER', `${name}: header trailer did not match hardware format — corrected`, i, name);
    }

    if (channelOk) {
      // Data block header is fully derivable from the sample header
      const b = ADDR.SAMPLE_DATA + ch1Start;
      const blockOk =
        buf[b] === 0x80 && buf[b + 1] === 0x00 && buf[b + 2] === 0x7F && buf[b + 3] === 0xFF &&
        buf.readUInt32BE(b + 4) === ch1Start &&
        buf.readUInt32BE(b + 8) === ch1End &&
        buf.readUInt8(b + 12) === i &&
        buf.readUInt8(b + 13) === 0x00 &&
        buf.readUInt16BE(b + 14) === 0xFFFF;
      if (!blockOk) {
        buf.writeUInt8(0x80, b); buf.writeUInt8(0x00, b + 1);
        buf.writeUInt8(0x7F, b + 2); buf.writeUInt8(0xFF, b + 3);
        buf.writeUInt32BE(ch1Start, b + 4);
        buf.writeUInt32BE(ch1End, b + 8);
        buf.writeUInt8(i, b + 12);
        buf.writeUInt8(0x00, b + 13);
        buf.writeUInt16BE(0xFFFF, b + 14);
        fixed('BLOCK', `${name}: PCM block header was corrupt — rebuilt`, i, name);
      }
    }
  }

  // CURRENT_OFFSET must cover all sample data (builder always pads to 4-byte alignment)
  let effectiveOffset = currentOffset;
  if (currentOffset < maxCh1End) {
    effectiveOffset = (maxCh1End + 4) & ~3;
    buf.writeUInt32BE(effectiveOffset, ADDR.CURRENT_OFFSET);
    fixed('OFFSET', `Sample data end marker (${currentOffset}) was before the last sample — corrected to ${effectiveOffset}`);
  }

  // BPS checksum: byte-sum of the used sample data region (after any block repairs)
  let checksum = 0;
  const regionEnd = Math.min(ADDR.SAMPLE_DATA + effectiveOffset, buf.length);
  for (let p = ADDR.SAMPLE_DATA; p < regionEnd; p++) checksum = (checksum + buf[p]) >>> 0;
  if (buf.readUInt32BE(CHECKSUM_ADDR) !== checksum) {
    buf.writeUInt32BE(checksum, CHECKSUM_ADDR);
    fixed('CHECKSUM', 'Sample bank checksum did not match sample data — recomputed');
  }

  return { buffer: buf, issues };
}

module.exports = { validateAndRepairEsx, CHECKSUM_ADDR };
