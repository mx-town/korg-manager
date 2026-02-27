/**
 * ESX Format Builder
 * Creates and manipulates Korg Electribe ESX-1 .esx binary files.
 * Based on reverse-engineered format from open-electribe-editor & lammas/electribe.
 */

'use strict';

// ── Constants ──────────────────────────────────────────────
const ADDR = {
  HEADER:               0x00000000,   // "KORG....ESX" signature (32 bytes)
  GLOBAL_PARAMS:        0x00000020,   // Global parameters (192 bytes)
  PATTERN_DATA:         0x00000200,   // 256 patterns × 4280 bytes
  SONG_DATA:            0x00130000,   // 64 songs × 528 bytes
  SONG_EVENTS:          0x00138400,   // 20000 events × 8 bytes
  BPS_HEADER:           0x001B0000,   // "KORG....BPX" signature (32 bytes)
  NUM_MONO_SAMPLES:     0x001B0020,   // uint32BE
  NUM_STEREO_SAMPLES:   0x001B0024,   // uint32BE
  CURRENT_OFFSET:       0x001B0028,   // uint32BE
  SAMPLE_HDR_MONO:      0x001B0100,   // 256 × 40 bytes
  SAMPLE_HDR_STEREO:    0x001B2900,   // 128 × 44 bytes
  SLICE_DATA:           0x001B4200,   // 256 × 2048 bytes
  SAMPLE_DATA:          0x00250000,   // PCM sample data starts here
};

const SIZE = {
  HEADER: 32,
  SAMPLE_HDR_MONO: 40,
  SAMPLE_HDR_STEREO: 44,
  FILE_MIN: 0x00250010,              // Minimum .esx file size (no samples)
  MAX_SAMPLE_BYTES: 0xC00000 * 2,    // ~25MB max sample memory
};

const NUM = {
  MONO_SAMPLES: 256,
  STEREO_SAMPLES: 128,
  PATTERNS: 256,
  SONGS: 64,
};

// ESX file header — bytes 0x0C-0x11 are format version constants required by hardware
const ESX_HEADER = Buffer.from([
  0x4B, 0x4F, 0x52, 0x47, // "KORG"
  0x00, 0x00, 0x00, 0x71, // version marker
  0x45, 0x53, 0x58, 0x00, // "ESX\0"
  0x05, 0x26, 0x79, 0xA4, // format version (must match for hardware)
  0x00, 0x01, 0x00, 0x00, // flags (0x0001 = has data)
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

// BPS (sample bank) header — "BPS " matches factory file
const BPS_HEADER = Buffer.from([
  0x4B, 0x4F, 0x52, 0x47, // "KORG"
  0x00, 0x00, 0x00, 0x71, // version marker
  0x42, 0x50, 0x53, 0x20, // "BPS " (factory format)
  0x00, 0x00, 0x00, 0x00, // checksum (filled at build time)
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

// PCM data block signature
const PCM_SIG = Buffer.from([0x80, 0x00, 0x7F, 0xFF]);

// ── WAV Parser ─────────────────────────────────────────────

function parseWavFile(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (buffer.length < 12) {
    throw new Error(`Not a valid WAV file (too small: ${buffer.length} bytes)`);
  }

  // Check RIFF header
  const riff = buffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    const hex = buffer.slice(0, Math.min(8, buffer.length)).toString('hex').match(/../g).join(' ');
    throw new Error(`Not a valid WAV file (expected RIFF header, got bytes: ${hex})`);
  }

  const wave = buffer.toString('ascii', 8, 12);
  if (wave !== 'WAVE') {
    throw new Error(`Not a valid WAV file (expected WAVE format, got "${wave}")`);
  }

  let offset = 12;
  let fmt = null;
  let dataChunk = null;

  // Parse chunks
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true); // little-endian
    offset += 8;

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(offset, true),
        numChannels: view.getUint16(offset + 2, true),
        sampleRate: view.getUint32(offset + 4, true),
        byteRate: view.getUint32(offset + 8, true),
        blockAlign: view.getUint16(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 14, true),
      };
    } else if (chunkId === 'data') {
      dataChunk = buffer.slice(offset, offset + chunkSize);
    }

    offset += chunkSize;
    // Chunks are word-aligned
    if (chunkSize % 2 !== 0) offset++;
  }

  if (!fmt) throw new Error('WAV file missing fmt chunk');
  if (!dataChunk) throw new Error('WAV file missing data chunk');
  if (fmt.audioFormat !== 1 && fmt.audioFormat !== 3) {
    throw new Error(`Unsupported WAV format (audioFormat=${fmt.audioFormat}). Only PCM (1) and IEEE float (3) are supported.`);
  }

  return { fmt, data: dataChunk };
}

