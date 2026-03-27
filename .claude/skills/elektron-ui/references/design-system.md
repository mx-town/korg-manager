# Design System Reference

## Complete CSS Custom Properties

### Backgrounds (darkest → lightest)
```
--void:    #04060c    Deepest black — app bg, input bg, memory bar bg
--dark:    #0a0e18    Panel bg — sidebar, headers, modal bg
--panel:   #0c1020    Button bg, toast bg
--cell:    #080c16    List cell default
--cell-h:  #101628    Hovered list cell
--cell-a:  #1a1020    Active/selected cell (purple-tinted)
```

### Primary Accent (magenta-red)
```
--hi:      #C5305C    Primary accent — borders, text, active indicators
--hi-d:    #62182E    Dimmed — borders, subtle bg
--hi-g:    rgba(197,48,92,.18)    Glow — box-shadow, text-shadow
--hi-dk:   #180810    Deep bg for accent-tinted panels
```

### Secondary Accent (blue)
```
--blue:    #1E50A0    Secondary — modify button, info states
--blue-d:  #0F2850    Dimmed — borders, scrollbar thumbs
--blue-g:  rgba(30,80,160,.15)    Glow
--blue-dk: #081420    Deep bg for blue-tinted panels
```

### LED / Active Value (cyan)
```
--led:     #00ccff    Active values, selected names, live data
--led-d:   #006688    Dimmed LED
--led-g:   rgba(0,204,255,.2)    LED glow
```

### Status Colors
```
--warn:    #ff6600    Warning (orange)
--warn-d:  #663300    Warning dimmed
--yel:     #ffe600    Info/undo (yellow)
--yel-d:   #665c00    Yellow dimmed
--cursor:  #C5305C    Playback cursor (same as --hi)
--cursor-g: rgba(197,48,92,.6)    Cursor glow
```

### Text Hierarchy
```
--txt:     #e8ecf4    Primary text (almost white)
--txt-d:   #8898aa    Secondary text (muted blue-gray)
--txt-x:   #506070    Tertiary text (dark labels, hints)
```

### Borders
```
--brd:     #1a2035    Default border
--brd-h:   #253050    Highlighted/hover border
```

### FX Category Colors (each has base, dimmed, glow)
```
--cat-time:   #00ff88 / #006633 / rgba(0,255,136,.15)     Green — Time FX
--cat-tone:   #ff0088 / #660033 / rgba(255,0,136,.15)     Pink — Tone FX
--cat-dyn:    #00d9ff / #005566 / rgba(0,217,255,.15)     Cyan — Dynamics FX
```

## Typography Matrix

### Orbitron (`--head`) — Display & Headings
| Context | Size | Weight | Spacing | Color | Extra |
|---------|------|--------|---------|-------|-------|
| Logo title | 15px | 800 | 3px | `--hi` | text-shadow: hi-g |
| Section title `.sbt` | 10px | 700 | 3px | `--blue-d` | `::after` line |
| Modal title | 14px | 800 | 4px | `--hi` | text-shadow: hi-g |
| Button label (large) | 14px | 700-800 | 4-5px | varies | — |
| Tab label `.fx-tab` | 10px | 700 | 2px | `--txt-x` → cat color | uppercase |
| Logo badge | 9px | 900 | 2px | #fff on --hi | clip-path bevel |
| Sidebar label sub | 9px | 700 | 2px | `--txt-x` | — |

### Share Tech Mono (`--lcd`) — Data & Values
| Context | Size | Weight | Spacing | Color |
|---------|------|--------|---------|-------|
| Sample name `.sn` | 14px | normal | — | `--txt` → `--led` active |
| Value display `.fx-val` | 15px | 600 | — | `--led` |
| List data `.sr .sd .sz` | 12px | normal | — | `--txt-d` |
| Label `.fx-lbl` | 13px | normal | 1px | `--txt-d` |
| Toast text | 13px | normal | — | varies by type |
| Path bar `.pbar-v` | 12px | normal | — | `--txt-d` |
| Input `.ren` | 16px | normal | 3px | `--led` | uppercase |
| Column header `.ch` | 10px | normal | 2px | `--txt-x` |
| Status/footer `.fs` | 10px | normal | 1px | `--txt-x` |

### Rajdhani (`--ui`) — Body Text
| Context | Size | Weight | Spacing | Color |
|---------|------|--------|---------|-------|
| Body default | 14px | 400 | — | `--txt` |
| Guide text `.g-p` | 15px | 400 | — | `--txt`, line-height 1.8 |
| Guide tip `.g-tip` | 14px | 400 | — | `--txt`, line-height 1.7 |

## Clip-Path System

### Standard Bevel (4px corners) — buttons, toasts, badges, status tags
```css
clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
```

### Small Bevel (3px corners) — small badges, path bar status
```css
clip-path: polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%);
```

### Large Bevel (5-7px corners) — play button, modify button, FX apply
```css
clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
/* or 7px for the modify button */
clip-path: polygon(7px 0%, 100% 0%, calc(100% - 7px) 100%, 0% 100%);
```

### Modal Corner Cut — all modals
```css
clip-path: polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px);
```
This creates a diagonal cut on top-left and bottom-right corners.

## Glow & Shadow Effects

### Text Glow
```css
/* Accent title */
text-shadow: 0 0 14px var(--hi-g);
/* LED active */
text-shadow: 0 0 8px var(--led-g);
/* Blue label */
text-shadow: 0 0 6px var(--blue-g);
```

### Box Glow (hover states)
```css
/* Accent button hover */
box-shadow: 0 0 14px var(--hi-g);
/* Modify button hover */
box-shadow: 0 0 40px var(--blue-g);
/* Modal shadow */
box-shadow: 0 0 80px rgba(30,80,160,.06), 0 0 40px rgba(197,48,92,.04);
```

### Input Focus Glow
```css
border-color: var(--led);
box-shadow: 0 0 10px var(--led-g);
```

## Scanline Overlay (always present)
```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 3px,
    rgba(0,4,16,.06) 3px, rgba(0,4,16,.06) 6px);
  pointer-events: none;
  z-index: 9998;
}
```

## Scrollbar Styling
```css
::-webkit-scrollbar { width: 5px; height: 5px }
::-webkit-scrollbar-track { background: var(--void) }
::-webkit-scrollbar-thumb { background: var(--blue-d); border-radius: 2px }
::-webkit-scrollbar-thumb:hover { background: var(--blue) }
```

## Animation Timing

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| Button transitions | 60ms | linear | background, border-color, color, box-shadow |
| Modal show `mIn` | 200ms | ease | opacity 0→1 |
| Modal hide `mOut` | 150ms | ease | opacity 1→0 |
| Toast in `tin` | 150ms | ease | opacity + translateX(16px→0) |
| Toast out `tout` | 250ms | ease | opacity + translateX(0→16px) |
| View switch `viewIn` | 150ms | ease | opacity + translateX(-4px→0) |
| FX expand `fxIn` | 150ms | ease | opacity + translateY(-4px→0) |
| Header ticker `hz` | 1.5s | linear infinite | background-position |
| Play pulse `bp` | 600ms | ease infinite | box-shadow pulse |
| Memory critical `mf` | 800ms | ease infinite | opacity pulse |

## Header Gradient
```css
background: linear-gradient(180deg, #0e1428, var(--dark));
border-bottom: 3px solid var(--hi-d);
/* Animated ticker line */
::before → repeating-linear-gradient(90deg, var(--hi) 0px, var(--hi) 6px, transparent 6px, transparent 12px)
```

## Modal Header Gradient
```css
background: linear-gradient(180deg, #0e1830, var(--dark));
```
