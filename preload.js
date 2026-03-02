const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  // File ops
  openEsxFile:      ()              => ipcRenderer.invoke('open-esx-file'),
  importWavFiles:   ()              => ipcRenderer.invoke('import-wav-files'),
  importZip:        ()              => ipcRenderer.invoke('import-zip'),
  saveEsxFile:      (name)          => ipcRenderer.invoke('save-esx-file', name),
  exportWav:        (i)             => ipcRenderer.invoke('export-wav', i),
  // Management
  removeSample:     (i)             => ipcRenderer.invoke('remove-sample', i),
  renameSample:     (i, n)          => ipcRenderer.invoke('rename-sample', { index: i, name: n }),
  clearAll:         ()              => ipcRenderer.invoke('clear-all'),
  getState:         ()              => ipcRenderer.invoke('get-state'),
  duplicateSample:  (i)             => ipcRenderer.invoke('duplicate-sample', i),
  moveSample:       (i, dir)        => ipcRenderer.invoke('move-sample', { index: i, direction: dir }),
  // Preview
  getWaveform:      (i)             => ipcRenderer.invoke('get-waveform', i),
  getWavPreview:    (i)             => ipcRenderer.invoke('get-wav-preview', i),
  getFloatSamples:  (i)             => ipcRenderer.invoke('get-float-samples', i),
  // Undo/Redo
  undo:             (i)             => ipcRenderer.invoke('undo', i),
  redo:             (i)             => ipcRenderer.invoke('redo', i),
  getUndoInfo:      (i)             => ipcRenderer.invoke('get-undo-info', i),
  resetSample:      (i)             => ipcRenderer.invoke('reset-sample', i),
  // Batch
  normalizeAll:     (db)            => ipcRenderer.invoke('normalize-all', { targetDbFs: db }),
  normalizeSample:  (i, db)         => ipcRenderer.invoke('normalize-sample', { index: i, targetDbFs: db }),
  trimAll:          (db)            => ipcRenderer.invoke('trim-all', { thresholdDb: db }),
  trimSample:       (i, db)         => ipcRenderer.invoke('trim-sample', { index: i, thresholdDb: db }),
  // DSP FX
  fxReverse:        (i)             => ipcRenderer.invoke('fx-reverse', i),
  fxBitcrush:       (i, b, r)       => ipcRenderer.invoke('fx-bitcrush', { index: i, bits: b, rateReduction: r }),
  fxPitch:          (i, f)          => ipcRenderer.invoke('fx-pitch', { index: i, factor: f }),
  fxDistort:        (i, d, t)       => ipcRenderer.invoke('fx-distort', { index: i, drive: d, type: t }),
  fxFadeIn:         (i, ms)         => ipcRenderer.invoke('fx-fade-in', { index: i, ms }),
  fxFadeOut:        (i, ms)         => ipcRenderer.invoke('fx-fade-out', { index: i, ms }),
  fxChop:           (i, s)          => ipcRenderer.invoke('fx-chop', { index: i, slices: s }),
  fxStutter:        (i, ms, r)      => ipcRenderer.invoke('fx-stutter', { index: i, ms, repeats: r }),
  fxVinylStop:      (i, ms)         => ipcRenderer.invoke('fx-vinyl-stop', { index: i, durationMs: ms }),
  fxRingmod:        (i, f)          => ipcRenderer.invoke('fx-ringmod', { index: i, freq: f }),
  fxCrop:           (i, s, e)       => ipcRenderer.invoke('fx-crop', { index: i, startPct: s, endPct: e }),
  // New FX
  fxGate:           (i, bpm, st, p) => ipcRenderer.invoke('fx-gate', { index: i, bpm, steps: st, pattern: p }),
  fxTimestretch:    (i, f)          => ipcRenderer.invoke('fx-timestretch', { index: i, factor: f }),
  fxFilterSweep:    (i, t, sf, ef)  => ipcRenderer.invoke('fx-filter-sweep', { index: i, type: t, startFreq: sf, endFreq: ef }),
  fxTransient:      (i, a, s)       => ipcRenderer.invoke('fx-transient', { index: i, attack: a, sustain: s }),
  fxDcRemove:       (i)             => ipcRenderer.invoke('fx-dc-remove', i),
  fxLoopXfade:      (i, ms)         => ipcRenderer.invoke('fx-loop-xfade', { index: i, ms }),
  fxEnvelope:       (i, a, d, s, r) => ipcRenderer.invoke('fx-envelope', { index: i, attackMs: a, decayMs: d, sustainLvl: s, releaseMs: r }),

  // Export progress
  onExportProgress: (cb) => ipcRenderer.on('export-progress', (_, data) => cb(data)),

  // ═══ ESX Patterns ═══
  esx: {
    openPatterns: ()            => ipcRenderer.invoke('esx:open-patterns'),
  },

  // ═══ E2S ═══
  e2s: {
    openFile:     ()              => ipcRenderer.invoke('e2s:open-file'),
    saveFile:     ()              => ipcRenderer.invoke('e2s:save-file'),
    importWav:    ()              => ipcRenderer.invoke('e2s:import-wav'),
    exportWav:    (slot)          => ipcRenderer.invoke('e2s:export-wav', slot),
    updateSample: (o)             => ipcRenderer.invoke('e2s:update-sample', o),
    removeSample: (slot)          => ipcRenderer.invoke('e2s:remove-sample', slot),
    getWaveform:  (slot)          => ipcRenderer.invoke('e2s:get-waveform', slot),
    getWavPreview:(slot)          => ipcRenderer.invoke('e2s:get-wav-preview', slot),
  },

  // ═══ E2 Patterns ═══
  e2pat: {
    openFile:   ()              => ipcRenderer.invoke('e2pat:open-file'),
    saveFile:   (patIdx, ext)   => ipcRenderer.invoke('e2pat:save-file', patIdx, ext),
    splitSave:  ()              => ipcRenderer.invoke('e2pat:split-save'),
  },

  // ═══ EMX ═══
  emx: {
    openFile:   ()              => ipcRenderer.invoke('emx:open-file'),
  },

  // ═══ Universal ═══
  file: {
    openAny:    ()              => ipcRenderer.invoke('file:open-any'),
  },
});
