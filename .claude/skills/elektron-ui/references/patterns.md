# JS & Architecture Patterns

## Global State

All ESX-1 state lives in a mutable object `S` plus selection/UI vars:
```javascript
let S = { samples: [], numSamples: 0, usedPercent: '0' }, sel = -1, playing = false, fp = null, dirty = false, wfData = null;
let cursorAF = null, seekPos = 0;
const SORT_MODES = ['OFF', 'TYPE', 'NAME', 'LENGTH', 'SIZE'];
let sortMode = 0;
let checked = new Set(), lastCheckedIndex = -1;
let activeDevice = 'esx1';  // 'esx1' | 'e2s' | 'e2pat'
```

**Key principle:** `S` is refreshed from main process after every mutation via `updateState(r)`. The main process is the source of truth. The renderer only holds a snapshot.

## IPC Call Pattern

Every backend interaction follows this pattern:
```javascript
// In renderer (src/index.html):
async function doSomething() {
  const r = await window.api.methodName(args);
  if (!r) return;
  if (r.error) { toast(r.error, 'error'); return; }
  dirty = true;
  updateState(r.state || r);
  toast('SUCCESS MESSAGE', 'success');
}
```

**Error convention:** IPC handlers return `null` on cancel, `{ error: string }` on failure, or a result object on success. Always check both.

## Adding a New IPC Handler (3-file checklist)

1. **`main.js`** — Add `ipcMain.handle('channel-name', async (event, args) => { ... })`:
   ```javascript
   ipcMain.handle('my-new-action', async (event, { param1, param2 }) => {
     // Business logic here
     return { state: getState(), extraData: ... };
   });
   ```

2. **`preload.js`** — Add to `contextBridge.exposeInMainWorld('api', { ... })`:
   ```javascript
   myNewAction: (p1, p2) => ipcRenderer.invoke('my-new-action', { param1: p1, param2: p2 }),
   ```
   For namespaced APIs (E2S, patterns), add inside the appropriate sub-object:
   ```javascript
   e2s: {
     myNewAction: (slot) => ipcRenderer.invoke('e2s:my-new-action', slot),
   },
   ```

3. **`src/index.html`** — Call via `window.api.myNewAction(args)` in an async function.

## DOM Manipulation Conventions

### Element Access
```javascript
// Always getElementById — no querySelector
const el = document.getElementById('myId');
```

### Rendering Lists (innerHTML with builder)
```javascript
function renderList() {
  const l = document.getElementById('sL');
  let h = '';
  for (const s of samples) {
    h += `<div class="ss${s.index === sel ? ' act' : ''}" onclick="selS(${s.index})">`;
    h += `<div class="si">${s.index}</div>`;
    h += `<div class="sn">${esc(s.name)}</div>`;
    h += `</div>`;
  }
  l.innerHTML = h;
}
```
**Always use `esc()` for user-provided strings** to prevent XSS.

### Show/Hide
```javascript
el.style.display = 'none';    // hide
el.style.display = '';         // show (reset to CSS default)
el.style.display = 'flex';    // show as flex
```

### Class Toggle
```javascript
el.classList.add('act');
el.classList.remove('act');
el.classList.toggle('open');
el.className = `undo-btn${count ? ' on' : ''}`;  // full replacement
```

## Event Handling

### Inline onclick (preferred for list items, buttons)
```html
<button class="btn" onclick="doAction()">LABEL</button>
<div class="ss" onclick="selS(${i})" oncontextmenu="showCtxMenu(event,${i})">
```

### Global Keyboard Handler
```javascript
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;  // Don't intercept typing
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Delete') { /* ... */ }
  if (e.key === ' ' && sel >= 0) { e.preventDefault(); togglePlay(); }
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); doUndo(); }
});
```

### Drag & Drop
```javascript
el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dg'); });
el.addEventListener('dragleave', () => el.classList.remove('dg'));
el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('dg'); /* handle files */ });
```

## Toast Function
```javascript
function toast(m, t = 'info') {
  const c = document.getElementById('tW');
  const e = document.createElement('div');
  e.className = `toast ${t}`;
  e.textContent = m;
  c.appendChild(e);
  setTimeout(() => {
    e.classList.add('fading');
    e.addEventListener('animationend', () => e.remove(), { once: true });
  }, 2750);
}
// Types: 'info' (yellow), 'success' (cyan), 'error' (magenta-red)
```

## HTML Escape Helper
```javascript
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

## Modal Open/Close Pattern
```javascript
// Open: add .show class
function openMyModal() {
  document.getElementById('myBg').classList.add('show');
}

