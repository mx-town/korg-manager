# Pattern Viewer: LCD Param Display + Label Contrast — Design Spec

**Date:** 2026-07-07
**Component:** Pattern Viewer (PARTS view) for ESX-1 and EMX-1
**File touched:** `src/index.html` only (CSS + pattern viewer render/event code)

## Hard Constraint

**UI/behavior of the pattern viewer only.** No changes to parsers (`esx-format.js`,
`emx-format.js`, …), IPC bridge, audio code, or the `*PatternToUI()` converters.
The ESX-1 / E2S Sample Manager UI (already with beta testers) must remain
pixel-identical. Existing tests (243) must still pass.

## Goals

1. **Label contrast:** the small gray labels in the pattern viewer are too dark
   against the near-black background and hard to read at their tiny sizes.
2. **LCD param display:** a Korg-hardware-style LCD in the param panel header
   that mirrors the last-touched knob, lets you page through parameters, and
   (ESX only) lets you type a value directly.

## Part 1 — Label Contrast (scoped to pattern viewer)

Brighten only the pattern viewer label classes. Starting values (to be tuned
live in the running app; pixel values are starting points, not contracts):

| Selector | Current | New (start) | Note |
|---|---|---|---|
| `.pk-knob-label` | `var(--txt-x)` = `#7888a0` | `#a8b6c8` | + `font-weight:600` if the font supports it cleanly |
| `.pk-section-label` | `var(--txt-x)` | `#a8b6c8` | |
| `.parts-group-label` | `var(--txt-x)` | `#a8b6c8` | |
| `.part-sample-lbl` | `#8a9aac` | `#aab8ca` | |
| `.emx-knob-lbl` | `var(--txt-x)` at 7px | `#a8b6c8` | EMX param labels — same new tone so both devices match |

- `.pk-knob-value` (colored LCD numbers) stays unchanged — already readable.
- `.emx-sec-label` stays unchanged (uses `--hi` pink, already readable).
- Global variables `--txt-d` / `--txt-x` stay unchanged (Sample Manager
  untouched).

## Part 2 — LCD Component

**Placement:** right side of `.part-knobs-header` (ESX) and the EMX panel
header. The header is currently ~20px tall; the LCD may raise it to ~26–30px.
This must not reintroduce clipping at the three reference sizes (see Part 5).

**Structure (DOM + CSS, no canvas):**

```
[◀] [ PARAM-NAME        VALUE ] [▶]
```

- One flex row: prev button, display body, next button.
- Display body: param name (small, letter-spaced) + formatted value
  (Share Tech Mono, larger).
- **Look:** dark amber backlight panel (`#1a1206`-ish base, amber text
  `#ffb84d`-ish), subtle glow, faint scanline gradient overlay, inset
  "glass" border. Reads as a hardware-LCD quote inside the existing
  cyberpunk aesthetic.
- ◀ ▶ are compact square buttons in the existing button style.

## Part 3 — Behavior (ESX)

- **Mirror:** every knob interaction routed through `attachKnobDrag`
  (drag, dblclick-reset) updates the LCD with that param's label and
  formatted value (reuse the existing `fmt` functions from the knob
  `layout` definitions).
- **Navigation:** ◀ ▶ steps through the same `layout` param list used to
  render the knob sections for the selected part. The knob belonging to
  the currently shown param gets a brief highlight ring so the user can
  locate it.
- **Edit:** clicking the value swaps it for an inline `<input>`.
  - Enter commits, Esc cancels, blur cancels.
  - Committed values are clamped to the param's `min`/`max`.
  - The commit goes through **the same setter path the knob drag uses**,
    so the knob rotates to match, `patDirty` is set, and the SAVE button
    behaves exactly as with knob edits. No new write path.
  - Non-numeric input reverts to the previous value (no toast needed).
- **Part switch:** LCD resets to the first parameter of the newly selected
  part.
- **View switch (STEPS/GRID):** LCD lives in the PARTS panel header and
  simply disappears with it; no extra handling.

## Part 4 — EMX

Same LCD appears in the EMX panel header, but **display + navigation only**
(EMX files are read-only — no write support exists):

- ◀ ▶ pages through the parsed parameters of the selected EMX part.
- Value is not clickable; no input mode.
- There are no knobs on the EMX side, so there is no mirror source; the LCD
  is purely a nav/readout element there.

## Part 5 — Scope, Verification, Tests

- Only `src/index.html` changes.
- `npm test` — all 243 tests must pass (proves no parser/IPC files touched).
- Visual verification in the running app (CDP-driven, as in the Task-4
  tuning pass) at three sizes: maximized (~1536×826), ~1500×900, 1280×720:
  - no clipping/scrollbars in PARTS view (Task 4 guarantee must hold with
    the taller header),
  - LCD readable at all sizes,
  - label contrast visibly improved, tuned live with the user.
- Functional verification (ESX): knob drag mirrors to LCD; ◀ ▶ pages and
  highlights knobs; typed value updates knob + marks dirty; SAVE writes as
  before. (EMX): paging works, no edit affordance.

## Out of Scope

- No canvas/dot-matrix rendering.
- No LCD in the transport bar or STEPS/GRID views.
- No EMX write support.
- No changes to Sample Manager screens.
- No motion-sequence or audio behavior changes.
