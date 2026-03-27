# elektron-ui — NBG-GESCHRUBBE UI Skill

> Use this skill when the user asks to build, modify, or style UI elements in the NBG-GESCHRUBBE Electron app. This includes buttons, modals, panels, lists, toasts, waveform views, pattern grids, sidebar items, FX controls, or any visual/interactive feature.

## Architecture (Read First)

**Single-file UI.** All HTML, CSS, and JS live in `src/index.html` (~5000+ lines). Never create separate `.css` or `.js` files. Never import a UI framework.

**Electron IPC.** The renderer cannot access Node.js. All backend calls go through:
1. Renderer: `window.api.methodName(args)` (returns a Promise)
2. Preload (`preload.js`): maps to `ipcRenderer.invoke('channel', args)`
3. Main (`main.js`): handles via `ipcMain.handle('channel', handler)`

**No frameworks.** Vanilla JS DOM manipulation. No React, Vue, Svelte, jQuery, Lit, etc.

## Quick-Reference: Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--hi` | `#C5305C` | Primary accent (magenta-red) — active states, highlights, playback |
| `--hi-d` | `#62182E` | Dimmed accent — borders, hover bg |
| `--hi-g` | `rgba(197,48,92,.18)` | Accent glow |
| `--hi-dk` | `#180810` | Deep accent bg |
| `--blue` | `#1E50A0` | Secondary accent — modify, info |
| `--blue-d` | `#0F2850` | Dimmed blue — borders, scrollbar |
| `--blue-dk` | `#081420` | Deep blue bg |
| `--led` | `#00ccff` | Cyan "LED" — active values, names, selected text |
| `--led-d` | `#006688` | Dimmed LED |
| `--warn` | `#ff6600` | Warning orange |
| `--yel` | `#ffe600` | Yellow — undo state, info toasts |
| `--void` | `#04060c` | Darkest bg |
| `--dark` | `#0a0e18` | Panel/sidebar bg |
| `--panel` | `#0c1020` | Button/toast bg |
| `--cell` | `#080c16` | List cell bg |
| `--cell-h` | `#101628` | Hovered cell |
| `--cell-a` | `#1a1020` | Active/selected cell (purple tint) |
| `--txt` | `#e8ecf4` | Primary text |
| `--txt-d` | `#8898aa` | Dimmed text |
| `--txt-x` | `#506070` | Extra-dim text (labels, hints) |
| `--brd` | `#1a2035` | Default border |
| `--brd-h` | `#253050` | Highlighted border |

**FX Category Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--cat-time` | `#00ff88` | Time FX (green) |
| `--cat-tone` | `#ff0088` | Tone FX (pink) |
| `--cat-dyn` | `#00d9ff` | Dynamics FX (cyan) |

## Quick-Reference: Fonts

| Token | Font | Usage |
|-------|------|-------|
| `--head` | `Orbitron` | Headings, section titles, button labels (700-900 weight, 9-15px, 2-5px letter-spacing) |
| `--lcd` | `Share Tech Mono` | Values, names, data, monospaced text (12-16px, 1-3px letter-spacing) |
| `--ui` | `Rajdhani` | Body text, descriptions, guide content (14-15px) |

## Quick-Reference: Clip-Paths

**Standard bevel** (buttons, toasts, badges):
```css
clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
```

**Large bevel** (play buttons, FX apply, modify button):
```css
clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
```

**Modal corner cut** (modals):
```css
clip-path: polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px);
```

**Never use `border-radius`** for interactive elements. Use clip-path bevels instead. The only exceptions are scrollbar thumbs (`2-3px`) and small indicator dots.

## Anti-Patterns (NEVER DO)

- **No separate files** — all CSS/JS goes in `src/index.html`
- **No UI frameworks** — no React, Vue, Svelte, jQuery, Lit, Tailwind, etc.
- **No rounded corners** on buttons/panels/modals — use clip-path bevels
- **No emoji in code** — use unicode symbols or text only (emoji appear in FX icons only as a legacy choice)
- **No `border-radius`** on buttons, modals, toasts, panels
- **No CSS-in-JS**, no CSS modules, no styled-components
- **No `fetch()`** for local data — use `window.api.*` IPC calls
- **No `require()`** or `import` in renderer — context isolation is on
- **No `innerHTML` with user input** — escape with the `esc()` helper function
- **No `async/await` without error handling** — IPC calls can return `{error: string}`

## Layout Rules

- **App grid**: header → app-body (vsb sidebar 180px + app-content)
- **ESX/E2S main area**: `grid-template-columns: 1fr 340px` (list + sidebar)
- **Pattern view**: `grid-template-columns: 260px 1fr` (pattern list + grid)
- **Modals**: 94% width, max-width 1200px, 90% height for modify; smaller for guides/conversion
- **Sidebar sections**: `.sbs` with `.sbt` title (Orbitron 10px, blue-d, 3px letter-spacing, `::after` line)

## Naming Conventions

### CSS Classes (2-3 letter abbreviations)
- `.btn`, `.btn-hi`, `.btn-sm`, `.btn-warn`, `.btn-ghost` — buttons
- `.ss` — sample list row, `.si` — index, `.sn` — name, `.sf` — filename
- `.sb` — sidebar, `.sbs` — section, `.sbt` — section title
- `.wf-w` — waveform wrapper, `.wf-e` — empty state
- `.pat-*` — pattern viewer elements
- `.fx-*` — FX modal elements
- `.m-*` — modify modal elements (prefixed to avoid collisions)
- `.dz` — drop zone

### JS Functions (camelCase, terse)
- `renderList()`, `updateMem()`, `updatePath()`, `updateUndo()` — state→UI sync
- `selS(i)` — select sample, `remCur()` — remove current
- `drawWf(data)`, `drawWfCanvas(canvas,data,h,cursor)` — waveform rendering
- `openModify()`, `closeModal()` — modal lifecycle
- `toast(msg, type)` — show notification (`'info'|'success'|'error'`)
- `applyFx(id)`, `applyFxSingle(id,idx)` — FX pipeline

### HTML IDs (short, no kebab-case)
- `sL` — sample list, `sC` — sample count, `mB` — memory bar
- `wfC` — waveform canvas, `mWfC` — modal waveform canvas
- `modalBg` — modify modal backdrop, `guideBg` — guide modal backdrop
- `fxList` — FX panel container

## Reference Files

For detailed patterns, see:
- `references/design-system.md` — full CSS variable catalog, typography matrix, effects, animations
- `references/components.md` — complete CSS for every component, HTML structure templates
- `references/patterns.md` — JS conventions, IPC patterns, canvas recipes, modal lifecycle, FX schema
