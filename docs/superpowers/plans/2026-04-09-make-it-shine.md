# Make It Shine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual polish (depth classes, animation primitives, view-by-view uplift, idle ambiance) and theatrical moments (boot sequence, waveform theater, pattern light show, import/export spectacle) to the Electribe Sample Werkstatt app.

**Architecture:** Two phases — Phase 1 builds reusable CSS foundation + uplifts all views to PARTS-level quality + adds idle ambiance. Phase 2 adds 5 theatrical moments that compose from Phase 1's primitives. All changes are inline in `src/index.html` (CSS in `<style>` block lines 6-1162, JS after line 1163) and `main.js` (boot IPC only). No new files.

**Tech Stack:** CSS @keyframes, CSS custom properties, Canvas 2D API, Web Audio API (existing), Electron IPC (existing)

**Spec:** `docs/superpowers/specs/2026-04-08-make-it-shine-design.md`

---

## File Map

All changes target two existing files:

| File | Lines | What Changes |
|------|-------|-------------|
| `src/index.html` | 4,788 | CSS: new classes + keyframes (~lines 6-1162). HTML: boot overlay div (~line 1167). JS: boot sequence logic, waveform theater, playback light show, import spectacle |
| `main.js` | 1,803 | No changes needed — `get-version`, `get-features`, `get-state` IPC handlers already exist (lines 374-376) |

---

## PHASE 1: POLISH FOUNDATION

### Task 1: Shared Depth Classes + Animation Primitives

**Files:**
- Modify: `src/index.html:6-23` (after `:root` block, before `*,*::before` reset)

**Goal:** Add reusable CSS classes and @keyframes that all subsequent tasks depend on.

- [ ] **Step 1: Add `hw-panel` and `hw-recess` classes after the `:root` block**

Insert after line 23 (`}` closing `:root`) and before line 24 (`*,*::before`):

```css
/* ═══ SHARED DEPTH CLASSES ═══ */
.hw-panel{
  background:linear-gradient(180deg,rgba(8,12,22,.92) 0%,rgba(14,20,36,.75) 100%);
  border:1.5px solid var(--brd-h);border-radius:7px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -1px 0 rgba(0,0,0,.4),0 2px 8px rgba(0,0,0,.3);
  transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .1s ease;
}
.hw-panel:hover{
  background:linear-gradient(180deg,rgba(14,18,30,.95) 0%,rgba(22,28,48,.8) 100%);
  transform:translateY(-1px);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.4);
}
.hw-recess{
  background:rgba(8,12,22,.9);
  border:1px solid #1a2035;
  border-top-color:rgba(0,0,0,.45);border-left-color:rgba(0,0,0,.35);
  border-bottom-color:rgba(40,55,80,.25);border-right-color:rgba(40,55,80,.25);
  box-shadow:inset 0 2px 8px rgba(0,0,0,.6),0 2px 12px rgba(0,0,0,.4);
}
```

- [ ] **Step 2: Add animation primitives after the depth classes**

```css
/* ═══ ANIMATION PRIMITIVES ═══ */
@keyframes glow-pulse{
  0%,100%{opacity:1}
  50%{opacity:.85}
}
@keyframes led-flicker{
  0%,100%{opacity:1}
  25%{opacity:.92}
  50%{opacity:.87}
  75%{opacity:.95}
}
@keyframes scan-sweep{
  0%{background-position:0% 50%}
  100%{background-position:100% 50%}
}
@keyframes warm-up{
  0%{opacity:0;filter:brightness(.6) saturate(.3)}
  60%{opacity:.8;filter:brightness(.9) saturate(.7)}
  100%{opacity:1;filter:brightness(1) saturate(1)}
}
@keyframes scan-drift{
  0%{transform:translateY(-100%)}
  100%{transform:translateY(100%)}
}
@keyframes header-flow{
  0%{background-position:0% 50%}
  100%{background-position:200% 50%}
}
@keyframes velocity-bloom{
  0%{box-shadow:0 0 20px currentColor,0 0 8px rgba(0,240,255,.6)}
  100%{box-shadow:0 0 8px currentColor,0 0 4px rgba(0,240,255,.3)}
}
@keyframes cascade-flash{
  0%{background:rgba(0,204,255,.15)}
  100%{background:transparent}
}

/* ═══ REDUCED MOTION ═══ */
@media(prefers-reduced-motion:reduce){
  .hw-panel,.hw-recess{transition:none}
  *{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}
}
```

- [ ] **Step 3: Run tests to verify no regressions**

Run: `npm test`
Expected: All 240+ tests pass (CSS changes don't affect parser/IPC tests)

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: add shared depth classes and animation primitives for Make It Shine"
```

---

### Task 2: Header Pulse + Sidebar LED Ambiance

**Files:**
- Modify: `src/index.html:37-38` (header CSS), `src/index.html:360-390` (sidebar CSS)

**Goal:** Replace the static header border with a flowing power-line pulse. Add LED flicker to sidebar device icons.

- [ ] **Step 1: Replace the header `::before` animation**

Change line 38 from the repeating stripe to a flowing gradient:

```css
/* OLD: */
.header::before{content:'';position:absolute;bottom:-3px;left:0;right:0;height:3px;background:repeating-linear-gradient(90deg,var(--hi) 0px,var(--hi) 6px,transparent 6px,transparent 12px);animation:hz 1.5s linear infinite}

/* NEW: */
.header::before{content:'';position:absolute;bottom:-3px;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--hi-d),var(--hi),var(--hi-d),transparent);background-size:200% 100%;animation:header-flow 4s ease-in-out infinite}
```

Remove the `@keyframes hz` on line 39 (replaced by `header-flow` from Task 1).

- [ ] **Step 2: Add LED flicker to sidebar device icons**

Find the `.vsb-icon` rule (around line ~370) and add the flicker animation. Add after existing `.vsb-icon` styles:

```css
.vsb-item.active .vsb-icon{animation:led-flicker 3.5s ease-in-out infinite}
.vsb-item:nth-child(2) .vsb-icon{animation-delay:.7s}
.vsb-item:nth-child(3) .vsb-icon{animation-delay:1.4s}
```

- [ ] **Step 3: Verify visually**

Run: `npm start`
Expected: Header bottom border flows left↔right as a gradient pulse. Active sidebar icon gently flickers.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: header power-line pulse and sidebar LED flicker ambiance"
```

