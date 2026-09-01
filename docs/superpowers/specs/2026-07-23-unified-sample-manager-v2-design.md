# Unified Sample Manager v2 — Design

**Date:** 2026-07-23
**Stand (2026-08-18):** **Gebaut und in `main`** (`7683401`, `2717349`, `bfdf080`,
`60f3461`). Zwei Abweichungen: `main.js` hat zwei `file:*`-Handler mehr als hier
spezifiziert (`file:open-any`, `file:set-hacktribe`), und `#e2s-view` liegt wie
angekündigt noch im Code — **der Cleanup-Commit steht aus.** Dieser Spec ist die
Grundlage von `docs/adr/0002-dateien-als-tabs-statt-zweier-baenke.md` und ersetzt
`2026-07-17-unified-sample-manager-design.md`. Kein Plan vorhanden.
**Status:** Approved (goal-directive; refines the parked Project S per the
2026-07-17 spec + the lessons recorded after it was parked)
**Branch:** `feat/unified-sample-manager` (built from clean `main` @ 2fc1288)

## Goal

Merge the two sampler tabs (ESX-1 SAMPLER, E2S SAMPLER) into **one SAMPLE
MANAGER sidebar tab** with browser-style file tabs and an optional split view
— while the app otherwise works **exactly as today**: the sample list, detail
panel (PLAY / MODIFY / DETAILS / DUP / WAV / DEL), waveform, MODIFY modal, and
the Pattern Viewer are not redesigned or restyled. UX follows patterns users
know from mainstream software (browser tabs, VS-Code-style split, drag & drop
copy).

## Non-goals

- No visual redesign of any existing component.
- No editor (MODIFY modal) changes — no origin badge, no E2S param row (deferred).
- No new import formats (Project B), no OS drag & drop import changes (Project C).
- The old `#e2s-view` stays in the code but is hidden (cleanup commit later,
  after hands-on verification — per the transition rule from the v1 spec).

## UX

- **Sidebar: 2 entries** — `SAMPLE MANAGER` (the existing `#esx1-view`) and
  `PATTERNS VIEWER` (untouched). The E2S sidebar entry is hidden.
- **File tabs** directly under the header, browser-style: device tag
  (`ESX-1` / `E2S`), file name, sample count, dirty dot (●, like VS Code),
  close `✕`, and a `+ OPEN` chip. Max **2 open files** (kept from v1 — the
  split has exactly two panes).
- **OPEN** loads `.esx` **or** `e2sSample.all` — auto-detected. First open
  reuses the empty UNTITLED tab.
- **Split view** (auto when 2 files are open; `SPLIT`/`SINGLE` toggle in the
  tab bar): the list column shows two compressed panes (`# · NAME · RATE ·
  LEN`), one per file. The **full detail panel on the right stays shared** and
  always shows the selected sample (clicking a row in either pane selects it —
  switching the active file under the hood).
- **Copy between files**: drag a row from one split pane to the other, or drag
  a row onto the other file's tab (works in single view too). Conversion
  ESX↔E2S (44.1↔48 kHz) is automatic via `src/bank.js`; a toast summarizes
  ("1 SAMPLE KOPIERT · 44.1→48kHz"). All-or-nothing preflight (slots, ESX
  memory budget) — on failure nothing is copied and the reason is toasted.
- **Save**: the existing SAVE/EXPORT NEW buttons stay. For an active E2S file,
  SAVE writes a native `e2sSample.all` (new `file:save`); EXPORT NEW and
  IMPORT are hidden for E2S tabs (ESX-only pipelines — Project B territory).

## Architecture

### Main process — `openFiles[]` + swap-in/swap-out (hardened v1 pattern)

```js
openFiles = [{ device:'esx'|'e2s', samples, esxOriginalBuffer, filePath, fileName }]
activeFileIdx
```

The legacy globals `currentSamples` / `esxOriginalBuffer` always point at the
**active** entry, so every existing `esx:` handler (FX, undo, waveform,
preview, save) works unchanged. Discipline (the v1 fragility, now explicit):

- `stashActive()` flushes the globals back into the active entry; **every**
  `file:*` handler calls it first.
- The only legacy handlers that *reassign* the globals (`open-esx-file`,
  `clear-all`) get a one-line sync so the active entry can never go stale.

**PCM is view-native 16-bit BE** in every store. E2S files are byte-swapped
LE→BE on load (lossless `Buffer.swap16` on a copy) and swapped back on save.
E2S per-sample metadata (category, loopType, loopStart, loudness,
playLogPeriod, playVolume) rides along in an `_e2s` bag for lossless save
round-trip; loop frames are clamped on save if the sample was shortened.

Pure conversion lives in **`src/file-tabs.js`** (new, Electron-free,
unit-tested): store↔bank mapping in both directions, using `src/bank.js`
(`createE2sBank`, `copySamples`, `serializeBank`) for parsing, conversion and
serialization.

### New IPC — `file:*` namespace (via `safeIpcHandle`)

| Handler | Behavior |
|---|---|
| `file:list` | `{tabs:[{index,name,device,count,active}], activeIndex}` |
| `file:open` | Dialog (.esx / .all) → auto-detect → parse; reuses empty UNTITLED tab; caps at 2 files |
| `file:switch(i)` | Activate entry `i`, return fresh state |
| `file:close(i)` | Splice; reseed empty ESX entry when none left |
| `file:rows(i)` | **Read-only** compressed rows for split panes — never switches the active file |
| `file:transfer(from, indices[], to)` | `bank.copySamples` with conversion; all-or-nothing; returns message + fresh state |
| `file:save` | Active E2S file → native `e2sSample.all` via `bank.serializeBank` |

`getSamplesInfo()` becomes device-aware for the active file (E2S: 499 slots,
E2S byte budget) so the storage bar and counters are honest.

### Renderer — the two v1 bugs are impossible by construction

1. **No listener stacking:** ALL tab/split listeners (click, dblclick,
   dragstart, dragover, drop) are wired **exactly once at init** via event
   delegation on the static containers `#fileTabs` / `#splWrap` / `#sL`.
   Render functions only ever replace innerHTML — they never add listeners.
2. **No stale lists after mutations:** `updateState()` — the single choke
   point every mutating call already flows through — additionally refreshes
   the tab bar and (when visible) the split panes. DEL / undo / FX / rename
   can no longer desync what the user sees.

Per-tab renderer UI (`sel`, `fp`, `dirty`, sort mode, tags) is stashed and
restored on tab switch (`tabUi{}` pattern from v1, which was sound).

Sanctioned in-place edits to existing UI code (everything else is additive):
sidebar relabel + hide E2S entry, OPEN/SAVE button dispatch
(`openFileTab`/`saveActiveFile`), `draggable` on list rows, one-line
`updateState` hook, device-aware status bar/save gating.

## Testing / verification

- New unit tests for `src/file-tabs.js` (LE↔BE round-trip, `_e2s` metadata
  preservation, loop clamping, store↔bank mapping) — full suite stays green.
- `node --check` on main.js; manual JS review of index.html additions.
- Adversarial code review before commit.
- **Hands-on check in the running app by the user** before any merge to main
  (hard lesson from v1 — the test suite does not cover the Electron UI).