/**
 * Convert WAV PCM data to 16-bit signed mono at the desired sample rate.
 * Simple conversion: just handles common cases.
 */
function convertTo16BitMono(wavInfo) {
  const { fmt, data } = wavInfo;
  const { numChannels, bitsPerSample, sampleRate, audioFormat } = fmt;

  // Calculate number of frames
  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * numChannels;
  const numFrames = Math.floor(data.length / frameSize);

  // First: decode to float samples (mono-mixed)
  const floatSamples = new Float32Array(numFrames);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i < numFrames; i++) {
    let sample = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const byteOffset = i * frameSize + ch * bytesPerSample;

      if (audioFormat === 3) {
        // IEEE float
        if (bitsPerSample === 32) {
          sample += view.getFloat32(byteOffset, true);
        } else if (bitsPerSample === 64) {
          sample += view.getFloat64(byteOffset, true);
        }
      } else {
        // PCM integer
        if (bitsPerSample === 8) {
          sample += (data[byteOffset] - 128) / 128;
        } else if (bitsPerSample === 16) {
          sample += view.getInt16(byteOffset, true) / 32768;
        } else if (bitsPerSample === 24) {
          const b0 = data[byteOffset];
          const b1 = data[byteOffset + 1];
          const b2 = data[byteOffset + 2];
          let val = (b2 << 16) | (b1 << 8) | b0;
          if (val >= 0x800000) val -= 0x1000000;
          sample += val / 8388608;
        } else if (bitsPerSample === 32) {
          sample += view.getInt32(byteOffset, true) / 2147483648;
        }
      }
    }
    floatSamples[i] = sample / numChannels;
  }

  // Resample to 44100 if needed (simple linear interpolation)
  let resampledFloat;
  let outputSampleRate = sampleRate;

  if (sampleRate !== 44100 && sampleRate !== 22050 && sampleRate !== 11025) {
    // Resample to 44100
    outputSampleRate = 44100;
    const ratio = sampleRate / 44100;
    const newLength = Math.floor(numFrames / ratio);
    resampledFloat = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcPos = i * ratio;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      const s0 = floatSamples[Math.min(srcIdx, numFrames - 1)];
      const s1 = floatSamples[Math.min(srcIdx + 1, numFrames - 1)];
      resampledFloat[i] = s0 + frac * (s1 - s0);
    }
  } else {
    resampledFloat = floatSamples;
    outputSampleRate = sampleRate;
  }

  // Convert to 16-bit signed PCM (big-endian for ESX)
  const pcmBuffer = Buffer.alloc(resampledFloat.length * 2);
  for (let i = 0; i < resampledFloat.length; i++) {
    let val = Math.round(resampledFloat[i] * 32767);
    val = Math.max(-32768, Math.min(32767, val));
    pcmBuffer.writeInt16BE(val, i * 2);
  }

  return {
    pcmData: pcmBuffer,
    sampleRate: outputSampleRate,
    numFrames: resampledFloat.length,
    durationSeconds: resampledFloat.length / outputSampleRate,
  };
}

// ── ESX File Builder ───────────────────────────────────────

/**
 * Initialize a single drum part (34 bytes) with default values.
 * Offset: offset within the pattern where this drum part starts
 */
// Init drum part — matches factory "Init" pattern (pattern 200 in ESX1_Fact.ESX)
function initDrumPart(buffer, offset) {
  // +0-1: samplepointer = 0x0000 (sample 0, factory default)
  buffer.writeUInt16BE(0x0000, offset + 0);
  // +2-3: slicenumber = 0x8000 (factory default)
  buffer.writeUInt16BE(0x8000, offset + 2);
  // +4: filtertype = 0x00 (LPF)
  buffer.writeUInt8(0x00, offset + 4);
  // +5: cutoff = 0x7F (open)
  buffer.writeUInt8(0x7F, offset + 5);
  // +6: resonance = 0x00
  buffer.writeUInt8(0x00, offset + 6);
  // +7: egint = 0x40 (center)
  buffer.writeUInt8(0x40, offset + 7);
  // +8: pitch = 0x40 (center/equal)
  buffer.writeUInt8(0x40, offset + 8);
  // +9: level = 0x64 (factory default)
  buffer.writeUInt8(0x64, offset + 9);
  // +10: pan = 0x40 (center)
  buffer.writeUInt8(0x40, offset + 10);
  // +11: egtime = 0x7F (factory default)
  buffer.writeUInt8(0x7F, offset + 11);
  // +12: startpoint = 0x00
  buffer.writeUInt8(0x00, offset + 12);
  // +13: fxflags = 0x00 (all off)
  buffer.writeUInt8(0x00, offset + 13);
  // +14: modflags = 0x20 (factory default)
  buffer.writeUInt8(0x20, offset + 14);
  // +15: modspeed = 0x40 (factory default)
  buffer.writeUInt8(0x40, offset + 15);
  // +16: moddepth = 0x40 (center)
  buffer.writeUInt8(0x40, offset + 16);
  // +17: motionseqstatus = 0x00
  buffer.writeUInt8(0x00, offset + 17);
  // +18-33: sequencedata = 16x 0x00 (no steps — user programs manually)
  for (let i = 0; i < 16; i++) {
    buffer.writeUInt8(0x00, offset + 18 + i);
  }
}

