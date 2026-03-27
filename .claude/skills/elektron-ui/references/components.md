# Component Reference

## Buttons

### Standard Button `.btn`
```css
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--brd-h);
  background: var(--panel);
  color: var(--txt);
  font-family: var(--lcd); font-size: 12px;
  cursor: pointer;
  transition: background 60ms, border-color 60ms, color 60ms, box-shadow 60ms;
  letter-spacing: 1px;
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
  text-transform: uppercase;
}
.btn:hover { background: var(--cell-h); border-color: var(--blue-d); color: var(--led) }
.btn:active { transform: scale(.97) }
```
```html
<button class="btn" onclick="doThing()">LABEL</button>
```

### Accent Button `.btn-hi`
```css
.btn-hi { background: var(--hi-dk); border-color: var(--hi-d); color: var(--hi) }
.btn-hi:hover { background: var(--hi-d); color: #fff; box-shadow: 0 0 14px var(--hi-g) }
```

### Small Button `.btn-sm`
```css
.btn-sm { padding: 5px 10px; font-size: 11px }
```

### Warning Button `.btn-warn`
```css
.btn-warn { border-color: var(--warn-d); color: var(--warn) }
.btn-warn:hover { background: var(--warn-d); color: #fff }
```

### Ghost Button `.btn-ghost`
```css
.btn-ghost { background: transparent; border-color: transparent; clip-path: none }
```

### Active State
```css
.btn.act { background: var(--hi-dk); border-color: var(--hi); color: var(--hi); box-shadow: 0 0 10px var(--hi-g) }
```

### Play Button `.pb`
```css
.pb {
  width: 100%; padding: 12px;
  background: var(--void);
  border: 2px solid var(--hi-d);
  color: var(--hi);
  font-family: var(--head); font-size: 14px; font-weight: 700;
  cursor: pointer; letter-spacing: 4px;
  clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
}
.pb:hover { background: var(--hi-dk); border-color: var(--hi); box-shadow: 0 0 20px var(--hi-g) }
.pb.pl { background: var(--hi-d); border-color: var(--hi); color: #fff; animation: bp .6s ease infinite }
```

### Modify Button `.mod-btn`
```css
.mod-btn {
  width: 100%; padding: 14px;
  background: linear-gradient(135deg, var(--blue-dk), #060c1a);
  border: 2px solid var(--blue);
  color: var(--led);
  font-family: var(--head); font-size: 14px; font-weight: 800;
  letter-spacing: 5px;
  clip-path: polygon(7px 0%, 100% 0%, calc(100% - 7px) 100%, 0% 100%);
  text-shadow: 0 0 12px var(--blue-g);
}
.mod-btn:hover { background: var(--blue-d); color: #fff; box-shadow: 0 0 40px var(--blue-g) }
```

### FX Apply Button `.fx-go`
```css
.fx-go {
  width: 100%; padding: 12px; margin-top: 6px;
  background: var(--hi-dk);
  border: 2px solid var(--hi);
  color: var(--hi);
  font-family: var(--head); font-size: 13px; font-weight: 700;
  letter-spacing: 3px;
  clip-path: polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%);
  text-align: center;
}
.fx-go:hover { background: var(--hi); color: #fff; box-shadow: 0 0 20px var(--hi-g) }
```

## Modals

### Modal Backdrop
```html
<div class="modal-bg" id="myModalBg">
  <div class="modal"> <!-- or .guide-modal, .conv-modal -->
    <div class="modal-hdr">
      <span class="modal-title">TITLE</span>
      <button class="modal-close" onclick="closeModalBg('myModalBg')">CLOSE</button>
    </div>
    <div class="modal-body">...</div>
  </div>
</div>
```
```css
.modal-bg {
  display: none; position: fixed; inset: 0;
  background: rgba(2,4,12,.9);
  z-index: 10000;
  backdrop-filter: blur(8px);
}
.modal-bg.show { display: flex; align-items: center; justify-content: center; animation: mIn .2s ease }
.modal-bg.hiding { animation: mOut .15s ease forwards }
```

### Full Modal (e.g., Modify)
```css
.modal {
  background: var(--dark);
  border: 2px solid var(--blue-d);
  width: 94%; max-width: 1200px; height: 90%;
  display: grid; grid-template-rows: auto 1fr;
  clip-path: polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px);
  box-shadow: 0 0 80px rgba(30,80,160,.06), 0 0 40px rgba(197,48,92,.04);
}
```