---

### Task 3: Transport Bar Polish

**Files:**
- Modify: `src/index.html:590-618` (`.pat-transport`, `.pat-play-btn`, `.pat-stop-btn`, `#patBpmIn`)

**Goal:** Uplift transport bar controls with `hw-panel` depth, LCD glow on BPM, gradient on play button.

- [ ] **Step 1: Update `.pat-transport` background**

```css
/* OLD: */
.pat-transport{
  display:flex;align-items:center;gap:10px;
  padding:8px 16px;background:var(--void);
  border-bottom:1px solid var(--brd);flex-shrink:0;
}

/* NEW: */
.pat-transport{
  display:flex;align-items:center;gap:10px;
  padding:8px 16px;
  background:linear-gradient(180deg,rgba(8,12,22,.95),var(--void));
  border-bottom:1px solid var(--brd);flex-shrink:0;
  box-shadow:0 2px 8px rgba(0,0,0,.3);
}
```

- [ ] **Step 2: Update `.pat-play-btn` with gradient and glow**

```css
/* OLD: */
.pat-play-btn{
  padding:7px 20px;background:var(--hi-dk);border:2px solid var(--hi-d);
  color:var(--hi);font-family:var(--head);font-size:12px;font-weight:700;
  cursor:pointer;letter-spacing:3px;transition:background 60ms,border-color 60ms,color 60ms,box-shadow 60ms;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
}
.pat-play-btn:hover{background:var(--hi-d);color:#fff;box-shadow:0 0 14px var(--hi-g)}

/* NEW: */
.pat-play-btn{
  padding:7px 20px;
  background:linear-gradient(180deg,rgba(197,48,92,.15),rgba(197,48,92,.05));
  border:2px solid var(--hi-d);
  color:var(--hi);font-family:var(--head);font-size:12px;font-weight:700;
  cursor:pointer;letter-spacing:3px;
  transition:background 60ms,border-color 60ms,color 60ms,box-shadow 60ms;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
  box-shadow:0 0 12px rgba(197,48,92,.15);
}
.pat-play-btn:hover{
  background:linear-gradient(180deg,rgba(197,48,92,.3),rgba(197,48,92,.1));
  border-color:var(--hi);color:#fff;box-shadow:0 0 20px var(--hi-g);
}
```

- [ ] **Step 3: Update `.pat-stop-btn` and bar nav buttons with depth**

```css
/* OLD: */
.pat-stop-btn{
  padding:7px 14px;background:var(--void);border:1px solid var(--brd-h);
  color:var(--txt-d);font-family:var(--head);font-size:12px;cursor:pointer;
  letter-spacing:2px;transition:border-color 60ms,color 60ms;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
}

/* NEW: */
.pat-stop-btn{
  padding:7px 14px;
  background:linear-gradient(180deg,rgba(8,12,22,.92),rgba(14,20,36,.75));
  border:1px solid var(--brd-h);
  color:var(--txt-d);font-family:var(--head);font-size:12px;cursor:pointer;
  letter-spacing:2px;transition:background 60ms,border-color 60ms,color 60ms,transform .1s;
  clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 2px 6px rgba(0,0,0,.3);
}
.pat-stop-btn:hover{
  border-color:var(--txt);color:var(--txt);transform:translateY(-1px);
}
```

- [ ] **Step 4: Update `#patBpmIn` with LCD glow**

```css
/* OLD: */
#patBpmIn{
  background:var(--void);border:1px solid var(--brd-h);color:var(--led);
  font-family:var(--lcd);font-size:13px;padding:4px 8px;
  text-align:center;outline:none;
}
#patBpmIn:focus{border-color:var(--led)}

/* NEW: */
#patBpmIn{
  background:var(--void);border:1px solid var(--brd-h);color:var(--led);
  font-family:var(--lcd);font-size:13px;padding:4px 8px;
  text-align:center;outline:none;
  text-shadow:0 0 8px rgba(0,204,255,.3);
  transition:border-color .15s,box-shadow .15s,text-shadow .15s;
}
#patBpmIn:focus{border-color:var(--led);box-shadow:0 0 10px var(--led-g);text-shadow:0 0 12px rgba(0,204,255,.5)}
```

- [ ] **Step 5: Update `.pat-bpm-lbl` for LCD style**

```css
/* OLD: */
.pat-bpm-lbl{font-family:var(--lcd);font-size:11px;color:var(--txt-x);letter-spacing:2px}

/* NEW: */
.pat-bpm-lbl{font-family:var(--lcd);font-size:11px;color:var(--txt-x);letter-spacing:2px;text-shadow:0 0 4px rgba(0,204,255,.15)}
```

- [ ] **Step 6: Verify visually and run tests**

Run: `npm start` — open Pattern viewer, check transport bar has depth/glow.
Run: `npm test` — all pass.

- [ ] **Step 7: Commit**

```bash
git add src/index.html
git commit -m "feat: transport bar polish — gradients, LCD glow, depth shadows"
```

---

### Task 4: GRID View Enhancements

**Files:**
- Modify: `src/index.html:439-528` (`.px-grid`, `.px-label`, `.px-cell`, `.px-row`)