/**
 * Initialize a keyboard part (274 bytes) with factory Init defaults.
 * Layout: 18-byte header + 128 note bytes + 128 gate bytes
 * Note byte 0xBC = OFF at C4 (bit7=OFF, bits0-6=0x3C=C4)
 */
function initKeyboardPart(buffer, offset) {
  buffer.writeUInt16BE(0x0000, offset + 0);  // samplepointer (sample 0)
  buffer.writeUInt8(0x00, offset + 2);       // slice
  buffer.writeUInt8(0x00, offset + 3);       // reserved
  buffer.writeUInt8(0x00, offset + 4);       // glide
  buffer.writeUInt8(0x00, offset + 5);       // filtertype (LPF)
  buffer.writeUInt8(0x7F, offset + 6);       // cutoff (open)
  buffer.writeUInt8(0x00, offset + 7);       // resonance
  buffer.writeUInt8(0x40, offset + 8);       // egint (center)
  buffer.writeUInt8(0x64, offset + 9);       // level (factory default)
  buffer.writeUInt8(0x40, offset + 10);      // pan (center)
  buffer.writeUInt8(0x40, offset + 11);      // egtime
  buffer.writeUInt8(0x00, offset + 12);      // startpoint
  buffer.writeUInt8(0x00, offset + 13);      // flags
  buffer.writeUInt8(0x20, offset + 14);      // modflags (factory default)
  buffer.writeUInt8(0x40, offset + 15);      // modspeed
  buffer.writeUInt8(0x40, offset + 16);      // moddepth (center)
  buffer.writeUInt8(0x00, offset + 17);      // motionseq off
  // Note bytes: 128 × 0xBC (all steps OFF, default note C4)
  buffer.fill(0xBC, offset + 18, offset + 146);
  // Gate bytes: 128 × 0x02 (default gate time)
  buffer.fill(0x02, offset + 146, offset + 274);
}

/**
 * Initialize a stretch/slice part (32 bytes) with factory Init defaults.
 * Layout: 16-byte header + 16-byte step data (like drum but no slice field)
 */
function initStretchPart(buffer, offset) {
  buffer.writeUInt16BE(0x0000, offset + 0);  // samplepointer (sample 0)
  buffer.writeUInt8(0x00, offset + 2);       // filtertype (LPF)
  buffer.writeUInt8(0x7F, offset + 3);       // cutoff (open)
  buffer.writeUInt8(0x00, offset + 4);       // resonance
  buffer.writeUInt8(0x40, offset + 5);       // egint (center)
  buffer.writeUInt8(0x40, offset + 6);       // pitch (center)
  buffer.writeUInt8(0x64, offset + 7);       // level (factory default)
  buffer.writeUInt8(0x40, offset + 8);       // pan (center)
  buffer.writeUInt8(0x7F, offset + 9);       // egtime (factory default)
  buffer.writeUInt8(0x00, offset + 10);      // startpoint
  buffer.writeUInt8(0x00, offset + 11);      // flags
  buffer.writeUInt8(0x20, offset + 12);      // modflags (factory default)
  buffer.writeUInt8(0x40, offset + 13);      // modspeed
  buffer.writeUInt8(0x40, offset + 14);      // moddepth (center)
  buffer.writeUInt8(0x00, offset + 15);      // motionseq off
  // Step data: 16 × 0x00 (no active steps)
  buffer.fill(0x00, offset + 16, offset + 32);
}

/**
 * Initialize the audio-in part (156 bytes) with factory Init defaults.
 * Layout: 12-byte header + 16-byte steps + 128-byte gate data
 */
function initAudioInPart(buffer, offset) {
  buffer.writeUInt8(0x00, offset + 0);       // filtertype (LPF)
  buffer.writeUInt8(0x7F, offset + 1);       // cutoff (open)
  buffer.writeUInt8(0x00, offset + 2);       // resonance
  buffer.writeUInt8(0x40, offset + 3);       // egint (center)
  buffer.writeUInt8(0x64, offset + 4);       // level (factory default)
  buffer.writeUInt8(0x40, offset + 5);       // pan (center)
  buffer.writeUInt8(0x40, offset + 6);       // egtime
  buffer.writeUInt8(0x00, offset + 7);       // flags
  buffer.writeUInt8(0x21, offset + 8);       // modcfg (factory: 0x21)
  buffer.writeUInt8(0x40, offset + 9);       // modspeed
  buffer.writeUInt8(0x40, offset + 10);      // moddepth (center)
  buffer.writeUInt8(0x00, offset + 11);      // motionseq off
  // Steps: 16 × 0x00 (no active steps)
  buffer.fill(0x00, offset + 12, offset + 28);
  // Gate bytes: 128 × 0x02 (default gate time)
  buffer.fill(0x02, offset + 28, offset + 156);
}