### Guide Modal (smaller)
```css
.guide-modal {
  /* Same clip-path and border as .modal */
  width: 85%; max-width: 800px; height: 85%;
}
```

### Conversion Modal (fixed width)
```css
.conv-modal {
  /* Same clip-path */
  width: 600px; max-height: 80vh;
  display: flex; flex-direction: column;
}
```

### Modal Header
```css
.modal-hdr {
  display: flex; align-items: center;
  padding: 14px 24px;
  border-bottom: 2px solid var(--blue-d);
  gap: 14px;
  background: linear-gradient(180deg, #0e1830, var(--dark));
}
.modal-title { font-family: var(--head); font-size: 14px; font-weight: 800; color: var(--hi); letter-spacing: 4px }
.modal-close {
  padding: 8px 20px;
  background: var(--void); border: 1px solid var(--hi-d); color: var(--hi);
  font-family: var(--head); font-size: 12px; font-weight: 700;
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
}
```

## Sample List Row `.ss`
```css
.ss {
  display: grid;
  grid-template-columns: 24px 40px 100px 1fr 60px 65px 65px;
  gap: 6px; align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  border-bottom: 1px solid rgba(255,255,255,.02);
  transition: background 50ms, border-color 50ms;
}
.ss:hover { background: var(--cell-h); border-left-color: var(--blue-d) }
.ss.act { background: var(--cell-a); border-left-color: var(--hi) }
```
```html
<div class="ss${i===sel?' act':''}" onclick="selS(${i})">
  <div class="ss-chk${checked.has(i)?' on':''}"></div>
  <div class="si">${i}</div>
  <div class="sn">${esc(name)}</div>
  <div class="sf${filename?' has':''}">${esc(filename)}</div>
  <div class="sr">${rate}</div>
  <div class="sd">${duration}</div>
  <div class="sz">${size}</div>
</div>
```

## Column Header `.ch`
```css
.ch {
  display: grid;
  grid-template-columns: 24px 40px 100px 1fr 60px 65px 65px;
  gap: 6px; padding: 6px 12px;
  font-family: var(--lcd); font-size: 10px; color: var(--txt-x);
  letter-spacing: 2px;
  border-bottom: 1px solid var(--brd);
  background: var(--void);
}
```

## Sidebar Section
```html
<div class="sbs">
  <div class="sbt">SECTION NAME</div>
  <!-- content -->
</div>
```
```css
.sbs { padding: 14px 16px; border-bottom: 1px solid var(--brd) }
.sbt {
  font-family: var(--head); font-size: 10px; font-weight: 700;
  color: var(--blue-d); letter-spacing: 3px;
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 8px;
}
.sbt::after { content: ''; flex: 1; height: 1px; background: var(--brd) }
```

## Toasts
```css
.toast {
  background: var(--panel); border: 1px solid var(--brd-h);
  padding: 10px 16px;
  font-family: var(--lcd); font-size: 13px; color: var(--txt);
  box-shadow: 0 4px 20px rgba(0,0,0,.6);
  max-width: 380px;
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
  animation: tin .15s ease;
}
.toast.success { border-color: var(--blue-d); color: var(--led) }
.toast.error   { border-color: var(--hi-d);   color: var(--hi) }
.toast.info    { border-color: var(--yel-d);   color: var(--yel) }
```

## Waveform Container
```html
<div class="sbs">
  <div class="sbt">WAVEFORM</div>
  <div class="wf-w">
    <div class="wf-e" id="wfE">NO SAMPLE</div>
    <canvas id="wfC"></canvas>
  </div>
  <div class="wf-i" id="wfI" style="display:none">
    <div class="wf-ii">RATE <span id="iR">-</span></div>
    <div class="wf-ii">FRAMES <span id="iF">-</span></div>
    <div class="wf-ii">DUR <span id="iD">-</span></div>
    <div class="wf-ii pk">PEAK <span id="iP">-</span></div>
  </div>
</div>
```

## Memory Bar
```html
<div class="ms">
  <div class="sbt">MEMORY</div>
  <div class="mo"><div class="mi" id="mB"><span class="mt" id="mT">0%</span></div></div>
  <div class="mst">
    <div class="msi">USED <span id="mU">0 MB</span></div>
    <div class="msi">DUR <span id="mD">0</span>s</div>
  </div>
</div>
```
Memory bar classes: `.mi` (normal blue), `.mi.w` (warning orange >70%), `.mi.c` (critical red >90%, pulsing)

