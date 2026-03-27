# CODE REVIEW — BETA READINESS

**Date:** 2026-03-27
**Scope:** Full codebase audit across 4 domains
**Test results:** 240/240 passing (7 test files, 1.31s)

---

## CRITICAL (must fix before beta)

### 1. [PARSER] `buildEsxFile()` / `rebuildEsxFile()` produce variable-size files, not hardware-required fixed 26,542,080 bytes
**File:** `src/esx-format.js:806, 1357`

The ESX-1 hardware enforces exactly 26,542,080 bytes. Both builder functions produce variable-length files based on actual sample data size. With zero samples, the output is ~2.4MB. The hardware may reject undersized files.

```javascript
// Current (WRONG):
const totalSize = SIZE.FILE_MIN + sampleDataBuffer.length;

// Fix: allocate full hardware size and write into it
const ESX_FULL_SIZE = 26_542_080;
const buffer = Buffer.alloc(ESX_FULL_SIZE);
// ... write header, patterns, samples into buffer ...
// Remaining bytes stay 0x00 (empty sample space)
```

### 2. [PARSER] EMX SysEx format: Pattern 255 reads 288 bytes past end of buffer
**File:** `src/emx-format.js:36, 496-502`

`PATTERN_SIZE = 6750` × 256 patterns + header offset = 1,728,288, but SysEx dumps are only 1,728,000 bytes. The last pattern always overflows. The try/catch prevents a crash but the pattern is silently lost.

```javascript
// Fix: validate bounds before parsing each pattern
const offset = ADDR.PATTERN_DATA + i * PATTERN_SIZE;
if (offset + PATTERN_SIZE > buf.length) {
  break; // or: patterns.push({ name: `Pattern ${i+1}`, empty: true, parts: [] });
}
```

### 3. [IPC] Path traversal in `save-esx-overwrite` — arbitrary file write
**File:** `main.js:292-316`

Accepts `filePath` directly from the renderer and writes 26.5MB to it with `fs.writeFileSync(filePath, buf)`. No validation that the path is an `.esx` file or within a safe directory. A compromised renderer could overwrite arbitrary files.

```javascript
// Fix: validate path has .esx extension
ipcMain.handle('save-esx-overwrite', async (ev, filePath) => {
  if (!filePath) return { error: 'No file path' };
  if (path.extname(filePath).toLowerCase() !== '.esx') return { error: 'Invalid file type' };
  // ... rest of handler
});
```

### 4. [IPC] Path traversal in `esx:save-tags` / `esx:load-tags` — arbitrary file read/write
**File:** `main.js:476-492`

`esx:save-tags` writes `JSON.stringify(tags)` to `filePath + '.tags.json'` with no path validation. `esx:load-tags` reads and parses any `.tags.json` file the renderer specifies.

```javascript
// Fix: validate filePath has .esx extension before appending .tags.json
safeIpcHandle('esx:save-tags', async (ev, { filePath, tags }) => {
  if (!filePath || !tags) return { error: 'No file path or tags' };
  if (path.extname(filePath).toLowerCase() !== '.esx') return { error: 'Invalid path' };
  const tagPath = filePath + '.tags.json';
  fs.writeFileSync(tagPath, JSON.stringify(tags, null, 2), 'utf-8');
  return { ok: true };
});
```

### 5. [UI] XSS via unescaped `sdPath` in `innerHTML`
**File:** `src/index.html:4081`

SD card path from IPC is injected raw into `innerHTML`. A crafted volume label could execute script.

```javascript
// Current (VULNERABLE):
badge.innerHTML = `<span style="color:var(--yel)">SD: ${sdPath}</span>`;

// Fix:
badge.innerHTML = `<span style="color:var(--yel)">SD: ${esc(sdPath)}</span>`;
```

### 6. [UI] XSS in global error handler via `innerHTML`
**File:** `src/index.html:1257-1267`

Error messages and stack traces are concatenated directly into `innerHTML` without sanitization. Additionally, this handler destroys the entire UI on any uncaught error, even minor ones.

```javascript
// Fix: use textContent instead of innerHTML
window.onerror = function(msg, src, line, col, err) {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f44;padding:2em;white-space:pre-wrap';
  pre.textContent = `CRASH: ${msg}\nLine: ${line}:${col}\n\n${err?.stack || ''}`;
  document.body.innerHTML = '';
  document.body.appendChild(pre);
};
```

### 7. [UI] Blob URL memory leak in `togglePlay()`
**File:** `src/index.html:1551`