/**
 * Initialize the accent part (18 bytes) with factory Init defaults.
 */
function initAccentPart(buffer, offset) {
  buffer.writeUInt8(0x40, offset + 0);       // level
  buffer.writeUInt8(0x00, offset + 1);       // reserved
  // Steps: 16 × 0xFF (factory default)
  buffer.fill(0xFF, offset + 2, offset + 18);
}

/**
 * Initialize FX params (3 × 4 bytes) with factory Init defaults.
 */
function initFxParams(buffer, offset) {
  for (let i = 0; i < 3; i++) {
    const fx = offset + i * 4;
    buffer.writeUInt8(0x01, fx + 0);         // type (factory default)
    buffer.writeUInt8(0x40, fx + 1);         // param1
    buffer.writeUInt8(0x40, fx + 2);         // param2
    buffer.writeUInt8(0x00, fx + 3);         // param3
  }
}

/**
 * Initialize motion sequences (24 × 130 bytes) with factory Init defaults.
 * Each: uint16BE opNum=0xFFFF (disabled) + 128 × 0x80
 */
function initMotionSeqs(buffer, offset) {
  for (let i = 0; i < 24; i++) {
    const ms = offset + i * 130;
    buffer.writeUInt16BE(0xFFFF, ms);        // opNum (disabled)
    buffer.fill(0x80, ms + 2, ms + 130);    // 128 × 0x80
  }
}

/**
 * Initialize a single pattern (4280 bytes) with default values.
 * Matches factory "Init" pattern (pattern 200 in ESX1_Fact.ESX).
 *
 * Layout:
 *   [0-23]     Pattern header (24 bytes)
 *   [24-329]   9 Drum Parts (9 × 34 = 306 bytes)
 *   [330-603]  Keyboard Part 1 (274 bytes)
 *   [604-877]  Keyboard Part 2 (274 bytes)
 *   [878-909]  Stretch Part 1 (32 bytes)
 *   [910-941]  Stretch Part 2 (32 bytes)
 *   [942-973]  Slice Part (32 bytes)
 *   [974-1129] Audio In Part (156 bytes)
 *   [1130-1147] Accent Part (18 bytes)
 *   [1148-1159] FX Params (3 × 4 = 12 bytes)
 *   [1160-4279] Motion Sequences (24 × 130 = 3120 bytes)
 */
function initDefaultPattern(buffer, patternOffset) {
  // +0-7: name = "Init    " (space-padded, factory default)
  buffer.write('Init    ', patternOffset, 'ascii');

  // +8-9: tempo = 0x3C00 (120.0 BPM, encoding: BPM × 128)
  buffer.writeUInt16BE(0x3C00, patternOffset + 8);

  // +10: swing = 0x00 (50%)
  buffer.writeUInt8(0x00, patternOffset + 10);

  // +11: flags = 0x00
  buffer.writeUInt8(0x00, patternOffset + 11);

  // +12: fxchain = 0x00 (None)
  buffer.writeUInt8(0x00, patternOffset + 12);

  // +13: laststep = 0x0F (Step 16)
  buffer.writeUInt8(0x0F, patternOffset + 13);

  // +14: arpflags = 0x00
  buffer.writeUInt8(0x00, patternOffset + 14);

  // +15: arpcenternote = 0x3C (C4)
  buffer.writeUInt8(0x3C, patternOffset + 15);

  // +16-17: mutestatus = 0x0000 (none muted)
  buffer.writeUInt16BE(0x0000, patternOffset + 16);

  // +18-19: swingstatus = 0x7FFF (factory default — all parts)
  buffer.writeUInt16BE(0x7FFF, patternOffset + 18);

  // +20-21: outputbusstatus = 0x7FFF (factory default)
  buffer.writeUInt16BE(0x7FFF, patternOffset + 20);

  // +22-23: accentstatus = 0x7FFF (factory default)
  buffer.writeUInt16BE(0x7FFF, patternOffset + 22);

  // 9 Drum Parts (offset 24, each 34 bytes)
  for (let i = 0; i < 9; i++) {
    initDrumPart(buffer, patternOffset + 24 + i * 34);
  }

  // 2 Keyboard Parts (offset 330 and 604, each 274 bytes)
  initKeyboardPart(buffer, patternOffset + 330);
  initKeyboardPart(buffer, patternOffset + 604);

  // 2 Stretch Parts + 1 Slice Part (offset 878, 910, 942, each 32 bytes)
  initStretchPart(buffer, patternOffset + 878);
  initStretchPart(buffer, patternOffset + 910);
  initStretchPart(buffer, patternOffset + 942);

  // Audio In Part (offset 974, 156 bytes)
  initAudioInPart(buffer, patternOffset + 974);

  // Accent Part (offset 1130, 18 bytes)
  initAccentPart(buffer, patternOffset + 1130);

  // FX Params (offset 1148, 3 × 4 bytes)
  initFxParams(buffer, patternOffset + 1148);

  // Motion Sequences (offset 1160, 24 × 130 bytes)
  initMotionSeqs(buffer, patternOffset + 1160);
}