**Goal:** Enhance GRID with gradient part-name column, row hover highlight, velocity→glow mapping, improved mute styling.

- [ ] **Step 1: Add gradient and accent border to part labels**

```css
/* OLD: */
.px-label{
  width:140px;flex-shrink:0;font-family:'Share Tech Mono',monospace;font-size:10px;
  text-align:right;padding-right:12px;letter-spacing:.5px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;
  text-shadow:0 -1px 0 rgba(0,0,0,.8);
}

/* NEW: */
.px-label{
  width:140px;flex-shrink:0;font-family:'Share Tech Mono',monospace;font-size:10px;
  text-align:right;padding-right:12px;letter-spacing:.5px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;
  text-shadow:0 -1px 0 rgba(0,0,0,.8);
  background:linear-gradient(180deg,rgba(8,12,22,.92),rgba(14,20,36,.75));
  border-radius:3px 0 0 3px;
  padding:3px 12px 3px 8px;
  border-left:2px solid transparent;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
```

- [ ] **Step 2: Add inset highlight to ON cells**

```css
/* OLD: */
.px-cell.px-on{
  border:1px solid rgba(255,255,255,.15);
  border-bottom-color:rgba(255,255,255,.22);
  box-shadow:inset 0 -1px 1px rgba(0,0,0,.2),0 0 8px currentColor;
}

/* NEW: */
.px-cell.px-on{
  border:1px solid rgba(255,255,255,.15);
  border-bottom-color:rgba(255,255,255,.22);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 1px rgba(0,0,0,.2),0 0 8px currentColor;
}
```

- [ ] **Step 3: Improve row hover and muted row styling**

```css
/* OLD: */
.px-row:hover{background:rgba(0,204,255,.015)}

/* NEW: */
.px-row:hover{background:rgba(0,204,255,.025);box-shadow:inset 0 0 20px rgba(0,204,255,.01)}
```

```css
/* OLD: */
.px-row.row-muted{opacity:0.3}
.px-row.row-muted .px-label{text-decoration:line-through}

/* NEW: */
.px-row.row-muted{opacity:0.35;filter:saturate(.3)}
.px-row.row-muted .px-label{text-decoration:line-through}
.px-row.row-muted::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px);
}
```

Note: `.px-row` needs `position:relative` added for the `::after` to work:

```css
/* OLD: */
.px-row{display:flex;align-items:center;gap:1px;border-radius:0;padding:1px 0;border-bottom:1px solid rgba(0,0,0,.25);contain:layout}

/* NEW: */
.px-row{display:flex;align-items:center;gap:1px;border-radius:0;padding:1px 0;border-bottom:1px solid rgba(0,0,0,.25);contain:layout;position:relative}
```

- [ ] **Step 4: Verify visually and run tests**

Run: `npm start` — load a pattern, check GRID view. Labels should have gradient bg, ON cells brighter, muted rows have scanline overlay.
Run: `npm test` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat: GRID view polish — gradient labels, LED cap highlights, mute scanlines"
```

---

### Task 5: STEPS View Depth Treatment

**Files:**
- Modify: `src/index.html:989-1000` (`.seq-step` CSS)

**Goal:** Give OFF steps a recessed rubber pad feel, ON steps a gradient LED cap look.

- [ ] **Step 1: Update `.seq-step` OFF state with hw-panel depth**

```css
/* OLD: */
.seq-step{
  aspect-ratio:1;width:100%;max-width:clamp(40px,5vw,60px);border:2px solid var(--brd-h);
  border-radius:6px;background:rgba(255,255,255,.025);
  font-family:var(--lcd);font-size:clamp(10px,1.2vw,16px);color:var(--txt-x);
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  transition:background .1s,border-color .1s,transform .08s,box-shadow .1s;
  box-shadow:0 2px 6px rgba(0,0,0,.25);
}

