# Make It Shine — Design Spec

**Date:** 2026-04-08
**Approach:** Layered Build (Phase 1: Polish Foundation → Phase 2: Theatrical Moments)
**Scope:** Visual polish + wow-factor UX across the entire Electribe Sample Werkstatt app
**Files affected:** `src/index.html` (CSS + JS inline), `main.js` (IPC for boot data)

---

## Aesthetic Direction

Context-driven aesthetic mixing three styles depending on the UI area:

| Area | Style | Rationale |
|------|-------|-----------|
| Pattern Grid / PARTS view | Faithful hardware replica | Trigger hardware nostalgia — real LED colors (amber, green, red), physical button feel |
| Sample Manager / FX modal | Cyberpunk evolution | These do things the hardware never could — push the aesthetic forward with neon, scan lines, glow |
| Transport / workflow controls | Studio instrument | Where users focus and work fast — smooth, confident, no distractions |

Animation level: Full theatrical. The app is a show. Fast and snappy — never blocking.

---

## Phase 1: Polish Foundation

### 1.1 Shared Depth Classes

Extract the PARTS view's premium styling into reusable CSS classes. Views adopt them by adding class names, not by rewriting CSS from scratch.

**`hw-panel`** — The PARTS-view gradient + multi-shadow combo:
- `background: linear-gradient(180deg, rgba(8,12,22,.92) 0%, rgba(14,20,36,.75) 100%)`
- `border: 1.5px solid var(--brd-h); border-radius: 7px`
- `box-shadow: inset 0 1px 0 rgba(255,255,255,.05), inset 0 -1px 0 rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.3)`
- Hover: brighter gradient, `translateY(-1px)`, deeper shadow

**`hw-recess`** — Sunken inset look for grids, sequencer backgrounds, display areas:
- `background: rgba(8,12,22,.9)`
- `box-shadow: inset 0 2px 8px rgba(0,0,0,.6), 0 2px 12px rgba(0,0,0,.4)`
- Beveled border colors (top/left darker, bottom/right lighter)

### 1.2 Animation Primitives

Consolidate the 4+ duplicate pulse animations into a shared library. Phase 2 theatrical moments compose from these.

| Keyframe | Purpose | Duration | Properties |
|----------|---------|----------|------------|
| `glow-pulse` | Box-shadow + opacity oscillation | 5-8s | LED states, active indicators, breathing borders |
| `led-flicker` | Subtle brightness jitter (0.85↔1.0) | 3-5s | Active part LEDs, status indicators, power dots |
| `scan-sweep` | Horizontal gradient sweep L→R | 3-6s | Loading states, cyberpunk scan lines |
| `warm-up` | Opacity 0→1 with color temperature shift | 0.3-0.8s | Boot sequence, element reveal, panel power-on |

### 1.3 View-by-View Polish

