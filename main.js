const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const esx = require('./src/esx-format');

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1024, minHeight: 700,
    backgroundColor: '#030303', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    icon: path.join(__dirname, 'src', 'icon.png')
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ═══════════════════════════════════════════════════════════
//  DEBUG HELPERS
// ═══════════════════════════════════════════════════════════
const DEBUG = process.env.NODE_ENV === 'development';

function debugLog(category, message, data) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${ts}] [${category}] ${message}`);
  if (data !== undefined) console.log(data);
}

function debugError(category, error) {
  console.error(`[ERROR] [${category}]`, error.message);
  if (DEBUG) console.error(error.stack);
}

/**
 * Wrap an IPC handler with debug logging and error catching.
 * Use for new handlers or when converting existing ones.
 */
function safeIpcHandle(channel, handler) {
  ipcMain.handle(channel, async (...args) => {
    try {
      debugLog('IPC', `→ ${channel}`);
      const result = await handler(...args);
      debugLog('IPC', `← ${channel} OK`);
      return result;
    } catch (error) {
      debugError(channel, error);
      return { error: error.message };
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  SAMPLE STORE + UNDO SYSTEM
// ═══════════════════════════════════════════════════════════
let currentSamples = [];
const MAX_UNDO = 50;

function pushUndo(index) {
  const s = currentSamples[index];
  if (!s) return;
  if (!s._undo) s._undo = [];
  if (!s._redo) s._redo = [];
  s._undo.push({ pcmData: Buffer.from(s.pcmData), numFrames: s.numFrames, duration: s.duration, sampleRate: s.sampleRate });
  if (s._undo.length > MAX_UNDO) s._undo.shift();
  s._redo = []; // clear redo on new action
}

function pushUndoAll() {
  for (let i = 0; i < currentSamples.length; i++) pushUndo(i);
}

ipcMain.handle('undo', async (ev, index) => {
  const s = currentSamples[index];
  if (!s || !s._undo || s._undo.length === 0) return null;
  // Push current state to redo
  if (!s._redo) s._redo = [];
  s._redo.push({ pcmData: Buffer.from(s.pcmData), numFrames: s.numFrames, duration: s.duration, sampleRate: s.sampleRate });
  // Restore
  const prev = s._undo.pop();
  s.pcmData = prev.pcmData; s.numFrames = prev.numFrames; s.duration = prev.duration; s.sampleRate = prev.sampleRate;
  return getSamplesInfo();
});

ipcMain.handle('redo', async (ev, index) => {
  const s = currentSamples[index];
  if (!s || !s._redo || s._redo.length === 0) return null;
  s._undo.push({ pcmData: Buffer.from(s.pcmData), numFrames: s.numFrames, duration: s.duration, sampleRate: s.sampleRate });
  const next = s._redo.pop();
  s.pcmData = next.pcmData; s.numFrames = next.numFrames; s.duration = next.duration; s.sampleRate = next.sampleRate;
  return getSamplesInfo();
});

ipcMain.handle('get-undo-info', async (ev, index) => {
  const s = currentSamples[index];
  if (!s) return { undoCount: 0, redoCount: 0, hasOriginal: false };
  return { undoCount: (s._undo || []).length, redoCount: (s._redo || []).length, hasOriginal: !!s._original };
});

ipcMain.handle('reset-sample', async (ev, index) => {
  const s = currentSamples[index];
  if (!s || !s._original) return null;
  // Push current state to undo so reset itself is undoable
  pushUndo(index);
  s.pcmData = Buffer.from(s._original.pcmData);
  s.numFrames = s._original.numFrames;
  s.duration = s._original.duration;
  s.sampleRate = s._original.sampleRate;
  return getSamplesInfo();
});

// ═══════════════════════════════════════════════════════════
//  HELPER
// ═══════════════════════════════════════════════════════════
function importWavBuffer(buffer, displayName, originalPath) {
  if (currentSamples.length >= esx.NUM.MONO_SAMPLES)
    return { error: 'Max 256 mono samples reached', originalName: displayName };
  try {
    const wavInfo = esx.parseWavFile(buffer);
    const converted = esx.convertTo16BitMono(wavInfo);
    const name = displayName.substring(0, 8).toUpperCase().replace(/[^A-Z0-9 _\-\.]/g, '');
    currentSamples.push({
      name, pcmData: converted.pcmData, sampleRate: converted.sampleRate,
      numFrames: converted.numFrames, duration: converted.durationSeconds,
      originalPath: originalPath || null, folder: null, _undo: [], _redo: [],
      _original: { pcmData: Buffer.from(converted.pcmData), numFrames: converted.numFrames, duration: converted.durationSeconds, sampleRate: converted.sampleRate },
    });
    return { index: currentSamples.length - 1, name, originalName: displayName, ok: true };
  } catch (err) { return { error: err.message, originalName: displayName }; }
}

// ═══════════════════════════════════════════════════════════
//  FILE OPS
// ═══════════════════════════════════════════════════════════
ipcMain.handle('open-esx-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open ESX File', filters: [{ name: 'ESX Files', extensions: ['esx', 'ESX'] }], properties: ['openFile']
  });
  if (result.canceled) return null;
  try {
    const buffer = fs.readFileSync(result.filePaths[0]);
    const parsed = esx.parseEsxFile(buffer);
    currentSamples = [];
    for (const s of parsed.monoSamples) {
      if (s) currentSamples.push({ name: s.name, pcmData: s.pcmData, sampleRate: s.sampleRate, numFrames: s.numFrames, duration: s.duration, originalPath: null, folder: null, _undo: [], _redo: [], _original: { pcmData: Buffer.from(s.pcmData), numFrames: s.numFrames, duration: s.duration, sampleRate: s.sampleRate } });
    }
    return { filePath: result.filePaths[0], samples: getSamplesInfo() };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('import-wav-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Samples', filters: [{ name: 'Audio', extensions: ['wav', 'WAV', 'aif', 'aiff'] }], properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return { imported: [], state: getSamplesInfo() };
  const imported = [];
  for (const fp of result.filePaths) {
    imported.push(importWavBuffer(fs.readFileSync(fp), path.basename(fp, path.extname(fp)), fp));
  }
  return { imported, state: getSamplesInfo() };
});

ipcMain.handle('import-zip', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import from ZIP', filters: [{ name: 'ZIP', extensions: ['zip', 'ZIP'] }], properties: ['openFile']
  });
  if (result.canceled) return { imported: [], state: getSamplesInfo() };
  const imported = [];
  try {
    const zip = new AdmZip(result.filePaths[0]);
    const wavEntries = zip.getEntries()
      .filter(e => {
        if (e.isDirectory) return false;
        if (!/\.(wav|aif|aiff)$/i.test(e.entryName)) return false;
        // Skip macOS resource forks and hidden junk
        const name = e.entryName.replace(/\\/g, '/');
        if (name.includes('__MACOSX/')) return false;
        if (name.split('/').pop().startsWith('._')) return false;
        return true;
      })
      .sort((a, b) => a.entryName.localeCompare(b.entryName));
    if (wavEntries.length === 0) return { imported: [{ error: 'No WAV/AIF in ZIP', originalName: path.basename(result.filePaths[0]) }], state: getSamplesInfo() };
    for (const entry of wavEntries) {
      const entryPath = entry.entryName.replace(/\\/g, '/');
      const parts = entryPath.split('/');
      const fileName = parts.pop();
      const folder = parts.join('/');
      let data;
      try { data = entry.getData(); } catch (e) { imported.push({ error: `Cannot decompress: ${fileName}`, originalName: fileName }); continue; }
      if (!data || data.length < 12) { imported.push({ error: `Empty or too small: ${fileName} (${data ? data.length : 0} bytes)`, originalName: fileName }); continue; }
      const buf = Buffer.from(data);
      const res = importWavBuffer(buf, path.basename(fileName, path.extname(fileName)), null);
      if (res.ok && folder) currentSamples[res.index].folder = folder;
      res.folder = folder || null;
      imported.push(res);
      if (res.error === 'Max 256 mono samples reached') break;
    }
  } catch (err) { imported.push({ error: `ZIP: ${err.message}`, originalName: path.basename(result.filePaths[0]) }); }
  return { imported, zipName: path.basename(result.filePaths[0]), state: getSamplesInfo() };
});

ipcMain.handle('save-esx-file', async (ev, defaultName) => {
  if (currentSamples.length === 0) return { error: 'No samples' };
  let totalSize = 0;
  for (const s of currentSamples) totalSize += 16 + s.pcmData.length;
  if (totalSize > esx.SIZE.MAX_SAMPLE_BYTES) return { error: `Too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB` };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save ESX', defaultPath: defaultName || 'my_samples.esx', filters: [{ name: 'ESX', extensions: ['esx'] }]
  });
  if (result.canceled) return null;
  try {
    mainWindow.webContents.send('export-progress', { phase: 'building', percent: 10 });
    const buf = esx.buildEsxFile(currentSamples);
    mainWindow.webContents.send('export-progress', { phase: 'writing', percent: 50 });
    fs.writeFileSync(result.filePath, buf);
    mainWindow.webContents.send('export-progress', { phase: 'verifying', percent: 90 });
    const stat = fs.statSync(result.filePath);
    mainWindow.webContents.send('export-progress', { phase: 'done', percent: 100 });
    return { filePath: result.filePath, size: stat.size };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('export-wav', async (ev, index) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const s = currentSamples[index];
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export WAV', defaultPath: `${s.name.trim()}.wav`, filters: [{ name: 'WAV', extensions: ['wav'] }]
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, esx.pcmToWav(s.pcmData, s.sampleRate));
  return result.filePath;
});

// ═══════════════════════════════════════════════════════════
//  SAMPLE MANAGEMENT
// ═══════════════════════════════════════════════════════════
ipcMain.handle('remove-sample', async (ev, index) => {
  if (index >= 0 && index < currentSamples.length) currentSamples.splice(index, 1);
  return getSamplesInfo();
});
ipcMain.handle('rename-sample', async (ev, { index, name }) => {
  if (index >= 0 && index < currentSamples.length)
    currentSamples[index].name = name.substring(0, 8).toUpperCase().replace(/[^A-Z0-9 _\-\.]/g, '');
  return getSamplesInfo();
});
ipcMain.handle('clear-all', async () => { currentSamples = []; return getSamplesInfo(); });
ipcMain.handle('get-state', async () => getSamplesInfo());

ipcMain.handle('get-waveform', async (ev, index) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const s = currentSamples[index];
  if (!s.pcmData) return null;
  const N = 500, step = Math.max(1, Math.floor(s.numFrames / N));
  const waveform = [];
  for (let i = 0; i < N && i * step < s.numFrames; i++) {
    let mn = 0, mx = 0;
    for (let j = 0; j < step; j++) {
      const fi = i * step + j;
      if (fi >= s.numFrames) break;
      const v = s.pcmData.readInt16BE(fi * 2) / 32768;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    waveform.push({ min: mn, max: mx });
  }
  // Peak analysis
  let peak = 0, rms = 0;
  for (let i = 0; i < s.numFrames; i++) {
    const v = Math.abs(s.pcmData.readInt16BE(i * 2));
    if (v > peak) peak = v;
    rms += (v / 32768) * (v / 32768);
  }
  rms = Math.sqrt(rms / s.numFrames);
  const peakDb = peak > 0 ? (20 * Math.log10(peak / 32767)).toFixed(1) : '-inf';
  const rmsDb = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '-inf';
  return { waveform, sampleRate: s.sampleRate, numFrames: s.numFrames, duration: s.duration, name: s.name, peakDb, rmsDb };
});

ipcMain.handle('get-wav-preview', async (ev, index) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const s = currentSamples[index];
  if (!s.pcmData) return null;
  return esx.pcmToWav(s.pcmData, s.sampleRate).toString('base64');
});

ipcMain.handle('get-float-samples', async (ev, index) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const s = currentSamples[index];
  if (!s.pcmData) return null;
  const frames = s.pcmData.length / 2;
  const floats = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    floats[i] = s.pcmData.readInt16BE(i * 2) / 32768;
  }
  return { floats: Array.from(floats), sampleRate: s.sampleRate || 44100 };
});

// ═══════════════════════════════════════════════════════════
//  BATCH PROCESSING (with undo)
// ═══════════════════════════════════════════════════════════
ipcMain.handle('normalize-all', async (ev, { targetDbFs }) => {
  const tgt = Math.round(Math.pow(10, (targetDbFs || -1) / 20) * 32767);
  let n = 0;
  for (let i = 0; i < currentSamples.length; i++) {
    const s = currentSamples[i];
    if (!s.pcmData || s.numFrames === 0) continue;
    let peak = 0;
    for (let j = 0; j < s.numFrames; j++) { const v = Math.abs(s.pcmData.readInt16BE(j * 2)); if (v > peak) peak = v; }
    if (peak === 0) continue;
    const gain = tgt / peak;
    if (Math.abs(gain - 1.0) < 0.01) continue;
    pushUndo(i);
    const buf = Buffer.alloc(s.pcmData.length);
    for (let j = 0; j < s.numFrames; j++) {
      buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(s.pcmData.readInt16BE(j * 2) * gain))), j * 2);
    }
    s.pcmData = buf; n++;
  }
  return { normalized: n, total: currentSamples.length, state: getSamplesInfo() };
});

ipcMain.handle('normalize-sample', async (ev, { index, targetDbFs }) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const s = currentSamples[index];
  if (!s.pcmData || s.numFrames === 0) return null;
  const tgt = Math.round(Math.pow(10, (targetDbFs || -1) / 20) * 32767);
  let peak = 0;
  for (let i = 0; i < s.numFrames; i++) { const v = Math.abs(s.pcmData.readInt16BE(i * 2)); if (v > peak) peak = v; }
  if (peak === 0) return { peakBefore: '-inf', peakAfter: '-inf', state: getSamplesInfo() };
  pushUndo(index);
  const gain = tgt / peak;
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(s.pcmData.readInt16BE(i * 2) * gain))), i * 2);
  }
  const peakBefore = (20 * Math.log10(peak / 32767)).toFixed(1);
  s.pcmData = buf;
  return { peakBefore, peakAfter: (targetDbFs || -1).toFixed(1), state: getSamplesInfo() };
});

ipcMain.handle('trim-all', async (ev, { thresholdDb }) => {
  const thresh = Math.pow(10, (thresholdDb || -40) / 20) * 32767;
  let n = 0;
  for (let i = 0; i < currentSamples.length; i++) {
    if (doTrim(i, thresh)) n++;
  }
  return { trimmed: n, total: currentSamples.length, state: getSamplesInfo() };
});

ipcMain.handle('trim-sample', async (ev, { index, thresholdDb }) => {
  if (index < 0 || index >= currentSamples.length) return null;
  const thresh = Math.pow(10, (thresholdDb || -40) / 20) * 32767;
  const fb = currentSamples[index].numFrames;
  doTrim(index, thresh);
  const fa = currentSamples[index].numFrames;
  return { framesBefore: fb, framesAfter: fa, removedMs: ((fb - fa) / currentSamples[index].sampleRate * 1000).toFixed(1), state: getSamplesInfo() };
});

function doTrim(index, thresh) {
  const s = currentSamples[index];
  if (!s.pcmData || s.numFrames <= 1) return false;
  let start = 0, end = s.numFrames - 1;
  for (let i = 0; i < s.numFrames; i++) { if (Math.abs(s.pcmData.readInt16BE(i * 2)) > thresh) { start = i; break; } }
  for (let i = s.numFrames - 1; i >= 0; i--) { if (Math.abs(s.pcmData.readInt16BE(i * 2)) > thresh) { end = i; break; } }
  start = Math.max(0, start - 8);
  end = Math.min(s.numFrames - 1, end + 8);
  if (start === 0 && end === s.numFrames - 1) return false;
  const nf = end - start + 1;
  if (nf < 16) return false;
  pushUndo(index);
  const buf = Buffer.alloc(nf * 2);
  s.pcmData.copy(buf, 0, start * 2, (end + 1) * 2);
  s.pcmData = buf; s.numFrames = nf; s.duration = nf / s.sampleRate;
  return true;
}

// ═══════════════════════════════════════════════════════════
//  DSP PROCESSING
// ═══════════════════════════════════════════════════════════

// ── REVERSE ────────────────────────────────────────────────
ipcMain.handle('fx-reverse', async (ev, index) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    buf.writeInt16BE(s.pcmData.readInt16BE(i * 2), (s.numFrames - 1 - i) * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── BITCRUSHER ─────────────────────────────────────────────
ipcMain.handle('fx-bitcrush', async (ev, { index, bits, rateReduction }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  bits = Math.max(1, Math.min(16, bits || 8));
  rateReduction = Math.max(1, Math.min(64, rateReduction || 1));
  const shift = 16 - bits;
  const buf = Buffer.alloc(s.pcmData.length);
  let held = 0;
  for (let i = 0; i < s.numFrames; i++) {
    if (i % rateReduction === 0) {
      let v = s.pcmData.readInt16BE(i * 2);
      // Quantize: shift right then shift left to kill lower bits
      v = (v >> shift) << shift;
      held = v;
    }
    buf.writeInt16BE(held, i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── PITCH / RESAMPLE ───────────────────────────────────────
ipcMain.handle('fx-pitch', async (ev, { index, factor }) => {
  const s = currentSamples[index];
  if (!s) return null;
  factor = Math.max(0.1, Math.min(8.0, factor || 1.0));
  if (Math.abs(factor - 1.0) < 0.01) return getSamplesInfo();
  pushUndo(index);
  const newFrames = Math.max(1, Math.round(s.numFrames / factor));
  const buf = Buffer.alloc(newFrames * 2);
  for (let i = 0; i < newFrames; i++) {
    const srcPos = i * factor;
    const si = Math.floor(srcPos);
    const frac = srcPos - si;
    const s0 = si < s.numFrames ? s.pcmData.readInt16BE(si * 2) : 0;
    const s1 = si + 1 < s.numFrames ? s.pcmData.readInt16BE((si + 1) * 2) : s0;
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac))), i * 2);
  }
  s.pcmData = buf; s.numFrames = newFrames; s.duration = newFrames / s.sampleRate;
  return getSamplesInfo();
});

// ── DISTORTION ─────────────────────────────────────────────
ipcMain.handle('fx-distort', async (ev, { index, drive, type }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  drive = Math.max(1, Math.min(50, drive || 5));
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    let v = s.pcmData.readInt16BE(i * 2) / 32767 * drive;
    if (type === 'soft') {
      v = Math.tanh(v);
    } else if (type === 'hard') {
      v = Math.max(-1, Math.min(1, v));
    } else if (type === 'fold') {
      // Wave folder — folds signal back when exceeding ±1
      for (let iter = 0; iter < 10 && (v > 1 || v < -1); iter++) {
        if (v > 1) v = 2 - v;
        if (v < -1) v = -2 - v;
      }
      v = Math.max(-1, Math.min(1, v));
    }
    buf.writeInt16BE(Math.round(v * 32767), i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── FADE IN ────────────────────────────────────────────────
ipcMain.handle('fx-fade-in', async (ev, { index, ms }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  const frames = Math.min(Math.round((ms || 50) / 1000 * s.sampleRate), s.numFrames);
  for (let i = 0; i < frames; i++) {
    const gain = i / frames;
    const v = Math.round(s.pcmData.readInt16BE(i * 2) * gain);
    s.pcmData.writeInt16BE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  return getSamplesInfo();
});

// ── FADE OUT ───────────────────────────────────────────────
ipcMain.handle('fx-fade-out', async (ev, { index, ms }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  const frames = Math.min(Math.round((ms || 50) / 1000 * s.sampleRate), s.numFrames);
  const start = s.numFrames - frames;
  for (let i = 0; i < frames; i++) {
    const gain = 1 - i / frames;
    const v = Math.round(s.pcmData.readInt16BE((start + i) * 2) * gain);
    s.pcmData.writeInt16BE(Math.max(-32768, Math.min(32767, v)), (start + i) * 2);
  }
  return getSamplesInfo();
});

// ── CHOP TO SLICES ─────────────────────────────────────────
ipcMain.handle('fx-chop', async (ev, { index, slices }) => {
  const s = currentSamples[index];
  if (!s) return null;
  slices = Math.max(2, Math.min(32, slices || 4));
  const perSlice = Math.floor(s.numFrames / slices);
  if (perSlice < 16) return { error: 'Sample too short to chop', state: getSamplesInfo() };

  const newSamples = [];
  for (let i = 0; i < slices; i++) {
    const start = i * perSlice;
    const end = i === slices - 1 ? s.numFrames : start + perSlice;
    const nf = end - start;
    const buf = Buffer.alloc(nf * 2);
    s.pcmData.copy(buf, 0, start * 2, end * 2);
    newSamples.push({
      name: `${s.name.substring(0, 5)}${String(i + 1).padStart(2, '0')}`,
      pcmData: buf, numFrames: nf, sampleRate: s.sampleRate,
      duration: nf / s.sampleRate, originalPath: null,
      folder: s.folder ? `${s.folder}/chop` : 'chop', _undo: [], _redo: [],
    });
  }
  // Insert slices after original
  currentSamples.splice(index + 1, 0, ...newSamples);
  return { chopped: slices, state: getSamplesInfo() };
});

// ── STUTTER ────────────────────────────────────────────────
ipcMain.handle('fx-stutter', async (ev, { index, ms, repeats }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  ms = Math.max(5, Math.min(1000, ms || 50));
  repeats = Math.max(2, Math.min(64, repeats || 8));
  const grainFrames = Math.min(Math.round(ms / 1000 * s.sampleRate), s.numFrames);
  const totalFrames = grainFrames * repeats;
  const buf = Buffer.alloc(totalFrames * 2);
  for (let r = 0; r < repeats; r++) {
    s.pcmData.copy(buf, r * grainFrames * 2, 0, grainFrames * 2);
  }
  s.pcmData = buf; s.numFrames = totalFrames; s.duration = totalFrames / s.sampleRate;
  return getSamplesInfo();
});

// ── TURNTABLE STOP ─────────────────────────────────────────
ipcMain.handle('fx-vinyl-stop', async (ev, { index, durationMs }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  durationMs = Math.max(50, Math.min(5000, durationMs || 1000));
  // Simulate turntable slowdown: pitch drops from 1.0 to 0.0 over duration
  // We'll resample with a decelerating read pointer
  const totalOutputFrames = Math.round(durationMs / 1000 * s.sampleRate);
  const buf = Buffer.alloc(totalOutputFrames * 2);
  let readPos = 0;
  for (let i = 0; i < totalOutputFrames; i++) {
    const progress = i / totalOutputFrames; // 0 → 1
    const speed = 1.0 - progress * progress; // Decelerate: quadratic slowdown
    const si = Math.floor(readPos);
    const frac = readPos - si;
    if (si >= s.numFrames - 1) {
      buf.writeInt16BE(0, i * 2);
    } else {
      const s0 = s.pcmData.readInt16BE(si * 2);
      const s1 = s.pcmData.readInt16BE((si + 1) * 2);
      buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac))), i * 2);
    }
    readPos += speed;
  }
  s.pcmData = buf; s.numFrames = totalOutputFrames; s.duration = totalOutputFrames / s.sampleRate;
  return getSamplesInfo();
});

// ── RING MODULATION ────────────────────────────────────────
ipcMain.handle('fx-ringmod', async (ev, { index, freq }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  freq = Math.max(10, Math.min(5000, freq || 440));
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    const mod = Math.sin(2 * Math.PI * freq * i / s.sampleRate);
    const v = Math.round(s.pcmData.readInt16BE(i * 2) * mod);
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── CROP (keep only start→end in frames) ──────────────────
ipcMain.handle('fx-crop', async (ev, { index, startPct, endPct }) => {
  const s = currentSamples[index];
  if (!s) return null;
  const startFrame = Math.floor((startPct / 100) * s.numFrames);
  const endFrame = Math.ceil((endPct / 100) * s.numFrames);
  const nf = endFrame - startFrame;
  if (nf < 16) return { error: 'Selection too short', state: getSamplesInfo() };
  pushUndo(index);
  const buf = Buffer.alloc(nf * 2);
  s.pcmData.copy(buf, 0, startFrame * 2, endFrame * 2);
  s.pcmData = buf; s.numFrames = nf; s.duration = nf / s.sampleRate;
  return getSamplesInfo();
});

// ── RHYTHMIC GATE (BPM-synced) ────────────────────────────
ipcMain.handle('fx-gate', async (ev, { index, bpm, steps, pattern }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  bpm = Math.max(60, Math.min(300, bpm || 160));
  steps = Math.max(4, Math.min(32, steps || 16));
  // pattern: array of 0/1 for each step, or null for auto 4-on-floor
  if (!pattern) { pattern = []; for (let i = 0; i < steps; i++) pattern.push(i % 4 === 0 ? 1 : 0); }
  const stepDur = (60 / bpm) / 4; // 16th note duration in seconds
  const stepFrames = Math.round(stepDur * s.sampleRate);
  const buf = Buffer.alloc(s.pcmData.length);
  s.pcmData.copy(buf);
  for (let i = 0; i < s.numFrames; i++) {
    const stepIdx = Math.floor(i / stepFrames) % steps;
    if (!pattern[stepIdx]) {
      // Mute with tiny fade to avoid clicks
      const posInStep = i % stepFrames;
      const fadeLen = Math.min(32, stepFrames / 4);
      let gain = 0;
      if (posInStep < fadeLen && stepIdx > 0 && pattern[(stepIdx - 1) % steps]) gain = 1 - posInStep / fadeLen;
      buf.writeInt16BE(Math.round(buf.readInt16BE(i * 2) * gain), i * 2);
    }
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── TIMESTRETCH (granular) ────────────────────────────────
ipcMain.handle('fx-timestretch', async (ev, { index, factor }) => {
  const s = currentSamples[index];
  if (!s) return null;
  factor = Math.max(0.25, Math.min(4.0, factor || 1.0));
  if (Math.abs(factor - 1.0) < 0.02) return getSamplesInfo();
  pushUndo(index);
  const grainSize = 2048; // ~46ms at 44.1kHz
  const hopIn = grainSize / 2;
  const hopOut = Math.round(hopIn * factor);
  const outLen = Math.round(s.numFrames * factor);
  const out = Buffer.alloc(outLen * 2);
  // Hann window
  const win = new Float64Array(grainSize);
  for (let i = 0; i < grainSize; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / grainSize));
  // Overlap-add
  const floatOut = new Float64Array(outLen);
  let inPos = 0, outPos = 0;
  while (inPos + grainSize < s.numFrames && outPos + grainSize < outLen) {
    for (let i = 0; i < grainSize; i++) {
      const si = inPos + i;
      if (si < s.numFrames && outPos + i < outLen) {
        floatOut[outPos + i] += (s.pcmData.readInt16BE(si * 2) / 32767) * win[i];
      }
    }
    inPos += hopIn;
    outPos += hopOut;
  }
  // Find peak for normalization
  let peak = 0;
  for (let i = 0; i < outLen; i++) { const v = Math.abs(floatOut[i]); if (v > peak) peak = v; }
  const norm = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < outLen; i++) {
    out.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(floatOut[i] * norm * 32767))), i * 2);
  }
  s.pcmData = out; s.numFrames = outLen; s.duration = outLen / s.sampleRate;
  return getSamplesInfo();
});

// ── FILTER SWEEP (LP/HP) ─────────────────────────────────
ipcMain.handle('fx-filter-sweep', async (ev, { index, type, startFreq, endFreq }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  startFreq = Math.max(20, Math.min(18000, startFreq || 200));
  endFreq = Math.max(20, Math.min(18000, endFreq || 8000));
  // Simple one-pole filter with sweeping cutoff
  const buf = Buffer.alloc(s.pcmData.length);
  let y = 0; // filter state
  for (let i = 0; i < s.numFrames; i++) {
    const t = i / s.numFrames;
    const freq = startFreq * Math.pow(endFreq / startFreq, t);
    const rc = 1.0 / (2.0 * Math.PI * freq);
    const dt = 1.0 / s.sampleRate;
    const alpha = dt / (rc + dt);
    const x = s.pcmData.readInt16BE(i * 2) / 32767;
    y += alpha * (x - y);
    const out = type === 'hp' ? x - y : y;
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(out * 32767))), i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── TRANSIENT SHAPER ──────────────────────────────────────
ipcMain.handle('fx-transient', async (ev, { index, attack, sustain }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  attack = Math.max(-100, Math.min(100, attack || 0)); // -100..+100
  sustain = Math.max(-100, Math.min(100, sustain || 0));
  const attackGain = 1 + attack / 100;
  const sustainGain = 1 + sustain / 100;
  // Envelope follower
  const env = new Float64Array(s.numFrames);
  const attackCoeff = Math.exp(-1 / (s.sampleRate * 0.001)); // 1ms attack
  const releaseCoeff = Math.exp(-1 / (s.sampleRate * 0.050)); // 50ms release
  let envVal = 0;
  for (let i = 0; i < s.numFrames; i++) {
    const abs = Math.abs(s.pcmData.readInt16BE(i * 2)) / 32767;
    envVal = abs > envVal ? attackCoeff * envVal + (1 - attackCoeff) * abs : releaseCoeff * envVal;
    env[i] = envVal;
  }
  // Differentiate envelope to detect transients
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    const envDiff = i > 0 ? Math.max(0, env[i] - env[i - 1]) * 100 : 0;
    const transientAmount = Math.min(1, envDiff); // 0..1
    const gain = attackGain * transientAmount + sustainGain * (1 - transientAmount);
    const v = Math.round(s.pcmData.readInt16BE(i * 2) * gain);
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── DC OFFSET REMOVE ──────────────────────────────────────
ipcMain.handle('fx-dc-remove', async (ev, index) => {
  const s = currentSamples[index];
  if (!s) return null;
  // Calculate DC offset
  let sum = 0;
  for (let i = 0; i < s.numFrames; i++) sum += s.pcmData.readInt16BE(i * 2);
  const dc = Math.round(sum / s.numFrames);
  if (Math.abs(dc) < 2) return { dc: 0, state: getSamplesInfo() }; // negligible
  pushUndo(index);
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, s.pcmData.readInt16BE(i * 2) - dc)), i * 2);
  }
  s.pcmData = buf;
  return { dc, state: getSamplesInfo() };
});

// ── LOOP CROSSFADE (make loop-ready) ─────────────────────
ipcMain.handle('fx-loop-xfade', async (ev, { index, ms }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  ms = Math.max(5, Math.min(500, ms || 20));
  const xfFrames = Math.min(Math.round(ms / 1000 * s.sampleRate), Math.floor(s.numFrames / 4));
  const buf = Buffer.alloc(s.pcmData.length);
  s.pcmData.copy(buf);
  // Crossfade end into beginning
  for (let i = 0; i < xfFrames; i++) {
    const t = i / xfFrames; // 0→1
    const startVal = buf.readInt16BE(i * 2);
    const endVal = buf.readInt16BE((s.numFrames - xfFrames + i) * 2);
    // Blend: at i=0, mostly end; at i=xfFrames, mostly start
    const blended = Math.round(startVal * t + endVal * (1 - t));
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, blended)), i * 2);
    // Also fade out the end portion
    const fadeGain = 1 - t;
    const endFaded = Math.round(buf.readInt16BE((s.numFrames - xfFrames + i) * 2) * fadeGain);
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, endFaded)), (s.numFrames - xfFrames + i) * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── AMP ENVELOPE (ADSR) ──────────────────────────────────
ipcMain.handle('fx-envelope', async (ev, { index, attackMs, decayMs, sustainLvl, releaseMs }) => {
  const s = currentSamples[index];
  if (!s) return null;
  pushUndo(index);
  const aFrames = Math.round((attackMs || 5) / 1000 * s.sampleRate);
  const dFrames = Math.round((decayMs || 50) / 1000 * s.sampleRate);
  const sLvl = Math.max(0, Math.min(1, (sustainLvl ?? 80) / 100));
  const rFrames = Math.round((releaseMs || 100) / 1000 * s.sampleRate);
  const sustainEnd = Math.max(0, s.numFrames - rFrames);
  const buf = Buffer.alloc(s.pcmData.length);
  for (let i = 0; i < s.numFrames; i++) {
    let gain;
    if (i < aFrames) gain = i / aFrames; // Attack
    else if (i < aFrames + dFrames) gain = 1 - (1 - sLvl) * ((i - aFrames) / dFrames); // Decay
    else if (i < sustainEnd) gain = sLvl; // Sustain
    else gain = sLvl * (1 - (i - sustainEnd) / rFrames); // Release
    gain = Math.max(0, Math.min(1, gain));
    buf.writeInt16BE(Math.max(-32768, Math.min(32767, Math.round(s.pcmData.readInt16BE(i * 2) * gain))), i * 2);
  }
  s.pcmData = buf;
  return getSamplesInfo();
});

// ── DUPLICATE SAMPLE ─────────────────────────────────────
ipcMain.handle('duplicate-sample', async (ev, index) => {
  const s = currentSamples[index];
  if (!s || currentSamples.length >= esx.NUM.MONO_SAMPLES) return null;
  const dup = {
    name: s.name.length <= 6 ? s.name + '_D' : s.name.substring(0, 6) + '_D',
    pcmData: Buffer.from(s.pcmData), sampleRate: s.sampleRate,
    numFrames: s.numFrames, duration: s.duration,
    originalPath: s.originalPath, folder: s.folder, _undo: [], _redo: [],
    _original: s._original ? { pcmData: Buffer.from(s._original.pcmData), numFrames: s._original.numFrames, duration: s._original.duration, sampleRate: s._original.sampleRate } : null,
  };
  currentSamples.splice(index + 1, 0, dup);
  return getSamplesInfo();
});

// ── MOVE SAMPLE UP/DOWN ──────────────────────────────────
ipcMain.handle('move-sample', async (ev, { index, direction }) => {
  const newIdx = index + direction;
  if (newIdx < 0 || newIdx >= currentSamples.length) return null;
  [currentSamples[index], currentSamples[newIdx]] = [currentSamples[newIdx], currentSamples[index]];
  return { newIndex: newIdx, state: getSamplesInfo() };
});

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
function getSamplesInfo() {
  let totalSize = 0;
  for (const s of currentSamples) totalSize += 16 + s.pcmData.length;
  return {
    numSamples: currentSamples.length,
    maxSamples: esx.NUM.MONO_SAMPLES,
    totalSizeBytes: totalSize,
    maxSizeBytes: esx.SIZE.MAX_SAMPLE_BYTES,
    usedPercent: ((totalSize / esx.SIZE.MAX_SAMPLE_BYTES) * 100).toFixed(1),
    totalDuration: currentSamples.reduce((a, s) => a + s.duration, 0),
    samples: currentSamples.map((s, i) => ({
      index: i, name: s.name, sampleRate: s.sampleRate,
      numFrames: s.numFrames, duration: s.duration, sizeBytes: s.pcmData.length,
      folder: s.folder || null, undoCount: (s._undo || []).length, redoCount: (s._redo || []).length, hasOriginal: !!s._original,
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  PARSER MODULES
// ═══════════════════════════════════════════════════════════
const e2sFormat  = require('./src/e2s-format');
const e2patFormat = require('./src/e2pat-format');
const emxFormat  = require('./src/emx-format');
const fileIO     = require('./src/file-io');

// ═══════════════════════════════════════════════════════════
//  E2S HANDLERS
// ═══════════════════════════════════════════════════════════
// Stored E2S state — pcmData stays in main process, only metadata goes to renderer
let e2sStoredSamples = new Array(e2sFormat.MAX_SLOTS).fill(null);
// Each non-null entry: { slot, name, pcmData (Buffer), sampleRate, category, loopType, loudness, playLogPeriod, playVolume }
let e2sFilePath = null;

/** Convert a stored E2S sample to UI-friendly metadata (no pcmData). */
function e2sSampleToUI(s, i) {
  if (!s) return { index: i, empty: true };
  const numFrames = s.pcmData ? s.pcmData.length / 2 : 0;
  const sr = s.sampleRate || e2sFormat.NATIVE_RATE;
  return {
    index: i, name: s.name || '', category: s.category || 0,
    tune: 0, playMode: s.loopType ? 'loop' : 'oneshot', boost: false,
    sampleRate: sr, numFrames, duration: numFrames / sr,
    sizeBytes: s.pcmData ? s.pcmData.length : 0, empty: !numFrames,
  };
}

/** Return UI-friendly sample list for all non-empty slots. */
function e2sGetSamplesUI() {
  const out = [];
  for (let i = 0; i < e2sStoredSamples.length; i++) {
    const s = e2sStoredSamples[i];
    if (s) out.push(e2sSampleToUI(s, i));
  }
  return out;
}

ipcMain.handle('e2s:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open E2S Sample File',
    filters: [{ name: 'E2S Sample File', extensions: ['all'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  try {
    const buffer = fs.readFileSync(result.filePaths[0]);
    e2sFilePath = result.filePaths[0];
    const parsed = e2sFormat.parseE2sAllFile(buffer);
    // Store raw samples (with pcmData) in main process
    e2sStoredSamples = new Array(e2sFormat.MAX_SLOTS).fill(null);
    for (let i = 0; i < parsed.samples.length; i++) {
      const s = parsed.samples[i];
      if (!s || s.error) continue;
      e2sStoredSamples[i] = {
        slot: i, name: s.esli ? s.esli.name : '', pcmData: s.pcmData,
        sampleRate: s.esli ? s.esli.sampleRate : e2sFormat.NATIVE_RATE,
        category: s.esli ? s.esli.category : 0,
        loopType: s.esli ? s.esli.loopType : 0,
        loopStart: s.esli ? s.esli.loopStart : 0xFFFFFFFF,
        loudness: s.esli ? s.esli.loudness : 127,
        playLogPeriod: s.esli ? s.esli.playLogPeriod : 0,
        playVolume: s.esli ? s.esli.playVolume : 0x4000,
      };
    }
    return { filePath: result.filePaths[0], samples: e2sGetSamplesUI() };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('e2s:save-file', async () => {
  const hasData = e2sStoredSamples.some(s => s !== null);
  if (!hasData) return { error: 'No E2S samples loaded' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save E2S Sample File', defaultPath: e2sFilePath || 'e2sSample.all',
    filters: [{ name: 'E2S Sample File', extensions: ['all'] }]
  });
  if (result.canceled) return null;
  try {
    const buf = e2sFormat.buildE2sAllFile(e2sStoredSamples.filter(s => s !== null));
    fs.writeFileSync(result.filePath, buf);
    e2sFilePath = result.filePath;
    return { filePath: result.filePath, size: buf.length };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('e2s:import-wav', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import WAV to E2S (48kHz)',
    filters: [{ name: 'Audio', extensions: ['wav', 'WAV', 'aif', 'aiff'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return null;
  const imported = [];
  for (const fp of result.filePaths) {
    const displayName = path.basename(fp, path.extname(fp));
    try {
      // Find next free slot
      let freeSlot = -1;
      for (let i = 0; i < e2sFormat.MAX_SLOTS; i++) {
        if (!e2sStoredSamples[i]) { freeSlot = i; break; }
      }
      if (freeSlot < 0) { imported.push({ name: displayName, ok: false, error: 'All 1000 slots full' }); continue; }

      const wavBuf = fs.readFileSync(fp);
      const wavInfo = esx.parseWavFile(wavBuf);
      const converted = esx.convertTo16BitMono(wavInfo);
      // Resample to 48kHz if needed (ESX converter outputs 44.1kHz by default)
      let pcmLE;
      if (converted.sampleRate !== e2sFormat.NATIVE_RATE) {
        const floats = e2sFormat.pcmBEToFloat(converted.pcmData); // ESX output is BE
        const resampled = e2sFormat.resampleLinear(floats, converted.sampleRate, e2sFormat.NATIVE_RATE);
        pcmLE = e2sFormat.floatToPcmLE(resampled);
      } else {
        // Convert BE to LE
        const floats = e2sFormat.pcmBEToFloat(converted.pcmData);
        pcmLE = e2sFormat.floatToPcmLE(floats);
      }
      const name = displayName.substring(0, 24).toUpperCase().replace(/[^A-Z0-9 _\-\.]/g, '');
      e2sStoredSamples[freeSlot] = {
        slot: freeSlot, name, pcmData: pcmLE,
        sampleRate: e2sFormat.NATIVE_RATE, category: 0,
        loopType: 0, loopStart: 0xFFFFFFFF, loudness: 127,
        playLogPeriod: 0, playVolume: 0x4000,
      };
      imported.push({ name, ok: true, slot: freeSlot });
    } catch (err) { imported.push({ name: displayName, ok: false, error: err.message }); }
  }
  return { imported, samples: e2sGetSamplesUI() };
});

ipcMain.handle('e2s:export-wav', async (ev, slot) => {
  if (slot < 0 || slot >= e2sFormat.MAX_SLOTS || !e2sStoredSamples[slot]) return null;
  const s = e2sStoredSamples[slot];
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export E2S Sample as WAV', defaultPath: `${(s.name || 'e2s_sample').trim()}.wav`,
    filters: [{ name: 'WAV', extensions: ['wav'] }]
  });
  if (result.canceled) return null;
  try {
    // Build a standard WAV from 16-bit LE PCM
    const numFrames = s.pcmData.length / 2;
    const sr = s.sampleRate || e2sFormat.NATIVE_RATE;
    const dataSize = numFrames * 2;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
    s.pcmData.copy(wav, 44);
    fs.writeFileSync(result.filePath, wav);
    return result.filePath;
  } catch (err) { return null; }
});

// E2S sample updates from renderer (name, category, etc.)
ipcMain.handle('e2s:update-sample', async (ev, { slot, name, category, loopType }) => {
  if (slot < 0 || slot >= e2sFormat.MAX_SLOTS || !e2sStoredSamples[slot]) return null;
  const s = e2sStoredSamples[slot];
  if (name !== undefined)     s.name = name;
  if (category !== undefined) s.category = category;
  if (loopType !== undefined) s.loopType = loopType;
  return e2sSampleToUI(s, slot);
});

ipcMain.handle('e2s:remove-sample', async (ev, slot) => {
  if (slot >= 0 && slot < e2sFormat.MAX_SLOTS) e2sStoredSamples[slot] = null;
  return e2sGetSamplesUI();
});

ipcMain.handle('e2s:get-waveform', async (ev, slot) => {
  if (slot < 0 || slot >= e2sFormat.MAX_SLOTS || !e2sStoredSamples[slot]) return null;
  const s = e2sStoredSamples[slot];
  const numFrames = s.pcmData.length / 2;
  if (numFrames === 0) return null;
  const N = 500, step = Math.max(1, Math.floor(numFrames / N));
  const waveform = [];
  for (let i = 0; i < N && i * step < numFrames; i++) {
    let mn = 0, mx = 0;
    for (let j = 0; j < step; j++) {
      const fi = i * step + j;
      if (fi >= numFrames) break;
      const v = s.pcmData.readInt16LE(fi * 2) / 32768;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    waveform.push({ min: mn, max: mx });
  }
  let peak = 0, rms = 0;
  for (let i = 0; i < numFrames; i++) {
    const v = Math.abs(s.pcmData.readInt16LE(i * 2));
    if (v > peak) peak = v;
    rms += (v / 32768) * (v / 32768);
  }
  rms = Math.sqrt(rms / numFrames);
  const peakDb = peak > 0 ? (20 * Math.log10(peak / 32767)).toFixed(1) : '-inf';
  const rmsDb = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '-inf';
  return { waveform, sampleRate: s.sampleRate, numFrames, duration: numFrames / s.sampleRate, name: s.name, peakDb, rmsDb };
});

ipcMain.handle('e2s:get-wav-preview', async (ev, slot) => {
  if (slot < 0 || slot >= e2sFormat.MAX_SLOTS || !e2sStoredSamples[slot]) return null;
  const s = e2sStoredSamples[slot];
  const numFrames = s.pcmData.length / 2;
  const sr = s.sampleRate || e2sFormat.NATIVE_RATE;
  const dataSize = numFrames * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
  s.pcmData.copy(wav, 44);
  return wav.toString('base64');
});

// ═══════════════════════════════════════════════════════════
//  E2 PATTERN HANDLERS
// ═══════════════════════════════════════════════════════════
let patStoredRaw = null; // raw all-patterns buffer for split/save
const BEAT_NAMES = ['16th', '32nd', '8th', '8-tri'];

/** Convert a parser pattern to UI-friendly format. */
function patternToUI(pat) {
  const h = pat.header || {};
  const parts = (pat.parts || []).map((p, j) => {
    const pr = p.params || {};
    return {
      name: `Part ${j + 1}`,
      oscType: `Type ${pr.oscType || 0}`,
      level: pr.level ?? 100,
      steps: (p.steps || []).map(s => s.gate > 0),
      velocities: (p.steps || []).map(s => s.velocity || 0),
    };
  });
  return {
    name: h.name || '', bpm: h.tempo || 120, swing: h.swing || 0,
    steps: (h.length || 1) * (h.beat === 1 ? 32 : 16),
    beat: BEAT_NAMES[h.beat] || '16th',
    key: h.key || 0, scale: h.scale || 0,
    deviceId: h.deviceId || 0,
    parts,
  };
}

/** Convert an ESX pattern (from parseEsxPattern) to unified UI format. */
function esxPatternToUI(esxPat) {
  const numSteps = (esxPat.lastStep || 0) + 1;
  const parts = esxPat.parts.map(part => {
    let steps, velocities;
    if (part.type === 'keyboard') {
      steps = part.notes.slice(0, numSteps).map(n => n.active);
      velocities = part.gates.slice(0, numSteps);
    } else if (part.type === 'accent') {
      steps = part.steps.slice(0, numSteps);
      velocities = steps.map(active => active ? part.level : 0);
    } else {
      steps = part.steps.slice(0, numSteps);
      velocities = steps.map(active => active ? (part.level || 100) : 0);
    }
    return { name: part.name, type: part.type, level: part.level || 100, steps, velocities };
  });

  return {
    name: esxPat.name,
    bpm: esxPat.tempo,
    swing: esxPat.swing || 50,
    steps: numSteps,
    beat: '16th',
    deviceId: 'esx',
    format: 'ESX-1',
    parts,
  };
}

ipcMain.handle('esx:open-patterns', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open ESX File (Patterns)',
    filters: [
      { name: 'ESX Files', extensions: ['esx', 'ESX'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled) return { canceled: true };
  try {
    const buf = fs.readFileSync(result.filePaths[0]);
    const rawPatterns = esx.parseEsxPatterns(buf);
    const patterns = rawPatterns.map(p => esxPatternToUI(p));
    return { canceled: false, filePath: result.filePaths[0], patterns, count: patterns.length };
  } catch (err) {
    debugError('esx:open-patterns', err);
    return { error: err.message, canceled: true };
  }
});

ipcMain.handle('e2pat:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open E2 Pattern',
    filters: [
      { name: 'E2 Pattern Files', extensions: ['e2pat', 'e2spat', 'e2allpat', 'e2sallpat'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  try {
    const buffer = fs.readFileSync(result.filePaths[0]);
    patStoredRaw = buffer;
    if (buffer.length === e2patFormat.PATTERN_SIZE) {
      // Single pattern
      const pat = e2patFormat.parsePattern(buffer, 0);
      return { filePath: result.filePaths[0], patterns: [patternToUI(pat)] };
    } else if (buffer.length >= e2patFormat.ALL_FILE_SIZE) {
      // All-patterns file
      const data = e2patFormat.parseAllPatterns(buffer);
      return { filePath: result.filePaths[0], patterns: data.patterns.map(patternToUI) };
    } else {
      return { filePath: result.filePaths[0], patterns: [], error: `Unknown pattern file size: ${buffer.length}` };
    }
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('e2pat:save-file', async (ev, patIdx, ext) => {
  if (!patStoredRaw) return { error: 'No pattern data loaded' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save E2 Pattern', defaultPath: `pattern.${ext || 'e2pat'}`,
    filters: [{ name: 'E2 Pattern', extensions: [ext || 'e2pat'] }]
  });
  if (result.canceled) return null;
  try {
    let outBuf;
    if (patIdx !== undefined && patIdx !== null && patStoredRaw.length >= e2patFormat.ALL_FILE_SIZE) {
      outBuf = e2patFormat.splitPattern(patStoredRaw, patIdx);
    } else {
      outBuf = patStoredRaw;
    }
    fs.writeFileSync(result.filePath, outBuf);
    return { filePath: result.filePath };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('e2pat:split-save', async () => {
  if (!patStoredRaw || patStoredRaw.length < e2patFormat.ALL_FILE_SIZE) {
    return { error: 'No all-patterns file loaded' };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Output Directory', properties: ['openDirectory']
  });
  if (result.canceled) return null;
  try {
    const dir = result.filePaths[0];
    let count = 0;
    for (let i = 0; i < e2patFormat.NUM_PATTERNS; i++) {
      const patBuf = e2patFormat.splitPattern(patStoredRaw, i);
      const fn = path.join(dir, `pattern_${String(i).padStart(3, '0')}.e2pat`);
      fs.writeFileSync(fn, patBuf);
      count++;
    }
    return { dir, count };
  } catch (err) { return { error: err.message }; }
});

// ═══════════════════════════════════════════════════════════
//  EMX HANDLERS
// ═══════════════════════════════════════════════════════════
const EMX_BEAT_NAMES = ['16th', '32nd', '8th', '8-tri'];

ipcMain.handle('emx:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open EMX-1 File',
    filters: [{ name: 'EMX-1 Files', extensions: ['emx'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  try {
    const buffer = fs.readFileSync(result.filePaths[0]);
    const data = emxFormat.parseEmxDump(buffer);
    // Transform to UI-friendly format
    const patterns = data.patterns.map((p, i) => {
      if (p.error) return { index: i, name: '', bpm: 120, swing: 0, steps: 16, beat: '16th', parts: [] };
      const h = p.header || {};
      const parts = [];
      for (const sp of (p.synthParts || [])) {
        parts.push({ name: `Synth`, oscType: `Type ${sp.oscType || 0}`, level: sp.level || 0 });
      }
      for (const dp of (p.drumParts || [])) {
        parts.push({ name: `Drum`, oscType: `Smp ${dp.samplePtr || 0}`, level: dp.level || 0 });
      }
      return {
        index: i, name: h.name || '', bpm: h.tempo || 120, swing: h.swing || 0,
        steps: (h.lastStep || 15) + 1, beat: EMX_BEAT_NAMES[h.beat] || '16th', parts,
      };
    });
    return { filePath: result.filePaths[0], patterns };
  } catch (err) { return { error: err.message }; }
});

// ═══════════════════════════════════════════════════════════
//  UNIVERSAL FILE OPEN (auto-detect format)
// ═══════════════════════════════════════════════════════════
ipcMain.handle('file:open-any', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    filters: [
      { name: 'All Supported', extensions: ['esx', 'all', 'e2pat', 'e2spat', 'e2allpat', 'e2sallpat', 'emx'] },
      { name: 'ESX-1', extensions: ['esx'] },
      { name: 'E2S Samples', extensions: ['all'] },
      { name: 'E2 Patterns', extensions: ['e2pat', 'e2spat', 'e2allpat', 'e2sallpat'] },
      { name: 'EMX-1', extensions: ['emx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  const fp = result.filePaths[0];
  // Use file-io auto-detection
  try {
    const buffer = fs.readFileSync(fp);
    const format = fileIO.detectFormat(buffer, path.basename(fp));
    return { format: format || 'unknown', filePath: fp };
  } catch (err) {
    const ext = path.extname(fp).toLowerCase();
    if (ext === '.esx') return { format: 'esx', filePath: fp };
    if (ext === '.all') return { format: 'e2s', filePath: fp };
    if (['.e2pat', '.e2spat', '.e2allpat', '.e2sallpat'].includes(ext)) return { format: 'e2pat', filePath: fp };
    if (ext === '.emx') return { format: 'emx', filePath: fp };
    return { format: 'unknown', filePath: fp };
  }
});
