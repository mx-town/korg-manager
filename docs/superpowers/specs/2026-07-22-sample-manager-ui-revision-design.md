# Sample Manager UI — Tabs + Snap-Split (Revision) — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming session). Supersedes the UI/layout portion of the
2026-07-17 Unified Sample Manager spec; the data model, `bank:*` API, copy/conversion
rules, and device-neutral DSP from that spec stay in force.
**Motivation:** The 2026-07-17 spec's "always two-pane commander" layout (built and
committed as `#bank-view`, commit `b3b9d46`) felt too heavy — two panes even when only one
file is open. The user wants a **single, calm view by default** that only splits when a
second file is opened, using UX patterns people already know (browser tabs + editor/window
snap). The look stays the existing app theme; the editor stays exactly as it is.

## Scope

**Renderer UI only.** The main-process core is already built, tested, and committed on this
branch: `src/bank.js` (dual-bank model, load/detect, `copySamples` with ESX↔E2S conversion,
slot allocation, all-or-nothing preflight), the eight `bank:*` IPC handlers in `main.js`,
the `api.bank.*` preload bridge, and device-neutral DSP fixes. All 283 tests pass. This work
only builds the bedien-shell that drives that API.

Out of scope: the editor (reused unchanged — see below), Project B (Sample Import 2.0),
Project C (Import comfort), any new device-identity colors, any hardware/retro restyling
(both explicitly rejected during brainstorming).

## Interaction design

- **Files as tabs.** Each open file (bank) is a tab with the device shown as a label
  (`ESX-1` / `E2S`). One file open → **one full-width sample view**, feeling like today's
  single-device manager.
- **Open a second file → drag its tab to the left OR right edge** of the content area; a
  drop-zone overlay previews where it will dock, release **snaps** it into a side-by-side
  split (Windows-Snap / VS-Code "split editor" muscle memory). A pane's **✕** collapses back
  to a single view. A tab can be dragged onto either pane to reassign which file shows there.
  Nothing is sticky.
- **Any device combination** is valid: ESX+ESX, ESX+E2S, E2S+E2S.
- **Sample transfer:** drag sample rows between the two panes → copy via
  `bank:copySamples(from, slots, to, targetSlot)`. Cross-device copies auto-convert
  (44.1↔48 kHz); a toast reports `result.message` (or `result.error` on the typed
  preflight failure, banks untouched). **Drop on an occupied slot** → overwrite-confirm
  dialog naming both samples; **drop on empty area** → next free slots. Multi-select
  (Ctrl/Shift) drags several at once; a **"⇄ copy marked"** footer button is the
  button-alternative.

## Look

The existing app cyberpunk theme, **unchanged** — same CSS custom properties, fonts,
clip-path bevels. Panes are told apart by the existing device badge/label text, not by any
new per-device colour. No amber, no metal knobs, no faceplate screws (all rejected in
brainstorming).

## Editor

The existing **MODIFY modal is reused 1:1, unchanged**, opened via `✎` / double-click as it
is today (blue waveform analyser + FX list). **Any editor change is explicitly deferred to a
separate future "editor" task** — not part of this work. For E2S samples in this iteration
the existing E2S category/tune/boost controls remain reachable as they are today; the
least-intrusive way to surface them from the unified list is settled during planning, but
the editor modal itself is not restyled.

## Transition / coexistence

Build the new **SAMPLE MANAGER** tab (tabs + snap-split) to replace the committed
always-two-pane `#bank-view`. The old separate `ESX-1 SAMPLER` and `E2S SAMPLER` tabs and the
first `#bank-view` remain functional during the build; they are removed only after feature
parity is confirmed + a hands-on check in the running app.

## Testing

- The `bank:*` core is already covered by `tests/parsers/bank.test.js` (283 tests green).
- UI verification: extract the inline `<script>` and `node --check` it (syntax gate); the
  full Vitest suite must stay green (nothing in the UI change should break imported modules).
- Hands-on check in the running Electron app (needs the Chromium system libs — a known
  local-environment step, unrelated to the code).
