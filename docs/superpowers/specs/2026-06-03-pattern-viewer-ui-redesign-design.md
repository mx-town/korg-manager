# Pattern Viewer UI Redesign — Design Spec

**Date:** 2026-06-03
**Component:** Pattern Viewer (PARTS view) for ESX-1 and EMX-1
**File touched:** `src/index.html` (CSS + render functions only)

## Hard Constraint

**UI/layout only.** No changes to parsers (`esx-format.js`, `emx-format.js`, etc.), IPC bridge, audio/Web Audio code, pattern data, the `*PatternToUI()` converters, or any sound/technical engine. Only CSS and the DOM-building/layout portions of the pattern viewer render functions in `src/index.html` may change. Existing tests (240+) must still pass.

## Goal

Make the pattern viewer's **PARTS view fit the window with no scrolling**, from maximized down to **1280×720**. Below 1280×720, degrade gracefully (compromise/scroll acceptable). The same fix philosophy applies to both devices: replace vertical-scrolling stacks with aligned, equal-width single-row section grids sized with `clamp()` and CSS grid.

## Problems Being Solved

1. **ESX:** the whole part-parameter panel (`#partParamsPanel`, OSC / FILTER / AMP / MOD-FX) is capped at `max-height:35vh` (30vh/28vh at breakpoints) with `overflow-y:auto`, so sections get clipped and require scrolling.
2. **ESX:** drum part buttons are too large, consuming vertical space.
3. **EMX:** the synth analyzer (`#emxSynthInline`) renders misaligned (a 3-column row stacked over a 2-column row) and scrolls internally (`overflow:auto`, squeezed into `flex:1` while the step grid below takes `flex:2`).
4. **EMX:** there are two step displays — the mini `.emx-steps-row` inside the analyzer *and* the big `#seqSteps` grid below — redundant and wasting vertical space.
5. **Both:** the layout does not hold up responsively across screen sizes.

## Design

### A. EMX synth analyzer — "single row of 5" (Option B, user-selected)

- Render all **5 sections in one equal-width row**: `grid-template-columns:repeat(5,1fr)` (OSCILLATOR / FILTER / AMP-ENV / MODULATION / FX-PITCH). This replaces the current `.emx-sections` (3-col auto-fit) + `.emx-bot-row` (2-col auto-fit) split, eliminating the 3-over-2 misalignment.
- Shrink the SVG visualizations to **mini sparklines** (reduce the inline viz height; reuse existing `emxOscWaveformSvg`, `emxFilterCurveSvg`, `emxEnvelopeSvg`, `emxLfoSvg` — only their displayed size changes, not their logic).
- **Remove the redundant second step display.** Keep a single step row for EMX (consolidate the `.emx-steps-row` and the `#seqSteps` grid into one). The remaining step display must still show the selected part's steps/velocities.
- Remove `overflow:auto` from `#emxSynthInline`; size sections so the panel + step row fit the available height without scroll.
- Drum-part EMX layout (currently a 2-column variant) is brought into the same equal-width-grid approach for alignment.

### B. ESX param panel — aligned no-scroll row

- The 4 sections (OSCILLATOR / FILTER / AMP / MOD-FX) become **one aligned row**: `grid-template-columns:repeat(4,1fr)`, with all knobs in each section always visible.
- **Remove the `max-height:35vh`/`30vh`/`28vh` cap and `overflow-y:auto`** on `#partParamsPanel`; size sections to fit instead.
- **The existing `drawRotaryKnob()` SVG knobs are preserved exactly as-is** — metallic gradient body, track dots, indicator notch. Only the arrangement/placement of knobs changes, never how a knob is drawn. Knob drag/dblclick interactions (`attachKnobDrag`) remain unchanged.

### C. Drum parts — compact

- Drum part buttons (`.part-btn` in the drum group) shrink **~30%**: tighter padding, smaller label font, smaller mini step-bar height. Each button still shows: part label, sample name, mini step bar, and activity count (`activeCount/totalSteps`).

### D. Responsiveness

- Drive sizing with `clamp()` + CSS grid so the layout scales fluidly.
- Review and adjust the existing `@media (max-width:1500px)` and `@media (max-width:1200px)` blocks (and add breakpoints if needed) so nothing overflows or scrolls down to 1280×720.

## Out of Scope

- No parser / file-format / IPC / audio changes.
- No change to knob rendering, step on/off logic, velocity logic, or pattern data structures.
- GRID view (`#patGridViewWrap`, `patDrawGrid`, `patZoom`) is left untouched.
- E2 / E2S pattern rendering changes only insofar as they share the ESX PARTS-view CSS; no device-specific behavior changes intended.

## Acceptance Criteria

1. **EMX:** selecting a synth part shows all 5 sections in one aligned row with mini charts, a single step row, and **no scrollbar** at 1280×720 and above.
2. **EMX:** no 3-over-2 column misalignment; no duplicate step display.
3. **ESX:** selecting a part shows all 4 param sections with every knob visible and **no internal scroll** at 1280×720 and above; knobs render with the existing shiny SVG style.
4. **ESX:** drum part buttons are visibly smaller (~30%) while still showing label, sample name, step bar, and activity count.
5. Layout holds (no clipping/scroll in the parts view) from maximized down to 1280×720; degrades gracefully below.
6. `npm test` — all 240+ tests pass.
7. No diffs outside `src/index.html`.

## Affected Code (reference, `src/index.html`)

- CSS: `.part-btn` and `.emx-active` overrides (~897–936, ~1054–1071), `.emx-panel`/`.emx-sections`/`.emx-bot-row`/`.emx-section`/`.emx-viz` (~1078–1135), `#partParamsPanel`/`.part-knobs-panel`/`.pk-*` (~1196–1220), media queries (~1243–1298).
- JS (DOM building only): `partsRender()` (~3508–3615), `renderPartKnobs()` (~3720–3790), `emxSynthPanel()` (~3987–4137). Logic/values unchanged — only generated markup/layout.
