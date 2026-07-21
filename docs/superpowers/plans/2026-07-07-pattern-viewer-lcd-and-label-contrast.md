# Pattern Viewer LCD + Label Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brighten the pattern viewer's small gray labels and add a Korg-hardware-style LCD param display (mirror / navigate / type-to-edit) to the PARTS view.

**Architecture:** All changes live in `src/index.html` (CSS + pattern-viewer render/event code). The LCD is a DOM+CSS component in the `.part-knobs-header` (ESX) and the EMX inline header. Edits flow through a new shared `pkCommitParam()` that wraps the already-existing `esx:update-pattern-param` IPC path (same one the GRID sliders use) — this also fixes a latent bug where PARTS-view knob drags never set `patDirty` and were silently lost on SAVE.

**Tech Stack:** Vanilla JS/CSS inside `src/index.html`, Vitest for regression only.

**Spec:** `docs/superpowers/specs/2026-07-07-pattern-viewer-lcd-and-label-contrast-design.md`

## Important context for the implementer

- **No DOM test harness exists** in this repo (established in the 2026-06-03 plan). Verification is: `npm test` regression (243 tests — proves no parser/IPC file touched) + manual/CDP visual checks with explicit expected observations. Do not add a DOM test framework.
- **Color values are starting points.** Contrast tones and LCD colors get tuned live in the running app with the user. Structure > exact pixels.
- **Never touch:** `main.js`, `preload.js`, `src/*-format.js`, sample-manager CSS/JS regions, global `--txt-d`/`--txt-x` variables.
- **Responsive guarantee from Task-4 of the previous plan must hold:** no clipping/scroll in PARTS view at 1536×826, 1500×900, 1280×720. The header grows from ~20px to ~26–30px; if the panel clips afterwards, reduce the LCD's vertical padding first.
- **Commit after every task.** Work stays on branch `pattern-viewer-ui-redesign`.

## File Structure

Single file modified: `src/index.html`

| Region | Responsibility | Tasks |
|---|---|---|
| CSS rules `.pk-knob-label` (line ~1226), `.pk-section-label` (~1200), `.parts-group-label` (~881), `.part-sample-lbl` (~932), `.emx-knob-lbl` (~1113) | Label contrast | 1 |
| Static markup `.part-knobs-header` (~line 1546) + new `.pk-lcd*` CSS | LCD component (ESX) | 2 |
| JS `attachKnobDrag()` (~3694), `renderPartKnobs()` (~3717), new `pkLcd*`/`pkCommitParam` helpers | Mirror, nav, commit, edit | 2–4 |
| JS pattern-render EMX branch (~3602) + new `EMX_LCD_PARAMS` | EMX LCD (read-only) | 5 |

---

## Task 1: Brighten pattern viewer labels (CSS only)

**Files:**
- Modify: `src/index.html` — 5 CSS rules + 1 hover rule.

- [ ] **Step 1: `.pk-knob-label` + hover**

Find:

```css
.pk-knob:hover .pk-knob-label{color:var(--txt-d)}
```

Replace with:

```css
.pk-knob:hover .pk-knob-label{color:#c8d4e0}
```

Find:

```css
.pk-knob-label{font-family:var(--lcd);font-size:clamp(6px,0.55vw,8px);color:var(--txt-x);letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;transition:color .12s}
```

Replace with:

```css
.pk-knob-label{font-family:var(--lcd);font-size:clamp(6px,0.55vw,8px);color:#a8b6c8;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;transition:color .12s}
```

- [ ] **Step 2: `.pk-section-label`**

Find (inside the `.pk-section-label` rule, ~line 1200):

```css
.pk-section-label{
  font-family:var(--head);font-size:clamp(7px,0.6vw,9px);color:var(--txt-x);
```

Replace with:

```css
.pk-section-label{
  font-family:var(--head);font-size:clamp(7px,0.6vw,9px);color:#a8b6c8;
```

- [ ] **Step 3: `.parts-group-label`**

Find:

