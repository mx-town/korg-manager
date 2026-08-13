/**
 * IPC bridge consistency.
 *
 * Every channel the preload bridge exposes must have a handler in the main
 * process. Adding one half and forgetting the other is the standing trap in
 * this codebase (CLAUDE.md: "update main.js handler + preload.js bridge +
 * renderer call site") and it fails at runtime, not at load — the renderer
 * hangs on an invoke nobody answers.
 *
 * Static source analysis rather than a live Electron run: requiring main.js
 * pulls in electron and opens a window, which a unit test cannot do.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

/** Channel names from a source file, for a given call. */
function channels(src, call) {
  const re = new RegExp(`${call}\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}

// main.js registers handlers two ways: ipcMain.handle directly, and through
// the safeIpcHandle wrapper that adds error trapping. Both count.
const handled = new Set([
  ...channels(mainSrc, 'ipcMain\\.handle'),
  ...channels(mainSrc, 'safeIpcHandle'),
]);
const invoked = channels(preloadSrc, 'ipcRenderer\\.invoke');

describe('IPC bridge', () => {
  it('finds channels on both sides at all', () => {
    // Guards the regexes themselves: a parsing change that silently matched
    // nothing would make every assertion below pass vacuously.
    expect(handled.size).toBeGreaterThan(20);
    expect(invoked.size).toBeGreaterThan(20);
  });

  it('has a main-process handler for every channel the preload bridge invokes', () => {
    const orphans = [...invoked].filter(c => !handled.has(c)).sort();
    expect(orphans).toEqual([]);
  });

  it('exposes the EMX pattern management channels on both sides', () => {
    for (const c of ['emx:open-file', 'emx:open-patterns', 'emx:apply-mapping', 'emx:rename-pattern']) {
      expect(handled.has(c), `main.js is missing a handler for '${c}'`).toBe(true);
      expect(invoked.has(c), `preload.js is missing ipcRenderer.invoke('${c}')`).toBe(true);
    }
  });
});