A new Blob URL is created every time the user plays a sample. `URL.revokeObjectURL()` is never called. Rapidly playing samples leaks multi-MB Blob references for the entire session.

```javascript
// Fix: track and revoke before creating new
let currentBlobUrl = null;
function stopPlay() {
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
  // ... existing stop logic
}
// In togglePlay():
currentBlobUrl = URL.createObjectURL(new Blob([...], {type:'audio/wav'}));
audio.src = currentBlobUrl;
```

---

## HIGH (should fix before beta)

### 8. [IPC] ~40 IPC handlers lack try/catch — unhandled exceptions crash the IPC channel
**File:** `main.js` (throughout)

Only 8 handlers use `safeIpcHandle`. The remaining ~40+ use raw `ipcMain.handle` without error handling. Any throw (disk full, corrupted data, out-of-bounds) sends an unstructured rejection to the renderer.

**Fix:** Mechanically convert all `ipcMain.handle` calls to `safeIpcHandle`.

### 9. [IPC] No `process.on('unhandledRejection')` handler
**File:** `main.js` (missing)

If any async operation throws outside try/catch, the process crashes with no user feedback.

**Fix:** Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)`.

### 10. [IPC] E2S name validation missing in `e2s:update-sample`
**File:** `main.js:1254`

E2S names are stored raw without length or character validation. ESX names are properly sanitized to 8 chars with `substring(0, 8).toUpperCase().replace(...)`.

**Fix:** Apply similar validation for E2S names based on the ESLI name field size.

### 11. [IPC] No `patIdx` bounds validation in `esx:update-pattern-param`
**File:** `main.js:1492-1500`

`patIdx` from the renderer is passed directly to `writePartParam()` without bounds checking. An invalid index could write to unintended buffer locations.

**Fix:** Validate `patIdx` is in range `[0, 255]` and `value` in `[0, 255]`.

### 12. [IPC] `e2s:export-wav` silently swallows errors — returns `null`
**File:** `main.js:1247`

The catch block returns `null`, giving the user zero feedback about failures (disk full, permissions).

**Fix:** Return `{ error: err.message }` instead of `null`.

### 13. [PARSER] `parseEsxFile()` has no minimum buffer size check
**File:** `src/esx-format.js:1122-1133`

Only checks first 4 bytes are "KORG", then immediately reads at offset `0x1B0020`. A truncated file causes `RangeError`.

**Fix:** Add `if (buffer.length < SIZE.FILE_MIN) throw new Error(...)` at the start.

### 14. [PARSER] WAV chunk parsers don't validate `chunkSize` against remaining buffer
**Files:** `src/esx-format.js:120-141`, `src/e2s-format.js:122-156`

A malformed WAV with huge `chunkSize` could cause out-of-bounds reads on `fmt` chunk fields.

**Fix:** Add `if (offset + chunkSize > buffer.length) break;` after reading chunkSize.

### 15. [PARSER] `rebuildEsxFile()` zeroes stereo sample headers — stereo samples are permanently lost
**File:** `src/esx-format.js:1299, 1345`

On rebuild, all stereo headers are cleared and `numStereo` is forced to 0. Users with stereo samples will lose them on save.

**Fix:** Document the limitation prominently, or add stereo sample support to rebuild.

### 16. [BUILD] Synchronous file I/O blocks the main process on all operations
**File:** `main.js` (20+ locations: lines 178, 233, 247, 306, 333, 348, 480, 490, 1141, etc.)

Every file read/write uses `readFileSync`/`writeFileSync`. ESX files are 26.5MB. On slow storage (USB SD readers), this freezes the entire UI for 500ms-2s. The `e2pat:split-save` handler writes up to 250 files synchronously in a loop.

**Fix:** Replace with `await fs.promises.readFile()` / `await fs.promises.writeFile()`.

### 17. [BUILD] `window.onerror` / `window.onunhandledrejection` destroy the entire UI
**File:** `src/index.html:1257-1268`

Any uncaught error — even minor — replaces `document.body.innerHTML` with a red error screen. User loses all unsaved work and must restart the app.

**Fix:** Use a non-destructive toast or error banner instead.

### 18. [UI] No double-click / rapid-click protection on async operations
**File:** `src/index.html` — `applyFx()`, `saveEsxToFile()`, `exportNewEsx()`, `removeChecked()`, `convExecute()`

None have guards against double invocation. Rapid double-click applies effects twice, or triggers concurrent file writes that could corrupt output.

**Fix:** Add `if(processing)return; processing=true;` guard at the top of each async function.

### 19. [UI] Keyboard shortcuts fire while modals are open
**File:** `src/index.html:3737`

`patHandleKeyboard` has no modal check. Arrow keys, Space, +/- change patterns behind open modals.

**Fix:** Add modal-open check at the top of `patHandleKeyboard()`.

### 20. [UI] `e2sSetTune()` and `e2sSetBoost()` do not persist changes to the backend
**File:** `src/index.html:2293, 2300`

These update local state only — no IPC call to `window.api.e2s.updateSample()`. Changes are lost unless the user saves, and the main process state is never updated.

**Fix:** Add `await window.api.e2s.updateSample({slot:e2sSel, tune:v})` after local state update.

### 21. [BUILD] `IS_DEV` used before initialization (TDZ hazard)
**File:** `main.js:19, 36`

`createWindow()` references `IS_DEV` at line 19, but it's declared with `const` at line 36. Currently works because `app.whenReady()` is async, but any refactor could cause a crash.

**Fix:** Move `const IS_DEV = ...` above the `createWindow()` function definition.

### 22. [BUILD] Unused dependencies bundled: `chokidar` and `electribe`
**File:** `package.json:20-21`

Neither `chokidar` (v5.0.0) nor `electribe` (v0.2.0) are `require()`d anywhere in runtime code. They add dead code to the installer, and `chokidar`'s native deps can cause build issues.

**Fix:** Remove both from `dependencies`.

---

## MEDIUM (fix soon after beta)

### 23. [IPC] Undo system memory — worst case ~1.25GB
**File:** `main.js:88-102` — 50 undo states per sample, each stores full Buffer copy. Batch operations (`pushUndoAll`) spike memory. Redo stack is unbounded.

### 24. [IPC] SD card polling `setInterval` never cleared — leaked on window close
**File:** `main.js:1777` — runs every 3s forever. Uses deprecated `wmic` on Windows 11.

### 25. [IPC] Preload event listeners (`onExportProgress`, `onSdCardInserted`) accumulate — no removal API
**File:** `preload.js:60, 107-108` — repeated calls add duplicate listeners.

### 26. [IPC] Many handlers return `null` on failure instead of `{ error }` — silent failures
**File:** `main.js` (~25 handlers) — user gets no feedback when operations fail.

### 27. [IPC] DSP handlers don't validate `index` as a number
**File:** `main.js:578-1048` — `NaN`, negative floats, strings all pass through silently.

### 28. [PARSER] `buildEsliData()` uses `||` instead of `??` for numeric fields where `0` is valid
**File:** `src/e2s-format.js:85-98` — `meta.sampleRate || NATIVE_RATE` treats 0 as falsy.

### 29. [PARSER] `detectEmxFormat()` returns `'smartcard'` regardless of EMX magic — dead code branch
**File:** `src/emx-format.js:261-265` — the `if (EMX magic)` check is bypassed.

### 30. [PARSER] `parseEmxDump()` defaults to `'sysex'` when format detection returns `null`
**File:** `src/emx-format.js:486` — files between 1,728,000–1,736,703 bytes get force-parsed as SysEx.

### 31. [PARSER] BPS checksum includes block headers and padding, not just PCM data
**File:** `src/esx-format.js:797-802` — may not match what hardware expects. Needs hardware verification.

### 32. [PARSER] `buildEsxFile()` vs `createEmptyEsx()` inconsistency at mono header byte +35
**File:** `src/esx-format.js:615, 744` — empty slot writes `0x00`, populated writes `0xFF`. Spec says `0xFF = off`.

### 33. [UI] Dead functions: `featureEnabled()`, `factor2semi()`, `freq2pct()`, `hexPath()`, `drawHexCell()`, `importWav()`, `clearAll()`, `bNorm()`, `bTrim()`
**File:** `src/index.html` — defined but never called.

### 34. [UI] Drop handler calls `importWav()` instead of `importSamples()` — inconsistent with IMPORT button
**File:** `src/index.html:2090-2091` — drag-and-drop uses a different (older) import path.

### 35. [UI] Export progress callback registered repeatedly without cleanup
**File:** `src/index.html:1511, 1524` — each save/export adds a new listener.

### 36. [UI] Conversion modal cannot be closed by clicking backdrop (inconsistent with other modals)
**File:** `src/index.html:1230` — missing `onclick` handler on `convBg`.

### 37. [UI] E2S delete button class `.sx` has no CSS rule — renders with default browser styling
**File:** `src/index.html:2221` — class used in JS but no CSS definition.

### 38. [BUILD] `vitest.config.js` coverage excludes `main.js` and `preload.js`
**File:** `vitest.config.js:10` — 1,794 lines of IPC handlers, DSP, undo/redo have zero coverage tracking.

### 39. [BUILD] Build icon path mismatch: `package.json` uses `src/icon.ico`, `main.js` uses `src/icon.png`
**File:** `package.json:35` vs `main.js:15` — two icon files to maintain.

### 40. [BUILD] Debug verification code left in production
**File:** `main.js:1390-1404` — `console.log("[VERIFY]...")` runs on every ESX pattern open.

### 41. [BUILD] `node_modules/**/*` in electron-builder `files` array is redundant
**File:** `package.json:42` — electron-builder includes production deps by default.

### 42. [BUILD] `package.json` description only mentions ESX-1, not E2S/EMX/E2
**File:** `package.json:4` — misleading for a multi-device app.

---

## LOW (nice to have)

### 43. [PARSER] `parseEsxDrumPart()` skips slice number (+2-3) and FX/mod flags (+13-14)
**File:** `src/esx-format.js:854-871`

### 44. [PARSER] `buildE2sAllFile()` allows `slot >= MAX_SLOTS` — sample silently lost
**File:** `src/e2s-format.js:285-306`

### 45. [PARSER] `detectFormat()` identifies any 16,641-byte file as E2PAT by size alone
**File:** `src/file-io.js:106-108`

### 46. [PARSER] ESX uses linear interpolation for resampling vs E2S uses Catmull-Rom cubic
**File:** `src/esx-format.js:212-219` vs `src/e2s-format.js:370-389`

### 47. [PARSER] EMX SmartCard reads global params from header instead of post-pattern area
**File:** `src/emx-format.js:518`

### 48. [UI] `smpRenderList()` doesn't escape sample names in sample picker
**File:** `src/index.html:4147`

### 49. [UI] Toast system has no maximum count — batch operations can flood the screen
**File:** `src/index.html:1325`

### 50. [UI] `convExecute()` shadows global `checked` variable
**File:** `src/index.html:4054`

### 51. [UI] `applyFeatureFlags()` parameter `sel` shadows outer `sel` (selected index)
**File:** `src/index.html:1282`

### 52. [UI] `patHandleKeyboard` doesn't check for sample picker overlay
**File:** `src/index.html:3685`

### 53. [UI] `updateState` monkey-patching at line 4064 is fragile
**File:** `src/index.html:4063-4064`

### 54. [UI] Orphaned CSS: `.footer`, `#device-tabs`, `.m-guide-btn`
**File:** `src/index.html:137, 272, 186-187`