// Close: add .hiding, wait for animation, then remove both
function closeModalBg(id) {
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('show')) return;
  el.classList.add('hiding');
  el.addEventListener('animationend', () => {
    el.classList.remove('show', 'hiding');
  }, { once: true });
}
```

## Canvas Waveform Rendering (12-step recipe)

The `drawWfCanvas(canvas, data, h, cursorPos)` function:

1. **Get DPR and dimensions** — `window.devicePixelRatio`, parent `getBoundingClientRect()`
2. **Set canvas size** — `canvas.width = w * dpr`, scale context by dpr
3. **Draw background gradient** — dark blue-black gradient top→bottom
4. **Draw horizontal grid lines** — `rgba(30,80,160,.04)`, 8 divisions
5. **Draw vertical grid lines** — same color, 16 divisions
6. **Draw center line** — `rgba(30,80,160,.12)` at mid height
7. **Draw dB reference lines** — `rgba(197,48,92,.06)` at 25%, 50%, 75%
8. **Draw played region** — if cursor, blue tint `rgba(30,80,160,.04)` behind cursor
9. **Draw waveform fill** — gradient: blue→cyan→blue, trace max/min envelope
10. **Draw waveform stroke** — `rgba(0,204,255,.5)`, vertical lines from max to min
11. **Draw center brightness line** — `rgba(0,204,255,.25)`, average of max/min
12. **Draw cursor** — glow gradient + `#C5305C` line + top/bottom triangles

## FX Definition Schema
```javascript
const FX_DEFS = [
  {
    id: 'myFx',           // Unique string ID
    cat: 'time',          // 'time' | 'tone' | 'dyn'
    icon: '⚡',           // Unicode symbol
    name: 'MY FX',        // Display name (uppercase)
    desc: 'Description',  // Short description
    instant: false,       // true = no params, just an APPLY button
    params: [
      {
        id: 'mf',         // Unique param ID (used as HTML element ID)
        lbl: 'AMOUNT',    // Label (uppercase)
        min: 0,           // Range slider min
        max: 100,         // Range slider max
        val: 50,          // Default value
        zero: 50,         // Optional: zero-line indicator position
        fmt: v => v + '%' // Formatter function for display
      }
    ],
    presets: [['50%', 50], ['100%', 100]],  // Optional: [label, value] pairs
    note: 'Additional info shown below controls'  // Optional
  },
];
```

## State Update Flow

After any mutation (import, FX apply, rename, move, delete):
```
IPC call → main.js modifies currentSamples[]
         → returns { state: getState(), ...extra }
         → renderer calls updateState(r.state || r)
           → S = newState
           → renderList()     (rebuild sample list HTML)
           → updateMem()      (refresh memory bar)
           → updatePath()     (refresh path bar status)
           → updateUndo()     (refresh undo/redo button states)
```

## Device Tab Switching
```javascript
let activeDevice = 'esx1';
function switchDevice(dev) {
  if (dev === activeDevice) return;
  // Stop any playback
  if (activeDevice === 'e2pat') patStop();
  // Toggle view visibility
  document.querySelectorAll('.device-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${dev}-view`).classList.add('active');
  // Update sidebar
  document.querySelectorAll('.vsb-item').forEach(b => b.classList.remove('active'));
  /* ... activate correct button ... */
  activeDevice = dev;
}
```
Device IDs: `'esx1'`, `'e2s'`, `'e2pat'`
View element IDs: `'esx1-view'`, `'e2s-view'`, `'e2pat-view'`

## Pattern Viewer State
```javascript
let patData = null;        // Array of parsed patterns
let patSel = -1;           // Selected pattern index
let patFormat = null;      // 'esx' | 'emx' | 'e2' | 'e2s'
let patPlaying = false;
let patAudioCtx = null;
const patSampleCache = {}; // Map<sampleNum, AudioBuffer>
```

## Naming Conventions Summary

| Category | Convention | Examples |
|----------|-----------|----------|
| CSS classes | 2-3 letter abbreviations | `.ss`, `.sn`, `.wf-w`, `.btn` |
| HTML IDs | Short camelCase or abbreviations | `sL`, `wfC`, `mB`, `modalBg` |
| JS functions | camelCase, terse | `selS()`, `remCur()`, `drawWf()` |
| IPC channels | kebab-case or namespace:kebab | `'open-esx-file'`, `'e2s:open-file'` |
| CSS variables | `--` + short name | `--hi`, `--led`, `--brd-h` |
| FX IDs | lowercase single word | `'reverse'`, `'bitcrush'`, `'pitch'` |
| Param IDs | 2-letter abbreviation | `'bc'` (bitcrush), `'pt'` (pitch) |