/**
 * Initialize a single song (528 bytes) with default values.
 */
function initDefaultSong(buffer, songOffset) {
  // +0-7: name = 8x 0x00 (empty)
  for (let i = 0; i < 8; i++) {
    buffer.writeUInt8(0x00, songOffset + i);
  }

  // +8-9: tempo = 0x3C00 (120.0 BPM, uint16BE)
  buffer.writeUInt16BE(0x3C00, songOffset + 8);

  // +10: tempolock = 0x00 (disabled)
  buffer.writeUInt8(0x00, songOffset + 10);

  // +11: length = 0x00 (minimum length)
  buffer.writeUInt8(0x00, songOffset + 11);

  // +12: mutehold = 0x00 (disabled)
  buffer.writeUInt8(0x00, songOffset + 12);

  // +13: nextsongnumber = 0x00 (OFF)
  buffer.writeUInt8(0x00, songOffset + 13);

  // +14-15: numsongevents = 0x0000 (uint16BE)
  buffer.writeUInt16BE(0x0000, songOffset + 14);

  // Rest (offset 16+) stays zero-initialized
}

/**
 * Create an empty ESX file structure with proper defaults for patterns and songs.
 */
function createEmptyEsx() {
  // Start with minimum size
  const buffer = Buffer.alloc(SIZE.FILE_MIN, 0);

  // Write main header at offset 0
  ESX_HEADER.copy(buffer, ADDR.HEADER);

  // ════ Global Parameters (192 bytes at offset 0x20) ════
  // Based on factory file analysis at offset 0x24:
  // 0x00: memoryProtect = 0x00 (disabled)
  // 0x01: unknown = 0x00
  // 0x02: arpeggiatorControl = 0x00 (NORMAL)
  // 0x03: audioInMode = 0x00 (MONO)
  // 0x04: midiClock = 0x00 (INT) ← THIS WAS THE BUG!
  // 0x05: bitflags = 0x0F (all MIDI messages enabled)
  buffer.writeUInt8(0x00, ADDR.GLOBAL_PARAMS + 0x00); // memoryProtect
  buffer.writeUInt8(0x00, ADDR.GLOBAL_PARAMS + 0x01); // unknown
  buffer.writeUInt8(0x00, ADDR.GLOBAL_PARAMS + 0x02); // arpeggiatorControl
  buffer.writeUInt8(0x00, ADDR.GLOBAL_PARAMS + 0x03); // audioInMode
  buffer.writeUInt8(0x00, ADDR.GLOBAL_PARAMS + 0x04); // midiClock (INT)
  buffer.writeUInt8(0x0F, ADDR.GLOBAL_PARAMS + 0x05); // bitflags (note, sysex, cc, pc)

  // Remaining global params are zero-initialized

  // ════ Initialize all 256 Patterns ════
  for (let p = 0; p < NUM.PATTERNS; p++) {
    const patternOffset = ADDR.PATTERN_DATA + p * 4280;
    initDefaultPattern(buffer, patternOffset);
  }

  // ════ Initialize all 64 Songs ════
  for (let s = 0; s < NUM.SONGS; s++) {
    const songOffset = ADDR.SONG_DATA + s * 528;
    initDefaultSong(buffer, songOffset);
  }

  // Write BPS header at sample section
  BPS_HEADER.copy(buffer, ADDR.BPS_HEADER);

  // Initialize all mono sample headers to "empty" — matches factory file exactly
  // Factory empty slot: name=spaces, ch1Start=0xFFFFFFFF, rest=zeros except rate=44100, byte36=0x80
  for (let i = 0; i < NUM.MONO_SAMPLES; i++) {
    const off = ADDR.SAMPLE_HDR_MONO + i * SIZE.SAMPLE_HDR_MONO;
    // Name: 8 bytes of 0x20 (spaces, factory default for empty)
    buffer.fill(0x20, off, off + 8);
    // offsetchannel1start: 0xFFFFFFFF (empty marker)
    buffer.writeUInt32BE(0xFFFFFFFF, off + 8);
    // offsetchannel1end: 0x00000000 (factory default)
    buffer.writeUInt32BE(0x00000000, off + 12);
    // start: 0x00000000
    buffer.writeUInt32BE(0x00000000, off + 16);
    // end: 0x00000000
    buffer.writeUInt32BE(0x00000000, off + 20);
    // loopstart: 0x00000000 (factory default for empty)
    buffer.writeUInt32BE(0x00000000, off + 24);
    // samplerate: 44100
    buffer.writeUInt32BE(44100, off + 28);
    // sampletune: 0x0000
    buffer.writeUInt16BE(0x0000, off + 32);
    // playlevel: 0x00
    buffer.writeUInt8(0x00, off + 34);
    // stretchstep: 0x80 (factory default for empty slot)
    buffer.writeUInt8(0x00, off + 35);
    buffer.writeUInt8(0x80, off + 36);
    buffer.writeUInt8(0x00, off + 37);
    buffer.writeUInt8(0x00, off + 38);
    buffer.writeUInt8(0x00, off + 39);
  }

  // Initialize all stereo sample headers to "empty"
  for (let i = 0; i < NUM.STEREO_SAMPLES; i++) {
    const off = ADDR.SAMPLE_HDR_STEREO + i * SIZE.SAMPLE_HDR_STEREO;
    buffer.fill(0x20, off, off + 8);
    buffer.writeUInt32BE(0xFFFFFFFF, off + 8);
    buffer.writeUInt32BE(0x00000000, off + 12);
    buffer.writeUInt32BE(0xFFFFFFFF, off + 16);
    buffer.writeUInt32BE(0x00000000, off + 20);
    buffer.writeUInt32BE(0x00000000, off + 24);
    buffer.writeUInt32BE(0x00000000, off + 28);
    buffer.writeUInt32BE(44100, off + 32);
    buffer.writeUInt16BE(0x0000, off + 36);
    buffer.writeUInt8(0x00, off + 38);
    buffer.writeUInt8(0x00, off + 39);
    buffer.writeUInt8(0x80, off + 40);
    buffer.writeUInt8(0x00, off + 41);
    buffer.writeUInt8(0x00, off + 42);
    buffer.writeUInt8(0x00, off + 43);
  }

  // Initialize counters
  buffer.writeUInt32BE(0, ADDR.NUM_MONO_SAMPLES);
  buffer.writeUInt32BE(0, ADDR.NUM_STEREO_SAMPLES);
  buffer.writeUInt32BE(0, ADDR.CURRENT_OFFSET);

  // Write the small header at sample data start
  // First 16 bytes of sample data area are a header
  buffer.writeUInt32BE(0x00000000, ADDR.SAMPLE_DATA);
  buffer.writeUInt32BE(0x00000000, ADDR.SAMPLE_DATA + 4);
  buffer.writeUInt32BE(0x00000000, ADDR.SAMPLE_DATA + 8);
  buffer.writeUInt32BE(0x00000000, ADDR.SAMPLE_DATA + 12);

  return buffer;
}