### 55. [UI] E2S list reuses ESX grid template — column widths may be misaligned
**File:** `src/index.html` — `.ss` grid uses ESX checkbox column width.

### 56. [BUILD] `fs.readdirSync` in SD card detection for macOS/Linux
**File:** `main.js:1743` — synchronous call inside 3s interval.

### 57. [BUILD] `wmic` command deprecated on Windows 11
**File:** `main.js:1724` — may break on future Windows versions.

### 58. [BUILD] `author` field in `package.json` is generic ("ESX Manager")
**File:** `package.json:16`

### 59. [BUILD] `productName` mismatch between `package.json` and CLAUDE.md
**File:** `package.json:32` — "Electribe Sample Werkstatt" vs "NBG-GESCHRUBBE"

---

## STATISTICS

| Metric | Count |
|--------|-------|
| **Total findings** | **59** |
| Critical | 7 |
| High | 15 |
| Medium | 20 |
| Low | 17 |
| **Test results** | **240/240 passing** |

### By domain

| Agent | Critical | High | Medium | Low | Total |
|-------|----------|------|--------|-----|-------|
| Binary Parsers | 2 | 3 | 5 | 5 | 15 |
| IPC Security | 2 | 4 | 5 | — | 11 |
| UI/UX | 3 | 4 | 6 | 9 | 22 |
| Build & Perf | — | 4 | 4 | 3 | 11 |

### Top 5 priority remediations

1. **Add path validation** to `save-esx-overwrite`, `esx:save-tags`, `esx:load-tags` (C3, C4)
2. **Fix ESX file size** — pad to 26,542,080 bytes in both builder functions (C1)
3. **Migrate all `ipcMain.handle` to `safeIpcHandle`** — eliminates entire class of unhandled IPC exceptions (H8)
4. **Escape all user data in `innerHTML`** — `sdPath`, error messages, sample names (C5, C6)
5. **Revoke Blob URLs** in audio playback to prevent memory leaks (C7)