## Drop Zone
```html
<div class="dz" id="dZ" onclick="importSamples()">
  <i>⚡</i>
  <p><strong>DROP SAMPLES HERE</strong><br><br>WAV / AIF / ZIP → 16-bit mono 44.1kHz</p>
</div>
```

## Data Row `.dr`
```html
<div class="dr"><span class="dl">LABEL</span><span class="dv">${value}</span></div>
```
```css
.dr { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.02) }
.dl { font-family: var(--lcd); font-size: 11px; color: var(--txt-x); letter-spacing: 1px }
.dv { font-family: var(--lcd); font-size: 13px; color: var(--txt) }
```

## Input / Rename Field
```css
.ren {
  background: var(--void);
  border: 1px solid var(--blue-d);
  color: var(--led);
  font-family: var(--lcd); font-size: 16px;
  padding: 6px 10px; width: 100%;
  text-transform: uppercase; letter-spacing: 3px;
  outline: none;
}
.ren:focus { border-color: var(--led); box-shadow: 0 0 10px var(--led-g) }
```

## Select / Dropdown (E2S style)
```css
select {
  background: var(--void);
  border: 1px solid var(--blue-d);
  color: var(--led);
  font-family: var(--lcd); font-size: 13px;
  padding: 6px 10px; width: 100%;
  outline: none;
}
select:focus { border-color: var(--led); box-shadow: 0 0 10px var(--led-g) }
```

## Range Slider
```css
input[type="range"] {
  -webkit-appearance: none; flex: 1;
  height: 6px; background: var(--brd-h);
  outline: none; cursor: pointer; border-radius: 3px;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  background: var(--hi); border: 2px solid var(--hi-d);
  cursor: pointer; border-radius: 2px;
  box-shadow: 0 0 6px var(--hi-g);
}
```

## FX Item (accordion)
```html
<div class="fx-item" id="fxi_myFx">
  <div class="fx-head" onclick="toggleFx('myFx')">
    <span class="fx-icon">⚡</span>
    <div>
      <div class="fx-name">FX NAME</div>
      <div class="fx-desc">Short description</div>
    </div>
    <span class="fx-arrow">▸</span>
  </div>
  <div class="fx-body">
    <div class="fx-row">
      <span class="fx-lbl">PARAM</span>
      <input type="range" id="paramId" min="0" max="100" value="50" oninput="upFxVal('paramId')">
      <span class="fx-val" id="vparamId">50</span>
    </div>
    <button class="fx-go" onclick="applyFx('myFx')">APPLY</button>
  </div>
</div>
```

## Vertical Sidebar Item `.vsb-item`
```html
<button class="vsb-item${dev===activeDevice?' active':''}" onclick="switchDevice('${dev}')">
  <span class="vsb-icon">icon</span>
  <span class="vsb-label">DEVICE<small>SUBTITLE</small></span>
</button>
```

## Context Menu
```css
.ctx-menu {
  display: none; position: fixed; z-index: 20000;
  background: #0a0e1a;
  border: 1px solid var(--brd-h); border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0,0,0,.6);
  min-width: 140px; padding: 4px 0;
  font-family: var(--lcd); font-size: 11px;
}
.ctx-menu.show { display: block }
```

## Pattern Grid Pixel Cell `.px-cell`
```css
.px-cell {
  width: var(--cw, 20px); height: var(--ch, 14px);
  flex-shrink: 0; cursor: pointer; border-radius: 2px;
  transition: filter 60ms, transform 60ms;
}
.px-cell.px-off { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07) }
.px-cell.px-on  { /* color set per-part via inline style */ }
.px-cell:hover  { filter: brightness(1.5); transform: scaleY(1.1) }
```

## Progress Bar (Export)
```html
<div class="export-progress" id="expProg">
  <div class="export-bar-wrap">
    <div class="export-bar" id="expBar" style="width:0%"></div>
  </div>
  <span class="export-text" id="expText">0%</span>
</div>
```

## Undo Row
```html
<div class="undo-row">
  <button class="undo-btn" id="uBtn" onclick="doUndo()">UNDO</button>
  <span class="undo-info" id="uInf"><span>0</span></span>
  <button class="undo-btn" id="rBtn" onclick="doRedo()">REDO</button>
  <button class="undo-btn" id="rsBtn" onclick="doReset()" style="display:none">RESET</button>
</div>
```