```css
.parts-group-label{
  font-family:var(--head);font-size:clamp(7px,0.7vw,9px);color:#7a8ea0;
```

Replace with:

```css
.parts-group-label{
  font-family:var(--head);font-size:clamp(7px,0.7vw,9px);color:#a8b6c8;
```

- [ ] **Step 4: `.part-sample-lbl`**

Find:

```css
.part-sample-lbl{
  font-family:var(--lcd);font-size:clamp(8px,0.8vw,10px);color:#8a9aac;
```

Replace with:

```css
.part-sample-lbl{
  font-family:var(--lcd);font-size:clamp(8px,0.8vw,10px);color:#aab8ca;
```

- [ ] **Step 5: `.emx-knob-lbl`**

Find:

```css
.emx-knob-lbl{font-size:7px;color:var(--txt-x);letter-spacing:1px;font-family:var(--lcd);text-transform:uppercase}
```

Replace with:

```css
.emx-knob-lbl{font-size:7px;color:#a8b6c8;letter-spacing:1px;font-family:var(--lcd);text-transform:uppercase}
```

- [ ] **Step 6: Regression test**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 7: Visual verification (live with user)**

Run the app, load an ESX file in PATTERNS VIEWER → PARTS. Knob labels, section labels, group labels, and sample names must be clearly readable but not "loud". Load an EMX file, confirm `.emx-knob-lbl` matches. Tune tones live with the user if requested (via CDP `Runtime.evaluate` style injection or direct edit + reload). Confirm Sample Manager screens are unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): brighten pattern viewer label contrast (scoped, sample manager untouched)"
```

---

## Task 2: LCD component — markup, CSS, display + navigation (ESX)

**Files:**
- Modify: `src/index.html` — static header markup (~1546), new CSS block after `.part-knobs-type` rule (~1197), new JS helpers after `attachKnobDrag()` (~3715), init call at end of `renderPartKnobs()` (~3785).

- [ ] **Step 1: Add LCD markup to the panel header**

Find:

```html
            <div class="part-knobs-header">
              <span class="part-knobs-name" id="pkName">D1</span>
              <span class="part-knobs-sample" id="pkSample">—</span>
              <span class="part-knobs-type" id="pkType">DRUM PART 1</span>
            </div>
```

Replace with:

```html
            <div class="part-knobs-header">
              <span class="part-knobs-name" id="pkName">D1</span>
              <span class="part-knobs-sample" id="pkSample">—</span>
              <span class="part-knobs-type" id="pkType">DRUM PART 1</span>
              <div class="pk-lcd" id="pkLcd">
                <button class="pk-lcd-btn" id="pkLcdPrev" title="Previous parameter">◀</button>
                <div class="pk-lcd-body">
                  <span class="pk-lcd-name" id="pkLcdName">—</span>
                  <span class="pk-lcd-value" id="pkLcdValue" title="Click to type a value">—</span>
                </div>
                <button class="pk-lcd-btn" id="pkLcdNext" title="Next parameter">▶</button>
              </div>
            </div>