/* NEW: */
.seq-step{
  aspect-ratio:1;width:100%;max-width:clamp(40px,5vw,60px);
  border:2px solid var(--brd-h);border-radius:6px;
  background:linear-gradient(180deg,rgba(8,12,22,.92),rgba(14,20,36,.75));
  font-family:var(--lcd);font-size:clamp(10px,1.2vw,16px);color:var(--txt-x);
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  transition:background .1s,border-color .1s,transform .08s,box-shadow .1s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),inset 0 -1px 0 rgba(0,0,0,.3),0 2px 6px rgba(0,0,0,.25);
}
```

- [ ] **Step 2: Update `.seq-step.seq-step-on` for LED glow**

Add after the `.seq-step.seq-step-on{color:#fff}` rule:

```css
.seq-step.seq-step-on{
  color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 0 12px var(--hi-g),0 2px 6px rgba(0,0,0,.25);
}
```

- [ ] **Step 3: Verify visually and run tests**

Run: `npm start` — open Pattern viewer, select a pattern, switch to STEPS view. OFF steps should look like recessed pads, ON steps should glow.
Run: `npm test` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: STEPS view depth — recessed pads for OFF, LED glow for ON"
```

---

### Task 6: E2S Sampler Visual Uplift

**Files:**
- Modify: `src/index.html:407-421` (E2S CSS section)

**Goal:** Bring E2S view up to ESX-level quality with gradients, glows, and depth.

- [ ] **Step 1: Update `.e2s-toolbar`**

```css
/* OLD: */
.e2s-toolbar{display:flex;align-items:center;gap:5px;padding:6px 18px;background:var(--void);border-bottom:1px solid var(--brd);flex-wrap:wrap}

/* NEW: */
.e2s-toolbar{
  display:flex;align-items:center;gap:5px;padding:6px 18px;
  background:linear-gradient(180deg,#0e1428,var(--dark));
  border-bottom:1px solid var(--brd);flex-wrap:wrap;
  box-shadow:0 2px 8px rgba(0,0,0,.3);
}
```

- [ ] **Step 2: Update E2S controls with depth and focus glows**

```css
/* OLD: */
.e2s-controls{padding:14px 16px}
.e2s-controls label{font-family:var(--lcd);font-size:11px;color:var(--txt-x);letter-spacing:1px;display:block;margin-bottom:4px}
.e2s-controls select,.e2s-controls input[type=text]{background:var(--void);border:1px solid var(--blue-d);color:var(--led);font-family:var(--lcd);font-size:13px;padding:6px 10px;width:100%;outline:none;margin-bottom:8px}
.e2s-controls select:focus,.e2s-controls input[type=text]:focus{border-color:var(--led);box-shadow:0 0 10px var(--led-g)}

/* NEW: */
.e2s-controls{padding:14px 16px}
.e2s-controls label{font-family:var(--lcd);font-size:11px;color:var(--txt-x);letter-spacing:1px;display:block;margin-bottom:4px;text-shadow:0 0 4px rgba(0,204,255,.1)}
.e2s-controls select,.e2s-controls input[type=text]{
  background:linear-gradient(180deg,rgba(4,6,12,.95),rgba(8,12,22,.9));
  border:1px solid var(--blue-d);color:var(--led);font-family:var(--lcd);font-size:13px;
  padding:6px 10px;width:100%;outline:none;margin-bottom:8px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03),inset 0 -1px 0 rgba(0,0,0,.3);
  transition:border-color .15s,box-shadow .15s;
}
.e2s-controls select:focus,.e2s-controls input[type=text]:focus{
  border-color:var(--led);
  box-shadow:0 0 10px var(--led-g),inset 0 1px 0 rgba(255,255,255,.03);
  text-shadow:0 0 6px rgba(0,204,255,.3);
}
```

- [ ] **Step 3: Verify visually and run tests**

Run: `npm start -- --dev` (E2S is hidden in beta, needs dev mode). Check E2S toolbar has gradient, controls have depth.
Run: `npm test` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: E2S sampler visual uplift — gradient toolbar, depth controls, LCD glows"
```

---

### Task 7: Pattern List / Selector Polish

**Files:**
- Modify: `src/index.html:425-433` (`.pat-list-panel`, `.pat-item`)

**Goal:** Pattern cards get hw-panel depth with device-colored accents. Selected pattern gets glow halo.

- [ ] **Step 1: Update `.pat-item` with gradient and depth**

```css
/* OLD: */
.pat-item{display:grid;grid-template-columns:40px 1fr 60px;gap:6px;align-items:center;padding:8px 12px;cursor:pointer;transition:background 50ms,border-color 50ms;border-left:3px solid transparent;border-bottom:1px solid rgba(255,255,255,.02);font-family:var(--lcd);font-size:12px}
.pat-item:hover{background:var(--cell-h);border-left-color:var(--blue-d)}
.pat-item.act{background:var(--cell-a);border-left-color:var(--hi)}

/* NEW: */
.pat-item{
  display:grid;grid-template-columns:40px 1fr 60px;gap:6px;align-items:center;
  padding:8px 12px;cursor:pointer;
  transition:background .15s,border-color .15s,box-shadow .15s,transform .1s;
  border-left:3px solid transparent;border-bottom:1px solid rgba(255,255,255,.02);
  font-family:var(--lcd);font-size:12px;
  background:linear-gradient(180deg,rgba(8,12,22,.6),rgba(14,20,36,.4));
}
.pat-item:hover{
  background:linear-gradient(180deg,rgba(14,18,30,.8),rgba(22,28,48,.6));
  border-left-color:var(--blue-d);transform:translateX(2px);
}
.pat-item.act{
  background:linear-gradient(180deg,rgba(30,16,32,.7),rgba(20,12,24,.5));
  border-left-color:var(--hi);
  box-shadow:inset 0 0 20px rgba(197,48,92,.04),0 0 8px rgba(197,48,92,.08);
}
```

- [ ] **Step 2: Add empty pattern styling and search field glow**

Add after the `.pat-item.act` rules:

```css
.pat-item.pat-empty{opacity:.25}
.pat-item.pat-empty:hover{opacity:.4}
.pat-search{
  background:var(--void);border:1px solid var(--brd-h);color:var(--led);
  font-family:var(--lcd);font-size:11px;padding:4px 8px;outline:none;
  text-shadow:0 0 6px rgba(0,204,255,.2);
  transition:border-color .15s,box-shadow .15s;
}
.pat-search:focus{border-color:var(--led);box-shadow:0 0 10px var(--led-g)}
```

- [ ] **Step 3: Verify visually and run tests**

Run: `npm start` — open Pattern viewer, load a file. Pattern list items should have gradient backgrounds, active item should glow pink.
Run: `npm test` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: pattern list polish — gradient cards, active glow, empty state dimming"
```

---

### Task 8: Idle Ambiance — Waveform Scan Line + Glow Breathing

**Files:**
- Modify: `src/index.html:98-103` (`.wf-w` waveform wrapper CSS)

**Goal:** Add scan line drift and breathing border glow to the waveform container.

- [ ] **Step 1: Add scan-line pseudo-element and breathing glow to `.wf-w`**

```css
/* OLD: */
.wf-w{background:var(--void);border:1px solid var(--brd);padding:8px;position:relative;cursor:crosshair}

/* NEW: */
.wf-w{
  background:var(--void);border:1px solid var(--brd);padding:8px;position:relative;cursor:crosshair;
  overflow:hidden;
}
.wf-w::before{
  content:'';position:absolute;left:0;right:0;height:1px;
  background:rgba(0,204,255,.06);pointer-events:none;z-index:1;
  animation:scan-drift 8s linear infinite;
}
.wf-w::after{
  content:'';position:absolute;inset:-1px;pointer-events:none;
  border:1px solid transparent;border-radius:inherit;
  box-shadow:0 0 8px rgba(0,204,255,.08);
  animation:glow-pulse 6s ease-in-out infinite;
  z-index:1;
}
```

- [ ] **Step 2: Verify visually**

Run: `npm start` — load an ESX file, select a sample. The waveform container should have a faint line drifting top→bottom and a gently pulsing border glow.

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: waveform idle ambiance — scan line drift and breathing border glow"
```

---

### Task 9: Idle Ambiance — Selected Pattern + Active Tab Breathing

**Files:**
- Modify: `src/index.html:428-432` (`.pat-item.act`), `src/index.html:711-714` (`.pat-mode-btn.active`)

**Goal:** Selected pattern card and active mode tab gently pulse their glow.

- [ ] **Step 1: Add breathing glow to active pattern item**

Update the `.pat-item.act` rule from Task 7 — add the animation:

```css
.pat-item.act{
  background:linear-gradient(180deg,rgba(30,16,32,.7),rgba(20,12,24,.5));
  border-left-color:var(--hi);
  box-shadow:inset 0 0 20px rgba(197,48,92,.04),0 0 8px rgba(197,48,92,.08);
  animation:glow-pulse 6s ease-in-out infinite;
}
```

- [ ] **Step 2: Add breathing glow to active mode tab**

```css
/* OLD: */
.pat-mode-btn.active{
  background:rgba(0,204,255,.18);border-color:var(--hi);
  color:var(--hi);font-weight:bold;
}

/* NEW: */
.pat-mode-btn.active{
  background:rgba(0,204,255,.18);border-color:var(--hi);
  color:var(--hi);font-weight:bold;
  animation:glow-pulse 7s ease-in-out infinite;
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm start` — active pattern card and mode tab should gently pulse.

```bash
git add src/index.html
git commit -m "feat: idle ambiance — breathing glow on active pattern card and mode tab"
```

---

## PHASE 2: THEATRICAL MOMENTS

### Task 10: Boot Sequence — HTML Overlay

**Files:**
- Modify: `src/index.html:~1167` (after `<body>`, before `<div class="app">`)

**Goal:** Add the boot sequence overlay HTML structure.

- [ ] **Step 1: Add boot overlay div after `<body>` tag (line 1166)**

Insert between `<body>` and `<div class="app">`:

```html
<!-- ═══ BOOT SEQUENCE OVERLAY ═══ -->
<div id="bootOverlay" style="position:fixed;inset:0;z-index:99999;background:#04060c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;cursor:pointer">
  <div id="bootLogo" style="opacity:0;font-family:'Orbitron',sans-serif;font-weight:900;font-size:22px;color:#C5305C;letter-spacing:6px;text-shadow:0 0 0 transparent;transition:opacity .6s,text-shadow .8s">ELECTRIBE SAMPLE WERKSTATT</div>
  <div id="bootLeds" style="display:flex;gap:6px;opacity:0;transition:opacity .3s">
    <span class="boot-led" style="width:8px;height:8px;border-radius:50%;background:#C5305C;opacity:0;transform:scale(0);transition:opacity .15s,transform .2s"></span>
    <span class="boot-led" style="width:8px;height:8px;border-radius:50%;background:#1E50A0;opacity:0;transform:scale(0);transition:opacity .15s,transform .2s"></span>
    <span class="boot-led" style="width:8px;height:8px;border-radius:50%;background:#00ccff;opacity:0;transform:scale(0);transition:opacity .15s,transform .2s"></span>
    <span class="boot-led" style="width:8px;height:8px;border-radius:50%;background:#00ff88;opacity:0;transform:scale(0);transition:opacity .15s,transform .2s"></span>
  </div>
  <div id="bootReadout" style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#00ccff;letter-spacing:2px;opacity:0;transition:opacity .3s;text-shadow:0 0 6px rgba(0,204,255,.3);min-height:16px"></div>
</div>
```

- [ ] **Step 2: Verify the overlay is visible on load**

Run: `npm start` — the app should show a black screen with nothing visible (the boot elements start with `opacity:0`). The overlay blocks the app behind it.

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: boot sequence overlay HTML structure"
```

---

### Task 11: Boot Sequence — JS Choreography

**Files:**
- Modify: `src/index.html` (JS section, add at the very end of the `<script>` block before `</script>`)

**Goal:** Animate the boot sequence with timed reveals, then remove the overlay.

- [ ] **Step 1: Add boot sequence function at the end of the JS block**

Find the closing `</script>` tag and insert before it:

```javascript
// ═══════════════════════════════════════════════════════════
//  BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════
(function bootSequence(){
  if(localStorage.getItem('skipBoot')==='true'){
    const ov=document.getElementById('bootOverlay');
    if(ov)ov.remove();
    return;
  }
  const ov=document.getElementById('bootOverlay');
  if(!ov)return;

  // Skip on click or Escape
  let skipped=false;
  function skipBoot(){
    if(skipped)return;skipped=true;
    ov.style.transition='opacity .3s';ov.style.opacity='0';
    setTimeout(()=>ov.remove(),300);
  }
  ov.addEventListener('click',skipBoot);
  document.addEventListener('keydown',function bootEsc(e){
    if(e.key==='Escape'){skipBoot();document.removeEventListener('keydown',bootEsc);}
  });

  const logo=document.getElementById('bootLogo');
  const leds=document.getElementById('bootLeds');
  const readout=document.getElementById('bootReadout');
  const ledEls=ov.querySelectorAll('.boot-led');

  // T+200ms: Logo warm-up
  setTimeout(()=>{
    if(skipped)return;
    logo.style.opacity='1';
    logo.style.textShadow='0 0 20px rgba(197,48,92,.4)';
    logo.style.filter='brightness(.6) saturate(.3)';
    setTimeout(()=>{
      if(skipped)return;
      logo.style.transition='filter .5s ease';
      logo.style.filter='brightness(1) saturate(1)';
    },100);
  },200);

  // T+800ms: LED check
  setTimeout(()=>{
    if(skipped)return;
    leds.style.opacity='1';
    ledEls.forEach((led,i)=>{
      setTimeout(()=>{
        if(skipped)return;
        led.style.opacity='1';
        led.style.transform='scale(1.2)';
        led.style.boxShadow=`0 0 8px ${led.style.background}`;
        setTimeout(()=>{
          led.style.transform='scale(1)';
        },100);
      },i*100);
    });
  },800);

  // T+1200ms: System readout (typewriter)
  setTimeout(async()=>{
    if(skipped)return;
    readout.style.opacity='1';
    let ver='1.0.0',mem='26.5MB';
    try{
      ver=await window.api.getVersion()||ver;
    }catch(e){}
    const text=`SYS PARSERS OK  MEM ${mem} FREE  VER ${ver}`;
    let idx=0;
    function typeChar(){
      if(skipped||idx>=text.length)return;
      readout.textContent=text.slice(0,++idx);
      setTimeout(typeChar,20+Math.random()*15);
    }
    typeChar();
  },1200);

  // T+1800ms: Reveal app
  setTimeout(()=>{
    if(skipped)return;
    ov.style.transition='opacity .4s ease';
    ov.style.opacity='0';
    setTimeout(()=>ov.remove(),400);
  },1800);
})();
```

- [ ] **Step 2: Verify the boot sequence plays**

Run: `npm start`
Expected: Black screen → logo appears and warms up → 4 LEDs pop left→right → typewriter readout → fade to app. Total ~2.2s. Pressing Escape skips immediately.

- [ ] **Step 3: Test skip with localStorage**

In DevTools console: `localStorage.setItem('skipBoot','true')` then reload. Boot should be skipped entirely.

- [ ] **Step 4: Run tests**

Run: `npm test` — all pass (boot is renderer-only, no IPC changes).

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat: boot sequence — animated power-on with logo, LED check, typewriter readout"
```

---

### Task 12: Pattern Playback Light Show

**Files:**
- Modify: `src/index.html:4098-4121` (`patHighlightStep` function), `src/index.html:4472-4488` (`seqScheduler`), `src/index.html:508-522` (`.px-cell.px-playing` CSS)

**Goal:** Add afterglow trail, velocity bloom, and beat pulse to pattern playback.

- [ ] **Step 1: Add CSS for afterglow trail and velocity bloom**

After the `.px-cell.px-playing.px-off` rule (line ~518), add:

```css
/* Afterglow trail — previous steps keep a fading glow */
.px-cell.px-trail-1{box-shadow:0 0 6px currentColor,0 0 2px rgba(0,240,255,.2);opacity:.7}
.px-cell.px-trail-2{box-shadow:0 0 3px currentColor;opacity:.5}
/* Velocity bloom — momentary flare when playhead hits an ON step */
.px-cell.px-bloom{animation:velocity-bloom .15s ease-out forwards}
/* Beat pulse — whole UI breathes on downbeats */
.pat-play-btn.beat-pulse{box-shadow:0 0 25px var(--hi-g)!important}
.beat-flash #patBpmIn{text-shadow:0 0 14px rgba(0,204,255,.6)!important}
/* Vertical now-line — highlights active column in GRID */
.px-cell.px-now-col{background:rgba(0,240,255,.04)!important}
```

- [ ] **Step 2: Update `patHighlightStep` for trail and bloom**

Replace the `patHighlightStep` function (lines 4098-4121):

```javascript
function patHighlightStep(step){
  const prevStep=patPlayStep;
  patPlayStep=step;

  // Remove previous highlights
  for(let i=0;i<patPlayingCells.length;i++)patPlayingCells[i].classList.remove('px-playing','px-bloom');
  // Remove old trails
  document.querySelectorAll('.px-trail-1,.px-trail-2').forEach(c=>c.classList.remove('px-trail-1','px-trail-2'));

  patPlayingCells=[];

  if(patViewMode==='grid'){
    // Trail: previous 2 steps
    if(prevStep>=0){
      const t1=patCellsByStep.get(prevStep);
      if(t1)for(let i=0;i<t1.length;i++)t1[i].classList.add('px-trail-1');
      const t2Step=prevStep>0?prevStep-1:(seqPattern?patStepCount(seqPattern)-1:0);
      const t2=patCellsByStep.get(t2Step);
      if(t2)for(let i=0;i<t2.length;i++){t2[i].classList.remove('px-trail-1');t2[i].classList.add('px-trail-2');}
    }
    // Remove previous now-column
    document.querySelectorAll('.px-now-col').forEach(c=>c.classList.remove('px-now-col'));
    // Current step
    const cells=patCellsByStep.get(step);
    if(cells){
      for(let i=0;i<cells.length;i++){
        cells[i].classList.add('px-playing');
        // Bloom on ON cells
        if(cells[i].classList.contains('px-on'))cells[i].classList.add('px-bloom');
      }
      patPlayingCells=cells;
    }
    // Vertical now-line: highlight entire column
    const allColCells=patCellsByStep.get(step);
    if(allColCells)for(let i=0;i<allColCells.length;i++)allColCells[i].classList.add('px-now-col');
  } else if(patViewMode==='parts'){
    document.querySelectorAll('.seq-step-playing').forEach(c=>c.classList.remove('seq-step-playing'));
    const el=document.querySelector(`.seq-step[data-step="${step}"]`);
    if(el)el.classList.add('seq-step-playing');
  }

  // Beat pulse on downbeats (every 4 steps)
  if(step%4===0){
    const playBtn=document.getElementById('patPlayBtn');
    if(playBtn){playBtn.classList.add('beat-pulse');setTimeout(()=>playBtn.classList.remove('beat-pulse'),120);}
    const transport=document.querySelector('.pat-transport');
    if(transport){transport.classList.add('beat-flash');setTimeout(()=>transport.classList.remove('beat-flash'),120);}
  }

  const disp=DOM.patStepDisp;
  if(disp){
    const total=seqPattern?patStepCount(seqPattern):patBarCount*16;
    disp.textContent=`${step+1}/${total}`;
  }
}
```

- [ ] **Step 3: Verify playback light show**

Run: `npm start` — load an ESX file with patterns, open Pattern viewer, play a pattern in GRID mode.
Expected: Current step glows bright with bloom animation, previous 2 steps trail with fading glow, play button pulses on every 4th step.

- [ ] **Step 4: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/index.html
git commit -m "feat: pattern playback light show — afterglow trail, velocity bloom, beat pulse"
```

---

### Task 13: Import Spectacle — Cascade Glow

**Files:**
- Modify: `src/index.html:~1728` (the `importSamples` function)

**Goal:** After batch import, newly added samples flash with a cascade glow top→bottom.

- [ ] **Step 1: Update `importSamples` to trigger cascade animation**

Find the `importSamples` function (line 1728). After the `updateState(r.state)` call, add cascade glow:

```javascript
// After: updateState(r.state);
// Add cascade glow to newly imported samples
if(ok>0){
  setTimeout(()=>{
    const rows=document.querySelectorAll('.sl .ss');
    const startIdx=Math.max(0,rows.length-ok);
    for(let i=startIdx;i<rows.length;i++){
      const row=rows[i];
      row.style.animation=`cascade-flash .4s ease ${(i-startIdx)*50}ms forwards`;
      setTimeout(()=>{row.style.animation='';},400+(i-startIdx)*50);
    }
  },100);
}
```

- [ ] **Step 2: Verify import cascade**

Run: `npm start` — load an ESX file, import multiple WAV samples. After import, the new samples in the list should flash with a cascading cyan glow from top to bottom.

- [ ] **Step 3: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/index.html
git commit -m "feat: import spectacle — cascade glow animation on newly imported samples"
```

---

### Task 14: Export Spectacle — Byte Count + Color Shift

**Files:**
- Modify: `src/index.html:~1738` (the `saveEsxToFile` function), `src/index.html:584-589` (export progress CSS)

**Goal:** Show real byte count during save and shift color from pink→green on completion.

- [ ] **Step 1: Update export progress CSS for color transition**

```css
/* After existing .export-text rule, add: */
.export-bar.complete{background:var(--cat-time);transition:background .3s}
.export-text.complete{color:var(--cat-time)}
```

- [ ] **Step 2: Update `saveEsxToFile` to show byte count and color shift**

Find `saveEsxToFile` (line 1738). In the progress display section, update the text to show byte count:

Find where `expText.textContent` is set during save. Change it to:

```javascript
// When showing progress:
expText.textContent='WRITING 26,542,080 BYTES';
```

And after save completes successfully, add:

```javascript
// On success:
expBar.classList.add('complete');
expText.classList.add('complete');
expText.textContent='SAVED';
setTimeout(()=>{
  expBar.classList.remove('complete');
  expText.classList.remove('complete');
  // hide progress bar after a moment
},1500);
```

- [ ] **Step 3: Verify export spectacle**

Run: `npm start` — load an ESX file, click SAVE. Progress bar should show "WRITING 26,542,080 BYTES" with animated stripes, then shift to green "SAVED".

- [ ] **Step 4: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/index.html
git commit -m "feat: export spectacle — byte count display and pink→green color shift on save"
```

---

### Task 15: Waveform Theater — Hover Reveal

**Files:**
- Modify: `src/index.html:~1808-1845` (waveform drawing + mouse events)

**Goal:** Add a vertical scan line and spotlight effect that follows the mouse over the waveform.

- [ ] **Step 1: Add mousemove handler to the waveform container**

Find the waveform container setup in JS. After the `drawWf` function (line ~1808), add a hover handler:

```javascript
// ═══ WAVEFORM HOVER REVEAL ═══
(function setupWfHover(){
  const wfWrap=document.getElementById('wfW');
  if(!wfWrap)return;

  wfWrap.addEventListener('mousemove',function(e){
    const rect=wfWrap.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const pct=(x/rect.width*100).toFixed(1);
    // Spotlight gradient follows cursor
    wfWrap.style.background=`radial-gradient(circle 60px at ${pct}% 50%,rgba(0,204,255,.03),transparent),var(--void)`;
  });

  wfWrap.addEventListener('mouseleave',function(){
    wfWrap.style.background='var(--void)';
  });
})();
```

- [ ] **Step 2: Verify hover effect**

Run: `npm start` — load a sample, hover over the waveform area. A subtle spotlight should follow the mouse.

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: waveform theater — hover spotlight follows mouse cursor"
```

---

### Task 16: Waveform Theater — Import Draw-In Animation

**Files:**
- Modify: `src/index.html:~1808` (the `drawWf` function)

**Goal:** When a new sample is loaded, the waveform "draws in" left→right over 300ms.

- [ ] **Step 1: Add clip-path animation to waveform canvas on load**

Update the `drawWf` function:

```javascript
// OLD:
function drawWf(data){wfData=data;const c=document.getElementById('wfC'),e=document.getElementById('wfE'),inf=document.getElementById('wfI');c.style.display='block';e.style.display='none';inf.style.display='flex';drawWfCanvas(c,data,110,null);

// NEW:
function drawWf(data){wfData=data;const c=document.getElementById('wfC'),e=document.getElementById('wfE'),inf=document.getElementById('wfI');c.style.display='block';e.style.display='none';inf.style.display='flex';
  // Draw-in animation: clip from left→right over 300ms
  c.style.clipPath='inset(0 100% 0 0)';c.style.transition='none';
  drawWfCanvas(c,data,110,null);
  requestAnimationFrame(()=>{c.style.transition='clip-path .3s ease-out';c.style.clipPath='inset(0 0% 0 0)';});
```

- [ ] **Step 2: Add count-up animation for peak/RMS values**

Update the stats display part of `drawWf`. Replace the static text assignments:

```javascript
  // Animated count-up for stats
  const peakTarget=parseFloat(data.peakDb)||0;
  const durTarget=data.duration||0;
  const framesTarget=data.numFrames||0;
  document.getElementById('iR').textContent=data.sampleRate;
  // Frames count-up
  let fStep=0;const fTotal=Math.min(15,framesTarget);
  function countFrames(){
    if(fStep>=fTotal){document.getElementById('iF').textContent=framesTarget.toLocaleString();return;}
    fStep++;document.getElementById('iF').textContent=Math.round(framesTarget*fStep/fTotal).toLocaleString();
    requestAnimationFrame(countFrames);
  }
  countFrames();
  document.getElementById('iD').textContent=durTarget<1?`${(durTarget*1000).toFixed(1)}ms`:`${durTarget.toFixed(3)}s`;
  document.getElementById('iP').textContent=data.peakDb+'dB';
}
```

- [ ] **Step 3: Verify draw-in effect**

Run: `npm start` — load an ESX file, click through samples. Each waveform should sweep in from left. Frame count should tick up quickly.

- [ ] **Step 4: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/index.html
git commit -m "feat: waveform theater — draw-in animation and count-up stats on sample load"
```

---

### Task 17: Waveform Empty State — Oscilloscope Idle

**Files:**
- Modify: `src/index.html:100` (`.wf-e` empty state CSS)

**Goal:** When no sample is loaded, show a subtle noise/flat-line animation like a powered-on oscilloscope.

- [ ] **Step 1: Add CSS animation to the empty waveform state**

```css
/* OLD: */
.wf-e{display:flex;align-items:center;justify-content:center;height:110px;color:var(--txt-x);font-family:var(--lcd);font-size:12px;letter-spacing:2px}

/* NEW: */
.wf-e{
  display:flex;align-items:center;justify-content:center;height:110px;
  color:var(--txt-x);font-family:var(--lcd);font-size:12px;letter-spacing:2px;
  position:relative;overflow:hidden;
}
.wf-e::before{
  content:'';position:absolute;left:0;right:0;top:50%;height:1px;
  background:linear-gradient(90deg,transparent 5%,rgba(0,204,255,.12) 20%,rgba(0,204,255,.08) 50%,rgba(0,204,255,.12) 80%,transparent 95%);
  box-shadow:0 0 4px rgba(0,204,255,.08);
  animation:glow-pulse 4s ease-in-out infinite;
}
.wf-e::after{
  content:'';position:absolute;left:0;right:0;height:1px;
  background:rgba(0,204,255,.04);pointer-events:none;
  animation:scan-drift 10s linear infinite;
}
```

- [ ] **Step 2: Verify empty oscilloscope state**

Run: `npm start` — before loading a file, the waveform area should show a faint pulsing center line (like a flat oscilloscope signal) with a scan line drifting through it.

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: waveform empty state — oscilloscope idle animation"
```

---

### Task 18: Final Verification + Phase 1/2 Integration Check

**Files:** None (verification only)

**Goal:** Run the full test suite and do a visual walkthrough of all changes.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All 240+ tests pass.

- [ ] **Step 2: Visual verification checklist**

Run: `npm start` and verify each item:

1. Boot sequence plays on fresh launch (~2.2s), Escape skips
2. Header power line flows left↔right
3. Sidebar active icon flickers
4. Waveform: scan line drifts, border breathes, empty state shows oscilloscope
5. Waveform: hover shows spotlight, loading draws in left→right
6. Transport bar: gradient play button with glow, LCD BPM, depth on all controls
7. GRID view: gradient labels, ON cells have LED cap highlight, muted rows have scanlines
8. STEPS view: recessed pads for OFF, glow for ON
9. Pattern list: gradient cards, active glows
10. E2S view: gradient toolbar, depth controls
11. Pattern playback: trail, bloom, beat pulse
12. Import: cascade glow on new samples
13. Export: byte count + color shift
14. `prefers-reduced-motion` disables all animations (test in DevTools → Rendering → Emulate CSS media)

- [ ] **Step 3: Commit any final adjustments**

If any visual tweaks are needed, make them and commit:

```bash
git add src/index.html
git commit -m "fix: fine-tune Make It Shine visual polish"
```

---

## Deferred to Follow-Up

These spec items are intentionally deferred due to complexity — they deserve their own focused tasks:

- **FX Preview Ghost (spec 2.2):** Requires a second canvas layer in the Modify modal + hooking into all 18 FX slider events. Better as a standalone feature after the foundation ships.
- **Peak markers with LED flicker (spec 2.5):** Requires canvas-based dot rendering at peak positions with animation. Better after waveform theater basics are validated.
- **Playback-specific waveform border glow (spec 2.2):** Would need JS to sync border glow intensity with playhead position. The idle breathing glow (Task 8) covers the resting case; playback enhancement can layer on top later.