/**
 * Build a PCM data block for a mono sample.
 * Returns: Buffer containing 16-byte header + PCM data
 */
function buildSampleDataBlock(pcmData, sampleIndex, startOffset) {
  const blockSize = 16 + pcmData.length;
  const block = Buffer.alloc(blockSize);

  // Signature
  PCM_SIG.copy(block, 0);
  // Start offset
  block.writeUInt32BE(startOffset, 4);
  // End offset
  block.writeUInt32BE(startOffset + blockSize, 8);
  // Index
  block.writeUInt8(sampleIndex, 12);
  // Zero
  block.writeUInt8(0x00, 13);
  // 0xFFFF
  block.writeUInt16BE(0xFFFF, 14);
  // PCM data
  pcmData.copy(block, 16);

  return block;
}

/**
 * Encode a sample name to 8-byte ESX string format.
 */
function encodeSampleName(name) {
  const buf = Buffer.alloc(8, 0x20); // pad with spaces (hardware expects 0x20, not 0x00)
  const ascii = name.toUpperCase().replace(/[^A-Z0-9 _\-\.]/g, '').substring(0, 8);
  buf.write(ascii, 0, 'ascii');
  return buf;
}

/**
 * Build a complete ESX file from a list of samples.
 *
 * @param {Array} samples - Array of { name, pcmData, sampleRate, numFrames }
 * @returns {Buffer} Complete .esx file
 */