```

- [ ] **Step 2: Add LCD CSS**

Find:

```css
.part-knobs-sample{font-family:var(--lcd);font-size:clamp(10px,1vw,13px);color:var(--txt-d)}
```

Insert directly AFTER that line (keep the found line unchanged):

```css
/* ── LCD param display (hardware-style, amber backlight) ── */
.pk-lcd{display:flex;align-items:stretch;gap:3px;margin-left:12px}
.pk-lcd-btn{
  font-family:var(--lcd);font-size:9px;color:#ffb84d;background:#141008;
  border:1px solid #3a2c12;border-radius:3px;cursor:pointer;padding:0 6px;
  transition:background .12s,color .12s;
}
.pk-lcd-btn:hover{background:#241c0c;color:#ffd28a}
.pk-lcd-body{
  display:flex;align-items:baseline;gap:10px;min-width:170px;
  background:linear-gradient(180deg,#1a1206,#120c04);
  border:1px solid #3a2c12;border-radius:3px;padding:2px 10px;
  box-shadow:inset 0 1px 4px rgba(0,0,0,.6),0 0 8px rgba(255,184,77,.06);
  position:relative;overflow:hidden;
}
.pk-lcd-body::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.12) 2px 3px);
}
.pk-lcd-name{font-family:var(--lcd);font-size:8px;letter-spacing:2px;color:#c8963e;text-transform:uppercase;align-self:center}
.pk-lcd-value{font-family:var(--lcd);font-size:13px;color:#ffb84d;text-shadow:0 0 6px rgba(255,184,77,.35);margin-left:auto;cursor:pointer;position:relative;z-index:1}
.pk-lcd-input{width:52px;background:transparent;border:none;outline:none;color:#ffd28a;font-family:var(--lcd);font-size:13px;text-align:right}
.pk-knob.pk-lcd-hl{border-color:#ffb84d;box-shadow:0 0 10px rgba(255,184,77,.35)}
```

- [ ] **Step 3: Add LCD state + helpers**

Find the closing of `attachKnobDrag()`:

```javascript
  knobEl.addEventListener('dblclick',()=>{
    if(param.defaultVal!=null){param.value=param.defaultVal;onUpdate(param);}
  });
}
```

Insert directly AFTER it:

```javascript
// ── LCD param display state ──
let pkLcdParams=[];   // flat param defs for the selected part
let pkLcdIdx=0;       // which param the LCD shows
let pkLcdPartIdx=-1;  // part index the LCD belongs to
let pkLcdBound=false;

function pkLcdPart(){
  const pat=patData[patSel];
  return pat&&pat.parts?pat.parts[pkLcdPartIdx]:null;
}
function pkLcdShow(){
  const nameEl=document.getElementById('pkLcdName');
  const valEl=document.getElementById('pkLcdValue');
  if(!nameEl||!valEl)return;
  const p=pkLcdParams[pkLcdIdx];
  const part=pkLcdPart();
  if(!p||!part){nameEl.textContent='—';valEl.textContent='—';return}
  const val=part[p.key]!=null?part[p.key]:p.defaultVal;
  nameEl.textContent=p.label;
  valEl.textContent=p.fmt(val);
}
function pkLcdStep(dir){
  if(!pkLcdParams.length)return;
  pkLcdIdx=(pkLcdIdx+dir+pkLcdParams.length)%pkLcdParams.length;
  pkLcdShow();
  const p=pkLcdParams[pkLcdIdx];
  const knob=document.getElementById(`pk_${pkLcdPartIdx}_${p.key}`);
  if(knob){
    knob.classList.add('pk-lcd-hl');
    setTimeout(()=>knob.classList.remove('pk-lcd-hl'),800);
  }
}
function pkLcdBind(){
  if(pkLcdBound)return;pkLcdBound=true;
  document.getElementById('pkLcdPrev').addEventListener('click',()=>pkLcdStep(-1));
  document.getElementById('pkLcdNext').addEventListener('click',()=>pkLcdStep(1));
}
```

(`pkLcdValue` click-to-edit is wired in Task 4; `patData`/`patSel` are existing pattern-viewer globals.)

- [ ] **Step 4: Initialize the LCD in `renderPartKnobs()`**

Find the end of `renderPartKnobs()`:

```javascript
    attachKnobDrag(knobEl,param,p=>{
      const norm=(p.value-p.min)/(p.max-p.min);
      const canvas=knobEl.querySelector('.pk-knob-canvas');
      const valEl=knobEl.querySelector('.pk-knob-value');
      if(canvas)drawRotaryKnob(canvas,norm,paramDef.color,48);
      if(valEl)valEl.textContent=paramDef.fmt(p.value);
      currentPart[key]=p.value;
    });
  });
}
```

Replace with:

```javascript
    attachKnobDrag(knobEl,param,p=>{
      const norm=(p.value-p.min)/(p.max-p.min);
      const canvas=knobEl.querySelector('.pk-knob-canvas');
      const valEl=knobEl.querySelector('.pk-knob-value');
      if(canvas)drawRotaryKnob(canvas,norm,paramDef.color,48);
      if(valEl)valEl.textContent=paramDef.fmt(p.value);
      currentPart[key]=p.value;
    });
  });
  // LCD: flat param list, reset to first param of this part
  pkLcdParams=[];
  layout.forEach(sec=>sec.params.forEach(p=>pkLcdParams.push(p)));
  pkLcdPartIdx=partIndex;
  pkLcdIdx=0;
  pkLcdBind();
  pkLcdShow();
}
```

- [ ] **Step 5: Regression test**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 6: Visual verification**

Run the app, load an ESX file, PARTS view, select a drum part.
Expected: amber LCD at the right of the panel header showing `PITCH` and its formatted value. ◀ ▶ page through all 17 params (wrapping), the matching knob flashes an amber ring for ~0.8s. Switching parts resets the LCD to PITCH. Header must not wrap awkwardly at 1280×720 (if it does, reduce `.pk-lcd-body` `min-width` from 170px toward 140px).

- [ ] **Step 7: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): hardware-style LCD param display with prev/next nav in ESX parts header"
```