#### STEPS View
- OFF steps: `hw-panel` gradient + inset shadows (recessed rubber pad feel)
- ON steps: gradient fill (bright→dark of step color) + outer glow + inset top highlight (lit LED cap)
- Velocity drives glow intensity
- 4-beat markers: subtle vertical accent lines (matching GRID's existing style)
- Note: STEPS gets the depth treatment but is not the priority wow-moment — will be revisited when Part-type sequencer variants ship in v1.1

#### GRID View
- Keep existing bevel styling (already good hardware-feel)
- Part name column: `hw-panel` gradient + type-colored left accent border
- Row hover: subtle horizontal highlight strip across all cells
- ON cells: add inset top highlight ("lit LED cap" look)
- Velocity → glow radius mapping (low = tight glow, high = wide bloom)
- Muted rows: scanline overlay + desaturate filter (not just opacity reduction)

#### Transport Bar
- All controls: `hw-panel` depth treatment
- BPM display: LCD glow (`text-shadow: 0 0 8px rgba(0,204,255,.3)`, `font-family: var(--lcd)`)
- PLAY button: gradient fill with pink ambient glow; during playback glow pulses on beat
- STOP, bar nav buttons: consistent `hw-panel` styling with hover lift

#### E2S Sampler (biggest uplift)
- Toolbar: match ESX header style — `hw-panel` gradient background, bottom border glow
- Sample list: adopt ESX's row styling (selected glow, hover lift, category color accents)
- Controls panel: category dropdown, tune slider, loop type — all get `hw-panel` treatment with focus glows matching ESX
- Waveform: already shared with ESX — no changes needed
- Memory bar: add the same fill animation + gradient that ESX uses

#### Pattern List / Selector
- Pattern cards: `hw-panel` gradient with device-colored left accent (pink=ESX, blue=EMX, cyan=E2S)
- Selected pattern: brighter gradient + color glow halo + inset scanline texture
- Empty patterns: very dim with subtle crosshatch overlay (like unused hardware slots)
- Search field: LCD-style input with cyan text-shadow, focus glow ring

### 1.4 Idle Ambiance

The app breathes when you're not touching it. Four layers, all CSS-only:

**Layer 1 — LED Flicker:**
- Where: active part indicators, sidebar device icons, power/status LEDs
- How: `led-flicker` with staggered `animation-delay` (no two LEDs sync). Opacity oscillates 0.85↔1.0 over 3-5s
- Felt more than seen

**Layer 2 — Glow Breathing:**
- Where: selected pattern card border, active tab underline, waveform container border
- How: `glow-pulse` on box-shadow pseudo-elements. Very slow (5-8s cycle)
- The selected/active element gently pulses its glow as if power is flowing through it

**Layer 3 — Scan Line Drift:**
- Where: waveform display background, pattern grid background (very subtle)
- How: a single 1px bright line (`rgba(0,204,255,.08)`) drifts top→bottom over 8-10s via `translateY` on a `::before` pseudo-element
- Evokes CRT monitor feel

**Layer 4 — Header Pulse:**
- Where: the 3px pink border at the bottom of the header bar
- How: `background-position` shift on gradient (L↔R over 4s)
- Like electricity flowing through a circuit trace

### 1.5 Performance Rules

- All ambiance is pure CSS `@keyframes` + transitions — no JS animation loops
- Only animate compositor-friendly properties: `opacity`, `transform`, `background-position`
- Box-shadow animations use pseudo-elements (not direct box-shadow transitions which trigger repaints)
- All idle animations respect `@media (prefers-reduced-motion: reduce)` — turns off all ambiance
- No `will-change` pollution — only add where profiling shows jank

---

## Phase 2: Theatrical Moments

### 2.1 Boot Sequence (~2.2 seconds)

Timeline:
| Time | Event |
|------|-------|
| T+0ms | Black screen. 200ms of anticipation |
| T+200ms | Logo fades in with `warm-up` animation (cold blue → warm pink). Text-shadow blooms outward |
| T+800ms | System check LEDs light up left→right, each "pops" on with scale overshoot (1.0→1.2→1.0) |
| T+1200ms | System readout types in character-by-character. Shows real values from `get-version` and `get-state` IPC: parser status, memory available, version string |
| T+1800ms | Header power line sweeps in. Sidebar slides in from left. Main panel fades up. Ambiance begins |
| T+2200ms | READY. Full UI visible |

Implementation:
- CSS overlay (`position: fixed; z-index: 9999`) with `@keyframes` choreography
- System readout calls real IPC handlers (`get-version`, `get-features`) to display actual app state
- Runs once per app launch
- **Skip:** press Escape or click anywhere during boot
- **Disable permanently:** `localStorage.setItem('skipBoot', 'true')` toggle in future settings panel

### 2.2 Waveform Theater

**Playback Glow:**
- During audio playback, waveform canvas border gets animated glow that pulses with playhead position
- Cursor line emits a soft bloom (radial gradient overlay at cursor X position)
- When playhead crosses a peak region, glow intensifies briefly

**Hover Reveal:**
- Hovering over waveform shows a vertical scan line at cursor position
- Tooltip displays time position + sample value
- Waveform area under cursor brightens slightly — spotlight following the mouse (CSS gradient overlay keyed to `mousemove`)

**Import Animation:**
- New sample waveform "draws in" left→right over 300ms (clip-path or canvas progressive reveal)
- Peak/RMS analysis numbers count up from 0 to final value (JS `requestAnimationFrame` counter)

**FX Preview Ghost:**
- In Modify modal, adjusting an FX slider shows a "ghost" waveform overlay — dimmer copy of the original waveform drawn on a second canvas layer (visual only, not a real-time DSP preview)
- Ghost represents the pre-effect state; the main waveform shows the post-effect preview (already computed by existing FX handlers)
- Ghost fades out over 300ms when you click APPLY

### 2.3 Pattern Playback Light Show

**Playhead March:**
- Current step: boosted glow + cyan outline (existing behavior enhanced)
- New: 2-step afterglow trail behind the playhead — previous steps keep a dimming glow that decays over 150ms
- Creates sense of motion direction

**Velocity Bloom:**
- When playhead hits an ON step, the glow flares momentarily
- Bloom radius proportional to velocity (127 = max bloom)
- Decays over 150ms back to resting glow level
- Pure CSS: toggle a `.hit` class that triggers a one-shot animation

**Vertical Now Line (GRID view):**
- During playback, the active column gets a vertical highlight strip across all rows
- Faint background color (`rgba(0,240,255,.04)`) on the current column
- Sweeps across the grid in sync with the sequencer

**Beat Pulse:**
- On every downbeat (steps 1, 5, 9, 13 in 16-step mode):
  - PLAY button glow flares briefly
  - BPM display text brightens momentarily
  - Header power line pulse intensifies
- The whole UI "breathes" with the tempo
- Driven by the existing playback scheduler — adds CSS class toggles at beat boundaries

### 2.4 Import/Export Spectacle

**Batch Import:**
- VU-meter style progress bar: gradient from cyan (#00ccff) → green (#00ff88)
- Each sample "lands" in the list with a brief flash (background-color transition 150ms)
- Counter ticks up (13/20 style)
- On complete: all new samples do a cascade glow top→bottom (staggered `animation-delay` by index)

**File Save/Export:**
- Enhanced version of existing `expAnim` diagonal stripe animation
- Real byte count displayed during write ("WRITING 26,542,080 BYTES")
- Pink → green color shift on completion
- Brief "SAVED" flash in header area (toast-like but integrated into the header bar, not floating)
- Uses existing `expAnim` keyframe — no new animation needed, just color transition overlay

### 2.5 Waveform Idle Ambiance

When a sample is loaded but not playing:
- **Scan line:** Phase 1's scan-line-drift runs across the waveform canvas background
- **Border glow:** Waveform container border breathes with `glow-pulse`
- **Peak markers:** Highest peaks get tiny dot indicators that flicker with `led-flicker`
- **Empty state (no sample loaded):** Flat center line with slow noise animation — like a powered-on oscilloscope with no input signal. CSS animated gradient or canvas noise pattern

---

## What This Does NOT Include

- No new files — everything stays inline in `src/index.html` and `main.js`
- No transition choreography between views (ESX↔E2S↔Patterns) — deferred
- No STEPS view wow-factor (deferred to v1.1 Part-type sequencer variants)
- No new features — this is purely visual/animation polish
- No changes to parser logic, IPC handlers (except boot sequence reading version/state), or test suite
- No external animation libraries — pure CSS + minimal JS for interactive moments

---

## Testing & Verification

- All 240+ existing tests must still pass (`npm test`) — visual changes don't touch parser/IPC logic
- Manual verification checklist:
  - [ ] Boot sequence plays on fresh launch, skips with Escape, respects localStorage disable
  - [ ] All views (ESX, E2S, Patterns) have consistent depth/glow treatment
  - [ ] GRID bevel styling preserved and enhanced (not replaced)
  - [ ] Idle ambiance visible on all views after 3+ seconds of no interaction
  - [ ] Pattern playback shows light show (trail, bloom, now-line, beat pulse)
  - [ ] Import batch shows progress bar + cascade glow
  - [ ] Save/export shows enhanced stripe animation with byte count
  - [ ] Waveform hover shows scan line + spotlight
  - [ ] `prefers-reduced-motion: reduce` disables all idle animations
  - [ ] No visible jank or frame drops during playback light show (check with DevTools Performance tab)
  - [ ] E2S view looks as polished as ESX view