function buildEsxFile(samples) {
  // Start with empty ESX
  const headerBuffer = createEmptyEsx();

  // Collect all sample data blocks (with 4-byte alignment padding)
  const dataBlocks = [];
  let currentOffset = 0;
  let monoCount = 0;

  for (let i = 0; i < samples.length && i < NUM.MONO_SAMPLES; i++) {
    const sample = samples[i];
    if (!sample || !sample.pcmData || sample.pcmData.length === 0) continue;

    const blockSize = 16 + sample.pcmData.length;
    const block = buildSampleDataBlock(sample.pcmData, monoCount, currentOffset);

    // Update mono sample header
    const hdrOff = ADDR.SAMPLE_HDR_MONO + monoCount * SIZE.SAMPLE_HDR_MONO;

    // Name (space-padded)
    encodeSampleName(sample.name).copy(headerBuffer, hdrOff);

    // Channel offsets (include the 16-byte per-sample header)
    headerBuffer.writeUInt32BE(currentOffset, hdrOff + 8);  // offsetchannel1start
    headerBuffer.writeUInt32BE(currentOffset + blockSize, hdrOff + 12); // offsetchannel1end

    // Sample start/end (in frames, relative to the PCM data within the block)
    headerBuffer.writeUInt32BE(0, hdrOff + 16);  // start frame
    headerBuffer.writeUInt32BE(sample.numFrames - 1, hdrOff + 20); // end frame

    // Loop start — preserve if provided, otherwise no loop
    const loopVal = (sample.loopStart != null && sample.loopStart !== null)
      ? sample.loopStart : 0xFFFFFFFF;
    headerBuffer.writeUInt32BE(loopVal, hdrOff + 24);

    // Sample rate
    headerBuffer.writeUInt32BE(sample.sampleRate, hdrOff + 28);

    // Sample tune — preserve if provided
    headerBuffer.writeUInt16BE(sample.sampleTune || 0x0000, hdrOff + 32);

    // Play level — preserve if provided
    headerBuffer.writeUInt8(sample.playLevel || 0x00, hdrOff + 34);

    // Stretch step = 0xFF (off, hardware default)
    headerBuffer.writeUInt8(0xFF, hdrOff + 36);

    dataBlocks.push(block);
    currentOffset += blockSize;

    // Add 4-byte-aligned padding between blocks (hardware requirement)
    // Formula: next block starts at ((currentOffset + 3) & ~3) + (currentOffset % 4 === 0 ? 4 : 0)
    // Simplified: nextStart = (currentOffset + 4) & ~3
    const nextAligned = (currentOffset + 4) & ~3;
    const padSize = nextAligned - currentOffset;
    if (padSize > 0) {
      dataBlocks.push(Buffer.alloc(padSize, 0));
      currentOffset = nextAligned;
    }

    monoCount++;
  }

  // Update counters in header
  headerBuffer.writeUInt32BE(monoCount, ADDR.NUM_MONO_SAMPLES);
  headerBuffer.writeUInt32BE(0, ADDR.NUM_STEREO_SAMPLES);
  headerBuffer.writeUInt32BE(currentOffset, ADDR.CURRENT_OFFSET);

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
        // Only Part 0 gets active steps (like factory Init pattern)
        if (p === 0) {
          for (let s = 0; s < 16; s++) {
            headerBuffer.writeUInt8(0x11, partOff + 18 + s);
          }
        }
      }
    }
  }

  // Compute BPS checksum (sum of all sample data bytes)
  let checksum = 0;
  for (const block of dataBlocks) {
    for (let i = 0; i < block.length; i++) checksum = (checksum + block[i]) >>> 0;
  }
  headerBuffer.writeUInt32BE(checksum, ADDR.BPS_HEADER + 0x0C);

  // Combine header + sample data
  const sampleDataBuffer = Buffer.concat(dataBlocks);
  const totalSize = SIZE.FILE_MIN + sampleDataBuffer.length;

  const finalBuffer = Buffer.alloc(totalSize, 0);
  headerBuffer.copy(finalBuffer, 0);
  sampleDataBuffer.copy(finalBuffer, ADDR.SAMPLE_DATA);

  return finalBuffer;
}

/**
 * Parse an existing ESX file and extract sample info.
 */