---

## Task 3: Shared commit path + knob→LCD mirror (fixes lost knob edits)

**Why:** The PARTS-view knob drag only mutates the in-memory part object. Unlike the GRID slider (which calls `esx:update-pattern-param` and sets `patDirty`), knob edits are never written to `esxPatternBuffer` and are silently dropped on SAVE. The LCD needs a commit path anyway — build one, use it for both.

**Files:**
- Modify: `src/index.html` — `attachKnobDrag()` (~3694), knob wiring in `renderPartKnobs()`, new `pkCommitParam()`/`pkLcdMirror()` next to the pkLcd helpers.

- [ ] **Step 1: Add `pkCommitParam()` and `pkLcdMirror()`**

Find (added in Task 2):

```javascript
function pkLcdBind(){
  if(pkLcdBound)return;pkLcdBound=true;
  document.getElementById('pkLcdPrev').addEventListener('click',()=>pkLcdStep(-1));
  document.getElementById('pkLcdNext').addEventListener('click',()=>pkLcdStep(1));
}
```

Insert directly AFTER it:

```javascript
// Commit a param edit: in-memory + backend buffer (ESX) + dirty flag.
// Same path the GRID sliders use — keep in sync with paramCloseSlider's commit.
async function pkCommitParam(partIdx,key,value){
  const pat=patData[patSel];if(!pat)return;
  const part=pat.parts[partIdx];if(!part)return;
  part[key]=value;
  if(patFormat==='ESX-1'&&window.api.esx.updatePatternParam){
    const r=await window.api.esx.updatePatternParam({patIdx:patSel,partIdx,paramKey:key,value});
    if(r&&r.error)toast(r.error,'error');
  }
  patDirty=true;patUpdateSaveBtn();
}
// Point the LCD at a param (used when a knob is touched)
function pkLcdMirror(key){
  const i=pkLcdParams.findIndex(p=>p.key===key);
  if(i<0)return;
  pkLcdIdx=i;
  pkLcdShow();
}
```

- [ ] **Step 2: Give `attachKnobDrag()` a commit callback**

Find:

```javascript
function attachKnobDrag(knobEl,param,onUpdate){
```

Replace with:

```javascript
function attachKnobDrag(knobEl,param,onUpdate,onCommit){
```

Find:

```javascript
  document.addEventListener('mouseup',()=>{
    if(dragging){dragging=false;knobEl.classList.remove('dragging');document.body.style.cursor='';}
  });
  knobEl.addEventListener('dblclick',()=>{
    if(param.defaultVal!=null){param.value=param.defaultVal;onUpdate(param);}
  });
```

Replace with:

```javascript
  document.addEventListener('mouseup',()=>{
    if(dragging){dragging=false;knobEl.classList.remove('dragging');document.body.style.cursor='';if(onCommit)onCommit(param);}
  });
  knobEl.addEventListener('dblclick',()=>{
    if(param.defaultVal!=null){param.value=param.defaultVal;onUpdate(param);if(onCommit)onCommit(param);}
  });
```

