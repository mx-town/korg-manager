# Pattern Viewer UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pattern viewer's PARTS view fit the window with no scrolling (maximized down to 1280×720) for both ESX-1 and EMX-1, by replacing scrolling stacks with aligned single-row section grids, shrinking drum part buttons, and fixing the EMX synth analyzer layout.

**Architecture:** Pure UI change inside the single file `src/index.html` (inline CSS + DOM-building portions of three render functions). No parser/IPC/audio/data changes. The existing SVG rotary knobs (`drawRotaryKnob`) and EMX viz functions are reused unchanged — only their arrangement/size changes.

**Tech Stack:** Vanilla JS + vanilla CSS (CSS grid, `clamp()`, media queries) inside `src/index.html`. Electron 28 app. Vitest for the existing parser test suite.

---

## Important context for the implementer

- **Everything happens in `src/index.html`.** Do not edit any `.js` parser file, `main.js`, `preload.js`, or anything under `src/*-format.js`.
- **There is no DOM/visual test harness.** The Vitest suite (`npm test`, 240+ tests) only covers binary parsers and never imports `index.html`. Therefore automated TDD does not apply to these layout changes. Verification for each task is: (a) `npm test` still passes (regression safety / proves you didn't touch parser files), and (b) **manual visual verification** by launching the app and observing the parts view. Each task gives the exact thing to look for.
- **Line numbers drift** as you edit. Every edit below identifies the target by its CSS selector or JS code, and shows the exact current text to replace. Use the Edit tool with the shown old → new strings.
- **Launching the app:** `npm start` (Electron dev mode). To verify, open a pattern file via the app's file picker. For EMX use a real dump in `test-data/emx/` (e.g. `BEST.EMX`). For ESX/E2 use one of your own `.esx`/`.e2sallpat` files. In the PATTERNS VIEWER tab, ensure PARTS mode is active, then resize the window to ~1280×720 and observe.
- **Pixel values are starting points.** Layout work is iterative; if something still clips at 1280×720 after a task, nudge the relevant `clamp()` max value down. Task 4 is a dedicated tuning pass.
- **Commit after every task.** Work is on branch `pattern-viewer-ui-redesign`.

---

## File Structure

Single file modified: `src/index.html`

| Region (identified by selector / function) | Responsibility | Tasks |
|---|---|---|
| `.part-knobs-panel`, `.pk-sections`, `.pk-section`, `.pk-sep` (CSS) + `renderPartKnobs()` (JS) | ESX part-parameter panel layout | 1 |
| `.part-btn`, `.part-type-lbl`, `.part-sample-lbl`, `.part-step-bar` (CSS) | Part button size | 2 |
| `.emx-sections`, `.emx-bot-row`, `#emxSynthInline`, `.emx-viz` (CSS) + `emxSynthPanel()` (JS) | EMX synth analyzer layout | 3 |
| `@media (max-width:1500px)` / `(max-width:1200px)` blocks (CSS) | Responsive behavior | 4 |

---

## Task 1: ESX param panel → single aligned no-scroll row

**Files:**
- Modify: `src/index.html` — CSS rules `.part-knobs-panel`, `.pk-sections`, `.pk-section`; JS `renderPartKnobs()`; media-query overrides for `.pk-section` / `.part-knobs-panel`.

**Why:** Currently `.part-knobs-panel` is capped (`max-height:35vh; overflow-y:auto`) and `.pk-sections` is a wrapping flexbox, so the 4 sections (OSC/FILTER/AMP/MOD-FX) wrap and scroll. We want one aligned row of 4 equal columns, no scroll. The render function inserts `.pk-sep` separator divs between sections; those must be removed so a 4-column grid counts correctly.

- [ ] **Step 1: Remove the separator divs from the render output**

In `renderPartKnobs()`, find:

```javascript
  layout.forEach((section,si)=>{
    if(si>0)html+='<div class="pk-sep"></div>';
    html+='<div class="pk-section">';
```

Replace with (drop the `.pk-sep` line):

```javascript
  layout.forEach((section,si)=>{
    html+='<div class="pk-section">';
```

- [ ] **Step 2: Make the panel non-scrolling**

Find the `.part-knobs-panel` rule:

```css
.part-knobs-panel{
  padding:clamp(4px,0.5vh,10px) clamp(8px,1.5vw,32px);
  border-top:1px solid var(--brd);border-bottom:1px solid var(--brd);
  flex:2;min-height:0;overflow-x:hidden;overflow-y:auto;max-height:35vh;
  display:flex;flex-direction:column;
}
```

Replace with:

```css
.part-knobs-panel{
  padding:clamp(4px,0.5vh,10px) clamp(8px,1.5vw,32px);
  border-top:1px solid var(--brd);border-bottom:1px solid var(--brd);
  flex:2;min-height:0;overflow:hidden;
  display:flex;flex-direction:column;
}
```

- [ ] **Step 3: Make sections a 4-column grid instead of wrapping flex**

Find:

```css
.pk-sections{display:flex;gap:clamp(4px,0.6vw,16px);align-items:flex-start;flex-wrap:wrap;justify-content:center;flex:1;min-height:0}
.pk-section{display:flex;flex-direction:column;align-items:center;gap:clamp(1px,0.2vh,4px);flex:1 1 clamp(160px,22vw,280px);min-width:clamp(140px,18vw,200px)}
```

Replace with:

```css
.pk-sections{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(4px,0.6vw,16px);align-items:start;flex:1;min-height:0}
.pk-section{display:flex;flex-direction:column;align-items:center;gap:clamp(1px,0.2vh,4px);min-width:0}
```

- [ ] **Step 4: Stop the media queries from forcing wrap / re-adding a height cap**

In the `@media (max-width:1500px)` block, find:

```css
  .pk-sep{display:none}
  .pk-sections{gap:6px 10px}
  .pk-section{flex:1 1 200px;min-width:180px}
```

Replace with (keep grid, just tighten gap):

```css
  .pk-sections{gap:6px 10px}
```

In the same 1500px block, find:

```css
  .part-knobs-panel{padding:clamp(2px,0.4vh,6px) clamp(6px,1vw,16px);max-height:30vh}
```

Replace with:

```css
  .part-knobs-panel{padding:clamp(2px,0.4vh,6px) clamp(6px,1vw,16px)}
```

In the `@media (max-width:1200px)` block, find:

```css
  .pk-sections{gap:4px 8px}
  .pk-section{flex:1 1 45%;min-width:150px}
```

Replace with (below 1280 we allow a 2×2 grid as graceful degradation):

```css
  .pk-sections{grid-template-columns:repeat(2,1fr);gap:4px 8px}
```

In the same 1200px block, find:

```css
  .part-knobs-panel{max-height:28vh;flex:1.5}
```

Replace with:

```css
  .part-knobs-panel{flex:1.5}
```

- [ ] **Step 5: Regression test**

Run: `npm test`
Expected: all tests pass (same count as before, 240+). This proves no parser file was touched.

- [ ] **Step 6: Visual verification**

Run: `npm start`. Open an ESX/E2 pattern file. Go to PATTERNS VIEWER → PARTS mode. Select a drum part.
Expected: the param panel shows **4 sections in one row** (OSCILLATOR, FILTER, AMP, MOD/FX) with **every knob visible and no scrollbar**. Resize window down to ~1280×720 — still 4 columns, no scroll (knobs shrink). The rotary knobs still render with the metallic/shiny SVG look. Below 1280 the sections may drop to a 2×2 grid — acceptable.

- [ ] **Step 7: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): ESX part param panel as single no-scroll row"
```

---

## Task 2: Shrink part buttons ~30% (drum parts "too big")

**Files:**
- Modify: `src/index.html` — CSS rules `.part-btn`, `.part-type-lbl`, `.part-sample-lbl`, `.part-step-bar`.

**Why:** On large monitors (above the 1500px breakpoint) the base `.part-btn` sizing is too large. Reduce the base max values ~30%. The buttons keep showing label, sample name, mini step bar, and activity count.

- [ ] **Step 1: Shrink the button padding/gap**

Find:

```css
.part-btn{
  border:1.5px solid var(--brd-h);border-radius:7px;
  background:linear-gradient(180deg,rgba(8,12,22,.92) 0%,rgba(14,20,36,.75) 100%);
  padding:clamp(6px,0.8vh,20px) clamp(3px,0.3vw,10px) clamp(4px,0.6vh,14px);
  cursor:pointer;display:flex;flex-direction:column;
  align-items:center;gap:clamp(2px,0.5vh,8px);position:relative;
  flex:1;min-width:0;
```

Replace the `padding` and `gap` lines (leave the rest of the rule unchanged):

```css
  padding:clamp(4px,0.55vh,13px) clamp(2px,0.25vw,7px) clamp(3px,0.45vh,9px);
```
and
```css
  align-items:center;gap:clamp(2px,0.4vh,5px);position:relative;
```

(Resulting `.part-btn` block:)

```css
.part-btn{
  border:1.5px solid var(--brd-h);border-radius:7px;
  background:linear-gradient(180deg,rgba(8,12,22,.92) 0%,rgba(14,20,36,.75) 100%);
  padding:clamp(4px,0.55vh,13px) clamp(2px,0.25vw,7px) clamp(3px,0.45vh,9px);
  cursor:pointer;display:flex;flex-direction:column;
  align-items:center;gap:clamp(2px,0.4vh,5px);position:relative;
  flex:1;min-width:0;
```

- [ ] **Step 2: Shrink the part label font**

Find:

```css
.part-type-lbl{
  font-family:var(--head);font-size:clamp(14px,1.8vw,20px);font-weight:700;
  letter-spacing:1px;line-height:1;
}
```

Replace with:

```css
.part-type-lbl{
  font-family:var(--head);font-size:clamp(11px,1.3vw,15px);font-weight:700;
  letter-spacing:1px;line-height:1;
}
```

- [ ] **Step 3: Shrink the sample-name label**

Find:

```css
.part-sample-lbl{
  font-family:var(--lcd);font-size:clamp(9px,1vw,12px);color:#8a9aac;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:100%;text-align:center;padding:clamp(2px,0.4vh,6px) 2px;
}
```

Replace with:

```css
.part-sample-lbl{
  font-family:var(--lcd);font-size:clamp(8px,0.8vw,10px);color:#8a9aac;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:100%;text-align:center;padding:clamp(1px,0.3vh,4px) 2px;
}
```

- [ ] **Step 4: Slightly shrink the mini step bar**

Find:

```css
.part-step-bar{
  display:flex;gap:1px;width:100%;height:clamp(4px,0.6vh,8px);margin-top:auto;
  padding:0 2px;box-sizing:border-box;
}
```

Replace with:

```css
.part-step-bar{
  display:flex;gap:1px;width:100%;height:clamp(3px,0.45vh,6px);margin-top:auto;
  padding:0 2px;box-sizing:border-box;
}
```

- [ ] **Step 5: Regression test**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Visual verification**

Run: `npm start`. ESX pattern → PARTS view.
Expected: part buttons (drum row of 9 + second row) are visibly **smaller/more compact** than before, while still showing label, sample name, step bar, and activity count. More vertical room is now free above the param panel.

- [ ] **Step 7: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): shrink pattern part buttons ~30%"
```

---

## Task 3: EMX synth analyzer → single row of 5, mini charts, one step row, no scroll

**Files:**
- Modify: `src/index.html` — JS `emxSynthPanel()` (both the `isSynth` branch and the `else`/drum branch); CSS `#emxSynthInline`, `#emxSynthInline .emx-viz svg`.

**Why:** Today the synth analyzer renders a 3-column row (`.emx-sections`) stacked over a 2-column row (`.emx-bot-row`) — misaligned — plus its own `.emx-steps-row`, inside a scrolling container, while a second full step grid (`#seqSteps`) renders below it. Fix: put all 5 sections in one equal-width grid, shrink the charts to sparklines, delete the analyzer's own step row (keep the main `#seqSteps`), and stop the container scrolling.

- [ ] **Step 1: Synth branch — make the 5 sections one grid**

In `emxSynthPanel()`, in the `if(isSynth){` branch, find:

```javascript
    // ── 3-column top row: OSC | FILTER | AMP/ENVELOPE ──
    h+=`<div class="emx-sections">`;
```

Replace with:

```javascript
    // ── single row: OSC | FILTER | AMP/ENV | MOD | FX/PITCH ──
    h+=`<div class="emx-sections" style="grid-template-columns:repeat(5,1fr)">`;
```

- [ ] **Step 2: Synth branch — remove the bottom-row wrapper so MOD + FX/PITCH join the same grid**

Still in the `isSynth` branch, find:

```javascript
    h+=`</div>`; // end emx-sections

    // ── 2-column bottom row: MOD | FX/PITCH ──
    h+=`<div class="emx-bot-row">`;

    // MODULATION
```

Replace with (delete the `</div>` that closed emx-sections and the `.emx-bot-row` opener, so MOD/FX stay inside the single grid):

```javascript
    // MODULATION
```

Then find the end of the FX/PITCH section in the synth branch:

```javascript
    h+=`</div></div>`;

    h+=`</div>`; // end emx-bot-row

  } else {
```

Replace with (one `</div>` closes the FX section, the next closes the single `.emx-sections` grid):

```javascript
    h+=`</div></div>`;

    h+=`</div>`; // end emx-sections

  } else {
```

- [ ] **Step 3: Drum branch — make its 4 sections one row**

In the `else` (drum) branch, find:

```javascript
    // ── DRUM PART: 2-column layout ──
    h+=`<div class="emx-sections" style="grid-template-columns:1fr 1fr">`;
```

Replace with:

```javascript
    // ── DRUM PART: single row layout ──
    h+=`<div class="emx-sections" style="grid-template-columns:repeat(4,1fr)">`;
```

- [ ] **Step 4: Drum branch — merge the bottom row into the single grid**

In the drum branch, find:

```javascript
    h+=`</div>`;

    // ── Bottom row: MOD | FX ──
    h+=`<div class="emx-bot-row">`;

    // MOD
```

Replace with:

```javascript
    // MOD
```

Then find the end of the drum FX section:

```javascript
    h+=`</div></div>`;

    h+=`</div>`;
  }
```

Replace with:

```javascript
    h+=`</div></div>`;

    h+=`</div>`; // end emx-sections
  }
```

- [ ] **Step 5: Remove the analyzer's own step row (keep the main #seqSteps grid)**

Find:

```javascript
  // ── Step sequence row ──
  const steps=part.steps||[];
  const vels=part.velocities||[];
  const nSteps=Math.min(steps.length,16);
  h+=`<div class="emx-steps-row">`;
  for(let s=0;s<nSteps;s++){
    const on=steps[s];
    const vel=vels[s]||0;
    const ht=on?Math.max(4,Math.round((vel/127)*24)):2;
    const cls=on?(vel>110?'accent':'on'):'off';
    h+=`<div class="emx-step ${cls}" style="height:${ht}px"></div>`;
  }
  h+=`</div>`;

  h+=`</div>`; // end emx-panel
  return h;
```

Replace with (drop the steps-row loop entirely):

```javascript
  h+=`</div>`; // end emx-panel
  return h;
```

- [ ] **Step 6: Stop the analyzer container from scrolling and let it size to content**

Find:

```css
#emxSynthInline{overflow:auto;flex:1;min-height:0}
```

Replace with:

```css
#emxSynthInline{overflow:hidden;flex:none}
```

- [ ] **Step 7: Shrink the inline charts to sparklines**

Find:

```css
#emxSynthInline .emx-viz svg{height:80px}
```

Replace with:

```css
#emxSynthInline .emx-viz svg{height:34px}
```

- [ ] **Step 8: Regression test**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Visual verification**

Run: `npm start`. Open `test-data/emx/BEST.EMX` (PATTERNS VIEWER → PARTS).
- Select a **synth** part (S1–S5): expect **5 aligned equal-width sections in one row** (OSCILLATOR, FILTER, AMP/ENV, MODULATION, FX/PITCH) with small sparkline charts, then a **single** 16-step grid below (no duplicate mini step row inside the analyzer), and **no scrollbar** in the analyzer at 1280×720.
- Select a **drum** part (D1–D4): expect **4 aligned sections in one row** (FILTER, ENVELOPE/AMP, MODULATION, FX), single step grid, no scroll.
- Confirm there is no longer a 3-over-2 column misalignment.

- [ ] **Step 10: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): EMX synth analyzer single-row layout, no scroll, single step grid"
```

---

## Task 4: Responsive tuning pass (maximized → 1280×720)

**Files:**
- Modify: `src/index.html` — `@media (max-width:1500px)` and `@media (max-width:1200px)` blocks, plus any `clamp()` max value that still causes overflow.

**Why:** After Tasks 1–3 the structure is correct; this pass guarantees no clipping/scroll in the PARTS view across the supported range and tidies the breakpoints.

- [ ] **Step 1: Test ESX at three sizes**

Run: `npm start`, open an ESX pattern, PARTS view. Check at: (a) maximized, (b) ~1500×900, (c) ~1280×720.
Expected at all three: no scrollbar anywhere in the parts view; parts row, 4-section param panel, 16-step grid, and bar nav are all fully visible.

- [ ] **Step 2: If anything clips at 1280×720, reduce the offending `clamp()` max**

For each element that overflows, lower its `clamp(min, pref, max)` **max** value in the relevant rule (e.g. `.part-btn` padding, `.pk-knob` size, `.seq-step` `max-width`, `.parts-rows` gap). Make one change, re-check, repeat. Document each change in the commit message. If nothing clips, make no change and note that in the commit.

- [ ] **Step 3: Test EMX at three sizes**

Run: `npm start`, open `test-data/emx/BEST.EMX`, PARTS view, select a synth part. Check maximized, ~1500×900, ~1280×720.
Expected: 5-section analyzer + single step grid + bar nav fully visible, no scroll, at all three sizes. If the analyzer is too tall at 1280×720, reduce `#emxSynthInline .emx-viz svg{height:34px}` toward `28px` and/or tighten `#emxSynthInline .emx-section` padding (`#emxSynthInline .emx-section{padding:8px 10px}` → `6px 8px`).

- [ ] **Step 4: Regression test**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "fix(ui): tune pattern viewer responsiveness down to 1280x720"
```

---

## Task 5: Final verification & branch wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Full regression**

Run: `npm test`
Expected: all 240+ tests pass.

- [ ] **Step 2: Confirm no out-of-scope diffs**

Run: `git diff main --stat`
Expected: only `src/index.html`, the spec doc, the plan doc, and `.gitignore` appear. If any parser/`main.js`/`preload.js`/`*-format.js` file appears, revert that change — it violates the spec.

- [ ] **Step 3: End-to-end visual smoke test**

Run: `npm start`. Verify in PARTS view:
- ESX/E2 file: compact part buttons, 4-section no-scroll param panel with shiny knobs.
- EMX file: 5-section (synth) / 4-section (drum) single-row analyzer, single step grid, no scroll.
- No console errors in DevTools.

- [ ] **Step 4: Hand off**

Report results. The branch `pattern-viewer-ui-redesign` is ready for the finishing-a-development-branch step (merge / PR), to be run separately.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Spec §A EMX analyzer single-row + sparklines + remove duplicate step + no scroll → Task 3 ✓
- Spec §B ESX param panel single aligned row, remove max-height/overflow, keep `drawRotaryKnob` → Task 1 ✓ (knobs untouched; only `.pk-sep` removal + grid)
- Spec §C drum parts ~30% smaller → Task 2 ✓
- Spec §D responsiveness down to 1280×720 → Task 4 ✓
- Spec acceptance criterion "no diffs outside src/index.html" → Task 5 Step 2 ✓
- Spec "npm test passes" → every task's regression step + Task 5 ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact old → new text. ✓

**Type/selector consistency:** Selectors referenced (`.pk-sections`, `.pk-section`, `.pk-sep`, `.part-btn`, `.part-type-lbl`, `.part-sample-lbl`, `.part-step-bar`, `.emx-sections`, `.emx-bot-row`, `#emxSynthInline`, `.emx-viz`) all match the current source read during planning. The `.emx-bot-row` rule remains defined in CSS but becomes unused after Task 3 — harmless (no separate cleanup task needed; removing an unused rule is optional). ✓

**Note on TDD:** Automated tests deliberately omitted for layout — no DOM test harness exists and adding one is out of scope per the spec. Verification is regression (`npm test`) + manual visual checks with explicit expected observations.