function parseEsxFile(buffer) {
  const samples = [];

  // Verify header
  const sig = buffer.toString('ascii', 0, 4);
  if (sig !== 'KORG') {
    throw new Error('Not a valid ESX file (missing KORG signature)');
  }

  const numMono = buffer.readUInt32BE(ADDR.NUM_MONO_SAMPLES);
  const numStereo = buffer.readUInt32BE(ADDR.NUM_STEREO_SAMPLES);
  const currentOffset = buffer.readUInt32BE(ADDR.CURRENT_OFFSET);

  // Read mono samples
  for (let i = 0; i < NUM.MONO_SAMPLES; i++) {
    const hdrOff = ADDR.SAMPLE_HDR_MONO + i * SIZE.SAMPLE_HDR_MONO;

    const ch1Start = buffer.readUInt32BE(hdrOff + 8);
    const ch1End = buffer.readUInt32BE(hdrOff + 12);

    if (ch1Start === 0xFFFFFFFF || ch1End === 0xFFFFFFFF || ch1Start >= ch1End) {
      samples.push(null);
      continue;
    }

    const nameBytes = buffer.slice(hdrOff, hdrOff + 8);
    let name = '';
    for (let j = 0; j < 8; j++) {
      if (nameBytes[j] === 0) break;
      name += String.fromCharCode(nameBytes[j]);
    }

    const startFrame = buffer.readUInt32BE(hdrOff + 16);
    const endFrame = buffer.readUInt32BE(hdrOff + 20);
    const loopStart = buffer.readUInt32BE(hdrOff + 24);
    const sampleRate = buffer.readUInt32BE(hdrOff + 28);
    const sampleTune = buffer.readUInt16BE(hdrOff + 32);
    const playLevel = buffer.readUInt8(hdrOff + 34);

    // Extract PCM data
    const dataStart = ADDR.SAMPLE_DATA + ch1Start + 16; // skip 16-byte block header
    const dataEnd = ADDR.SAMPLE_DATA + ch1End;
    let pcmData = null;
    if (dataEnd <= buffer.length && dataStart < dataEnd) {
      pcmData = buffer.slice(dataStart, dataEnd);
    }

    const numFrames = endFrame - startFrame + 1;
    const duration = numFrames / sampleRate;

    samples.push({
      index: i,
      type: 'mono',
      name: name.trim() || `Sample ${i + 1}`,
      sampleRate,
      numFrames,
      duration,
      loopStart: loopStart === 0xFFFFFFFF ? null : loopStart,
      sampleTune,
      playLevel,
      startFrame,
      endFrame,
      pcmData,
      dataSize: ch1End - ch1Start,
    });
  }

  // Read stereo sample headers
  const stereoSamples = [];
  for (let i = 0; i < NUM.STEREO_SAMPLES; i++) {
    const hdrOff = ADDR.SAMPLE_HDR_STEREO + i * SIZE.SAMPLE_HDR_STEREO;

    const ch1Start = buffer.readUInt32BE(hdrOff + 8);
    const ch1End = buffer.readUInt32BE(hdrOff + 12);
    const ch2Start = buffer.readUInt32BE(hdrOff + 16);
    const ch2End = buffer.readUInt32BE(hdrOff + 20);

    if (ch1Start === 0xFFFFFFFF || ch1End === 0xFFFFFFFF) {
      stereoSamples.push(null);
      continue;
    }

    const nameBytes = buffer.slice(hdrOff, hdrOff + 8);
    let name = '';
    for (let j = 0; j < 8; j++) {
      if (nameBytes[j] === 0) break;
      name += String.fromCharCode(nameBytes[j]);
    }

    const startFrame = buffer.readUInt32BE(hdrOff + 24);
    const endFrame = buffer.readUInt32BE(hdrOff + 28);
    const sampleRate = buffer.readUInt32BE(hdrOff + 32);

    const numFrames = endFrame - startFrame + 1;
    const duration = numFrames / sampleRate;

    stereoSamples.push({
      index: i,
      type: 'stereo',
      name: name.trim() || `Stereo ${i + 1}`,
      sampleRate,
      numFrames,
      duration,
      startFrame,
      endFrame,
      dataSize: (ch1End - ch1Start) + (ch2End - ch2Start),
    });
  }

  return {
    numMono,
    numStereo,
    currentOffset,
    totalSampleBytes: currentOffset,
    maxSampleBytes: SIZE.MAX_SAMPLE_BYTES,
    usedPercent: ((currentOffset / SIZE.MAX_SAMPLE_BYTES) * 100).toFixed(1),
    monoSamples: samples,
    stereoSamples,
  };
}

/**
 * Convert 16-bit BE PCM buffer to a WAV file buffer (for export/preview).
 */
function pcmToWav(pcmDataBE, sampleRate, numChannels = 1) {
  const numFrames = pcmDataBE.length / 2;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numFrames * numChannels * (bitsPerSample / 8);
  const headerSize = 44;

  const wav = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wav.write('RIFF', 0);
  wav.writeUInt32LE(headerSize + dataSize - 8, 4);
  wav.write('WAVE', 8);

  // fmt chunk
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);        // chunk size
  wav.writeUInt16LE(1, 20);          // PCM format
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  // Convert BE to LE PCM
  for (let i = 0; i < numFrames; i++) {
    const sample = pcmDataBE.readInt16BE(i * 2);
    wav.writeInt16LE(sample, headerSize + i * 2);
  }

  return wav;
}

module.exports = {
  parseWavFile,
  convertTo16BitMono,
  createEmptyEsx,
  buildEsxFile,
  parseEsxFile,
  pcmToWav,
  ADDR,
  SIZE,
  NUM,
};