- [ ] **Step 3: Wire mirror + commit into the knob loop**

Find (state after Task 2 Step 4):

```javascript
    attachKnobDrag(knobEl,param,p=>{
      const norm=(p.value-p.min)/(p.max-p.min);
      const canvas=knobEl.querySelector('.pk-knob-canvas');
      const valEl=knobEl.querySelector('.pk-knob-value');
      if(canvas)drawRotaryKnob(canvas,norm,paramDef.color,48);
      if(valEl)valEl.textContent=paramDef.fmt(p.value);
      currentPart[key]=p.value;
    });
```

Replace with:

```javascript
    attachKnobDrag(knobEl,param,p=>{
      const norm=(p.value-p.min)/(p.max-p.min);
      const canvas=knobEl.querySelector('.pk-knob-canvas');
      const valEl=knobEl.querySelector('.pk-knob-value');
      if(canvas)drawRotaryKnob(canvas,norm,paramDef.color,48);
      if(valEl)valEl.textContent=paramDef.fmt(p.value);
      currentPart[key]=p.value;
      pkLcdMirror(key);
    },p=>{
      pkCommitParam(partIdx,key,p.value);
    });
```

(Live drag stays UI-only; the IPC write + dirty flag fire once on mouse release / dblclick.)

- [ ] **Step 4: Regression test**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 5: Functional verification**

Run the app, load an ESX file, PARTS view:
- Drag the CUTOFF knob → LCD jumps to `CUTOFF` and tracks the value live.
- Release the mouse → SAVE button becomes fully opaque (dirty).
- Dblclick a knob → resets to default, LCD shows default, still dirty.
- SAVE → pick a new path → re-open the saved file → the edited value must persist (this is the bug fix).

- [ ] **Step 6: Commit**

```bash
git add src/index.html
git commit -m "fix(ui): knob edits commit to pattern buffer + dirty flag; LCD mirrors touched knob"
```

---

## Task 4: LCD type-to-edit (ESX only)

**Files:**
- Modify: `src/index.html` — new `pkLcdBeginEdit()` next to pkLcd helpers, one extra line in `pkLcdBind()`.

- [ ] **Step 1: Add `pkLcdBeginEdit()`**

Find (added in Task 3):

```javascript
// Point the LCD at a param (used when a knob is touched)
function pkLcdMirror(key){
```

Insert directly BEFORE it:

```javascript
function pkLcdBeginEdit(){
  if(patFormat!=='ESX-1')return; // EMX etc. are read-only
  const p=pkLcdParams[pkLcdIdx];
  const part=pkLcdPart();
  const valEl=document.getElementById('pkLcdValue');
  if(!p||!part||!valEl||valEl.querySelector('input'))return;
  const cur=part[p.key]!=null?part[p.key]:p.defaultVal;
  valEl.innerHTML=`<input class="pk-lcd-input" type="text" value="${cur}">`;
  const inp=valEl.querySelector('input');
  inp.focus();inp.select();
  let done=false;
  const finish=commit=>{
    if(done)return;done=true;
    if(commit){
      const n=parseInt(inp.value,10);
      if(!isNaN(n)){
        const v=Math.min(p.max,Math.max(p.min,n));
        pkCommitParam(pkLcdPartIdx,p.key,v);
        const knob=document.getElementById(`pk_${pkLcdPartIdx}_${p.key}`);
        if(knob){
          const canvas=knob.querySelector('.pk-knob-canvas');
          const kval=knob.querySelector('.pk-knob-value');
          const norm=(v-p.min)/(p.max-p.min);
          if(canvas)drawRotaryKnob(canvas,norm,p.color,48);
          if(kval)kval.textContent=p.fmt(v);
        }
      }
    }
    pkLcdShow(); // restores the text display (reverted or committed)
  };
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter')finish(true);
    else if(e.key==='Escape')finish(false);
  });
  inp.addEventListener('blur',()=>finish(false));
}
```

- [ ] **Step 2: Wire the click handler**

Find:

