# NBG-GESCHRUBBE Manual Testing Checklist

## Pre-Test Setup
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm start` - app launches without errors
- [ ] Open DevTools (Ctrl+Shift+I) - check console for errors

---

## ESX-1 Tab - Sample Management

### File Operations
- [ ] Click "OPEN" -> select `.esx` file -> samples load in list
- [ ] Click "WAV" -> import single WAV -> appears in list
- [ ] Click "ZIP" -> import ZIP with multiple WAVs -> all import
- [ ] Memory bar updates correctly (MB / seconds)
- [ ] Status bar shows "Loaded X samples"

### Sample Viewing
- [ ] Click sample in list -> waveform displays on right
- [ ] Waveform shows correct audio shape
- [ ] Sample metadata shows (rate, length, frames, peak, RMS)
- [ ] Click different sample -> waveform updates

### Audio Playback
- [ ] Click "PLAY" -> sample plays through speakers
- [ ] Click "STOP" -> playback stops
- [ ] Playback cursor moves during play
- [ ] Click waveform during play -> seeks to position

### Smart Sort
- [ ] Click "SORT" once -> sorts by TYPE (mono/stereo)
- [ ] Click "SORT" again -> sorts by NAME (alphabetical)
- [ ] Click "SORT" again -> sorts by LENGTH (duration)
- [ ] Click "SORT" again -> sorts by SIZE (bytes)
- [ ] Click "SORT" again -> returns to OFF (slot order)
- [ ] Sort indicator shows current mode

### Sample Editing
- [ ] Select sample -> click "Modify" -> modal opens
- [ ] Modal shows waveform + effect buttons
- [ ] Click TIME tab -> shows 7 time-based effects
- [ ] Click TONE tab -> shows 5 tone effects
- [ ] Click DYNAMICS tab -> shows 6 dynamics effects
- [ ] Tab colors match (green/pink/cyan)
- [ ] Click REVERSE -> waveform flips
- [ ] UNDO count increases
- [ ] Click UNDO -> reverses effect
- [ ] Click REDO -> reapplies effect
- [ ] Click RESET -> clears all changes
- [ ] Click ESC -> closes modal, changes preserved

### Effect Testing (TIME Tab)
- [ ] REVERSE - flips sample backwards
- [ ] TIMESTRETCH - changes length (parameter adjustable)
- [ ] FADE IN - adds fade at start
- [ ] FADE OUT - adds fade at end
- [ ] CHOP - splits into segments
- [ ] STUTTER - repeats grains
- [ ] TURNTABLE STOP - vinyl stop effect

### Effect Testing (TONE Tab)
- [ ] BITCRUSH - lo-fi distortion
- [ ] PITCH - changes pitch (semitones)
- [ ] DISTORTION - overdrive/clip
- [ ] FILTER - sweep filter
- [ ] RING MOD - ring modulation

### Effect Testing (DYNAMICS Tab)
- [ ] SOFT CLIP - gentle limiting
- [ ] HARD CLIP - hard limiting
- [ ] WAVEFOLDER - folds waveform
- [ ] GATE - threshold gate
- [ ] TRANSIENT - shapes attack
- [ ] CROP - removes silence

### Batch Operations
- [ ] Select 3 samples (checkboxes)
- [ ] Click "NORM ALL" -> all 3 normalized
- [ ] Click "TRIM ALL" -> all 3 trimmed
- [ ] Multi-select count shows correctly

### Sample Management
- [ ] Select sample -> click "Rename" (or F2)
- [ ] Type new name (8 chars max) -> saves
- [ ] Select sample -> press Delete -> removes
- [ ] Click "Duplicate" -> creates copy
- [ ] Drag sample up/down -> reorders (if implemented)

### Export
- [ ] Click "EXPORT .ESX" -> save dialog opens
- [ ] Save file -> progress bar shows
- [ ] Export completes without error
- [ ] Re-open exported file -> samples intact
- [ ] Load on hardware ESX-1 -> works correctly

---

## E2S Tab - Sampler

### File Operations
- [ ] Click "OPEN" -> select `.all` file -> loads
- [ ] Shows 499 sample slots
- [ ] Click "WAV" -> imports and resamples to 48kHz
- [ ] Click "SAVE" -> exports `.all` file

### Sample Editing
- [ ] Select sample -> waveform shows
- [ ] Category dropdown works
- [ ] Tune slider adjusts pitch
- [ ] Loop type selector works
- [ ] Boost checkbox toggles

---

## EMX-1 Tab - Synth Patterns

### Pattern Viewing
- [ ] Click "OPEN" -> select `.emx` file -> loads
- [ ] Shows 256 patterns (A.01 - D.16)
- [ ] Click pattern -> detail panel shows:
  - [ ] Pattern name
  - [ ] BPM
  - [ ] Swing %
  - [ ] Steps (16/32/64)
  - [ ] Beat division
  - [ ] Synth parts listed
  - [ ] Drum parts listed
  - [ ] Effects listed

---

## E2 Patterns Tab

### Pattern Operations
- [ ] Click "OPEN PATTERN" -> loads single `.e2pat`
- [ ] Click "OPEN ALL" -> loads `.e2allpat` (250 patterns)
- [ ] Pattern grid displays steps
- [ ] Click step -> toggles on/off (if editing enabled)
- [ ] Pattern info shows (name, BPM, swing)
- [ ] Click "SAVE" -> exports pattern
- [ ] Click "SPLIT" -> splits all patterns to individual files

### E2 <-> E2S Conversion
- [ ] Load E2 pattern -> click "Convert to E2S"
- [ ] Load E2S pattern -> click "Convert to E2"
- [ ] Conversion completes without error

---

## Cross-Cutting Concerns

### Memory & Performance
- [ ] App loads in < 3 seconds
- [ ] No memory leaks (check Task Manager over time)
- [ ] Large files (20MB+ samples) load smoothly
- [ ] Waveform rendering is smooth (no lag)

### Error Handling
- [ ] Open invalid file -> shows error message
- [ ] Import corrupted WAV -> shows error
- [ ] Exceed 24MB sample limit -> shows warning
- [ ] Try to name sample > 8 chars -> truncates

### UI/UX
- [ ] All buttons have hover states
- [ ] Active tab highlighted correctly
- [ ] Status bar updates on all actions
- [ ] No visual glitches or overlap
- [ ] Cyberpunk theme consistent (cyan/pink/green)

### Console (DevTools)
- [ ] No JavaScript errors
- [ ] No warnings (except expected deprecations)
- [ ] IPC calls succeed (check Network tab)

---

## Hardware Integration (If Available)

### ESX-1 Hardware Test
- [ ] Export `.esx` from app
- [ ] Load on ESX-1 via SD card
- [ ] Samples play correctly
- [ ] Sample names show on LCD
- [ ] Patterns trigger samples
- [ ] MIDI slave mode works with EMX-1

### E2S Hardware Test
- [ ] Export `.all` from app
- [ ] Load on E2S via SD card
- [ ] Samples play at correct pitch
- [ ] Categories work
- [ ] Loop points accurate

---

## Bug Report Template

```
BUG: [Short description]

STEPS TO REPRODUCE:
1. Click X
2. Do Y
3. See error

EXPECTED: [What should happen]
ACTUAL: [What actually happened]

CONSOLE ERRORS: [Paste any errors from DevTools]

SCREENSHOTS: [If applicable]

VERSION: [Check package.json version]
OS: [Windows/Mac/Linux]
```

---

## Test Results

Date: __________
Tester: __________

- [ ] All ESX tests passed
- [ ] All E2S tests passed
- [ ] All EMX tests passed
- [ ] All E2 pattern tests passed
- [ ] No critical bugs found
- [ ] Minor bugs documented (see below)

### Bugs Found:
1.
2.
3.