```javascript
function pkLcdBind(){
  if(pkLcdBound)return;pkLcdBound=true;
  document.getElementById('pkLcdPrev').addEventListener('click',()=>pkLcdStep(-1));
  document.getElementById('pkLcdNext').addEventListener('click',()=>pkLcdStep(1));
}
```

Replace with:

```javascript
function pkLcdBind(){
  if(pkLcdBound)return;pkLcdBound=true;
  document.getElementById('pkLcdPrev').addEventListener('click',()=>pkLcdStep(-1));
  document.getElementById('pkLcdNext').addEventListener('click',()=>pkLcdStep(1));
  document.getElementById('pkLcdValue').addEventListener('click',pkLcdBeginEdit);
}
```

- [ ] **Step 3: Regression test**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 4: Functional verification**

Run the app, ESX file, PARTS view:
- Click the LCD value → becomes an input with the raw number selected.
- Type `200` for CUTOFF (max 127), Enter → clamps to 127; knob rotates to full; SAVE goes dirty.
- Type `abc`, Enter → reverts, no change, no dirty toggle beyond previous state.
- Esc and blur → revert.
- On a `fmt` param (e.g. AMP EG): input shows the raw number (0/1), typing `1` + Enter shows `GATE` in LCD and on the knob.

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): click-to-type value editing on LCD display (ESX, clamped, same commit path)"
```

---

## Task 5: EMX LCD (display + navigation only)

**Files:**
- Modify: `src/index.html` — EMX render branch (~3602), new `EMX_LCD_PARAMS` + `emxLcd*` helpers near `emxSynthPanel()` (~3983), one CSS rule.

- [ ] **Step 1: Add `EMX_LCD_PARAMS` and helpers**

Find:

```javascript
function emxSynthPanel(part,partIndex){
```

Insert directly BEFORE it:

```javascript
// ── EMX LCD param lists (read-only: display + nav, no editing) ──
const EMX_LCD_PARAMS={
  synth:[
    {label:'OSC TYPE',get:p=>emxOscName(p.oscType)},
    {label:'OSC EDIT1',get:p=>p.oscEdit1!=null?String(p.oscEdit1):'—'},
    {label:'OSC EDIT2',get:p=>p.oscEdit2!=null?String(p.oscEdit2):'—'},
    {label:'FILTER',get:p=>emxFilterName(p.filterType)},
    {label:'CUTOFF',get:p=>p.filterCutoff!=null?String(p.filterCutoff):'—'},
    {label:'RESO',get:p=>p.filterRes!=null?String(p.filterRes):'—'},
    {label:'FILTER EG',get:p=>p.filterEG!=null?String(p.filterEG):'—'},
    {label:'LEVEL',get:p=>p.level!=null?String(p.level):'—'},
    {label:'PAN',get:p=>emxPanStr(p.pan!=null?p.pan:64)},
    {label:'EG ATTACK',get:p=>p.egAttack!=null?String(p.egAttack):(p.eg!=null?String(p.eg):'—')},
    {label:'EG DECAY',get:p=>p.egDecay!=null?String(p.egDecay):(p.eg!=null?String(p.eg):'—')},
    {label:'MOD TYPE',get:p=>emxModName(p.modType||p.mod||0)},
    {label:'MOD SPEED',get:p=>p.modSpeed!=null?String(p.modSpeed):(p.mod!=null?String(p.mod):'—')},
    {label:'MOD DEPTH',get:p=>p.modDepth!=null?String(p.modDepth):(p.mod!=null?String(p.mod):'—')},
    {label:'FX SEND',get:p=>p.fxSend!=null?String(p.fxSend):'—'},
    {label:'PITCH',get:p=>emxPitchStr(p.pitch!=null?p.pitch:64)},
    {label:'GLIDE',get:p=>p.glide!=null?String(p.glide):'—'},
    {label:'ROLL',get:p=>p.roll!=null?String(p.roll):'—'},
  ],
  drum:[
    {label:'FILTER',get:p=>emxFilterName(p.filterType)},
    {label:'CUTOFF',get:p=>p.filterCutoff!=null?String(p.filterCutoff):'—'},
    {label:'RESO',get:p=>p.filterRes!=null?String(p.filterRes):'—'},
    {label:'FILTER EG',get:p=>p.filterEG!=null?String(p.filterEG):'—'},
    {label:'LEVEL',get:p=>p.level!=null?String(p.level):'—'},
    {label:'PAN',get:p=>emxPanStr(p.pan!=null?p.pan:64)},
    {label:'EG TIME',get:p=>p.egTime!=null?String(p.egTime):(p.eg!=null?String(p.eg):'—')},
    {label:'PITCH',get:p=>emxPitchStr(p.pitch!=null?p.pitch:64)},
    {label:'MOD TYPE',get:p=>emxModName(p.modType||p.mod||0)},
    {label:'MOD SPEED',get:p=>p.modSpeed!=null?String(p.modSpeed):(p.mod!=null?String(p.mod):'—')},
    {label:'MOD DEPTH',get:p=>p.modDepth!=null?String(p.modDepth):(p.mod!=null?String(p.mod):'—')},
    {label:'FX SEND',get:p=>p.fxSend!=null?String(p.fxSend):'—'},
    {label:'ROLL',get:p=>p.roll!=null?String(p.roll):'—'},
  ],
};
let emxLcdIdx=0;
function emxLcdShow(part,list){
  const n=document.getElementById('emxLcdName'),v=document.getElementById('emxLcdValue');
  if(!n||!v)return;
  const p=list[emxLcdIdx];
  if(!p){n.textContent='—';v.textContent='—';return}
  n.textContent=p.label;
  v.textContent=p.get(part);
}
function emxLcdInit(part){
  emxLcdIdx=0;
  const list=EMX_LCD_PARAMS[part.type==='synth'?'synth':'drum'];
  emxLcdShow(part,list);
  const step=dir=>{emxLcdIdx=(emxLcdIdx+dir+list.length)%list.length;emxLcdShow(part,list);};
  const prev=document.getElementById('emxLcdPrev'),next=document.getElementById('emxLcdNext');
  if(prev)prev.addEventListener('click',()=>step(-1));
  if(next)next.addEventListener('click',()=>step(1));
}
```

(The header is rebuilt via `innerHTML` on every part render, so listeners are attached fresh each time — no double-binding.)

- [ ] **Step 2: Inject the LCD into the EMX inline header**

Find:

```javascript
    if(isEMX&&selPart){
      const label=EMX_PART_LABELS[patSeqPart]||`P${patSeqPart+1}`;
      const pName=selPart.name||`Part ${patSeqPart+1}`;
      emxWrap.innerHTML=`<div class="emx-inline-hdr"><span class="emx-inline-label">${label}</span> ${esc(pName)}</div>`+emxSynthPanel(selPart,patSeqPart);
    } else {
```

Replace with:

```javascript
    if(isEMX&&selPart){
      const label=EMX_PART_LABELS[patSeqPart]||`P${patSeqPart+1}`;
      const pName=selPart.name||`Part ${patSeqPart+1}`;
      const lcd=`<div class="pk-lcd emx-lcd">`+
        `<button class="pk-lcd-btn" id="emxLcdPrev" title="Previous parameter">◀</button>`+
        `<div class="pk-lcd-body"><span class="pk-lcd-name" id="emxLcdName">—</span>`+
        `<span class="pk-lcd-value" id="emxLcdValue" style="cursor:default">—</span></div>`+
        `<button class="pk-lcd-btn" id="emxLcdNext" title="Next parameter">▶</button></div>`;
      emxWrap.innerHTML=`<div class="emx-inline-hdr"><span class="emx-inline-label">${label}</span> ${esc(pName)}${lcd}</div>`+emxSynthPanel(selPart,patSeqPart);
      emxLcdInit(selPart);
    } else {
```

(`style="cursor:default"` because the EMX value is not clickable — no edit mode. `pkLcdBeginEdit` also guards on `patFormat!=='ESX-1'` as a second line of defense, but the EMX LCD uses different element ids and is never wired to it.)

- [ ] **Step 3: Make the EMX header a flex row**

Find:

```css
.emx-inline-label{font-family:var(--head);font-weight:700;font-size:13px;margin-right:8px}
```

Insert directly AFTER that line:

```css
#emxSynthInline .emx-inline-hdr{display:flex;align-items:center}
.emx-lcd{margin-left:auto}
```

- [ ] **Step 4: Regression test**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 5: Functional verification**

Run the app, load `test-data/emx/BEST.EMX`, PARTS view:
- Synth part (S1): LCD at the right of the inline header shows `OSC TYPE` + name; ◀ ▶ page through all 18 entries and wrap.
- Drum part (D1): 13 entries, `FILTER` first.
- Clicking the value does nothing (no input appears).
- Part switch resets the LCD to the first entry.

- [ ] **Step 6: Commit**

```bash
git add src/index.html
git commit -m "feat(ui): read-only LCD param display with nav for EMX parts"
```

---

## Task 6: Final verification & wrap-up

**Files:** none (verification only; tuning edits to `src/index.html` only if clipping is found).

- [ ] **Step 1: Full regression**

Run: `npm test`
Expected: 243 passed.

- [ ] **Step 2: Responsive check at the three reference sizes**

With the app running (CDP-driven like the Task-4 tuning pass, or manual resize): ESX PARTS view and EMX PARTS view at 1536×826, 1500×900, 1280×720.
Expected: no clipping/scrollbars anywhere in the PARTS view (`#partParamsPanel` scrollHeight === clientHeight; same for `#emxSynthInline`). If the taller header causes clipping, reduce `.pk-lcd-body` padding `2px 10px` → `1px 8px` and/or `.pk-lcd-value` font-size 13px → 12px, then re-check.

- [ ] **Step 3: Scope check**

Run: `git diff HEAD~5 --stat` (the five commits of this plan)
Expected: only `src/index.html` (and this plan/spec doc). No parser, `main.js`, or `preload.js` changes.

- [ ] **Step 4: Live user review**

Show the user the final state (contrast + LCD) in the running app; tune color values live if requested; commit any tuning as `fix(ui): tune LCD/label colors after live review`.

- [ ] **Step 5: Hand off**

Report results. Branch `pattern-viewer-ui-redesign` then goes to finishing-a-development-branch (merge / PR decision — still pending from earlier).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 label contrast (5 selectors incl. `.emx-knob-lbl`, hover fix) → Task 1 ✓
- Part 2 LCD component, placement, look → Task 2 ✓
- Part 3 mirror → Task 3; nav + highlight ring → Task 2; edit (clamp, Enter/Esc/blur, same setter, knob rotates, dirty) → Tasks 3–4 ✓
- Part 4 EMX display+nav only → Task 5 ✓
- Part 5 scope/tests/three-size check → every task's regression step + Task 6 ✓
- Latent knob-dirty bug: not in spec explicitly, but required for "SAVE behaves exactly as with knob edits" to be true → Task 3 (documented as bug fix) ✓

**Placeholder scan:** No TBD/TODO; all code steps show exact old → new text. ✓

**Type/name consistency:** `pkLcdParams/pkLcdIdx/pkLcdPartIdx/pkLcdBound`, `pkLcdShow/pkLcdStep/pkLcdBind/pkLcdMirror/pkLcdBeginEdit/pkCommitParam`, `emxLcdIdx/emxLcdShow/emxLcdInit`, element ids `pkLcdPrev/pkLcdNext/pkLcdName/pkLcdValue`, `emxLcdPrev/emxLcdNext/emxLcdName/emxLcdValue` used consistently across tasks. `paramDef.color` is available on every entry of `ESX_PART_PARAMS` (verified in source). `esc()` and `EMX_PART_LABELS` already exist in the EMX render branch. ✓

**TDD note:** No DOM harness exists; layout/interaction verification is manual with explicit expected observations, regression via `npm test` (established precedent from the 2026-06-03 plan).
