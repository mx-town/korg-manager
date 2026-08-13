# 🎹 Korg Manager — Electribe Sample & Pattern Manager

[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Tests](https://img.shields.io/badge/Tests-451%20passed-brightgreen)](https://vitest.dev)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

Desktop application for managing Korg Electribe hardware. Supports the **ESX-1**, **E2S**, and **EMX-1** — read and organize samples and patterns across multiple devices from a single interface. What each device actually allows differs; see [Supported Devices](#supported-devices).

---

## Features

### Sample Management
- Import, export, and organize samples across Electribe devices
- Audition samples directly in the app using **Web Audio API** playback
- Apply any of **18 built-in DSP effects** (delay, reverb, filter, etc.)

### Pattern Viewer
- Visual pattern display styled after the original Electribe hardware panels
- Browse patterns with per-step parameter display, for all four devices
- Audio playback for ESX-1 patterns, which are the only ones carrying samples
- Rearrange, clear and rename pattern slots on an EMX-1 SmartCard image

### Multi-Device Support
- Manage **ESX-1**, **E2S**, and **EMX-1** side by side
- Read device-specific binary formats; write the ones that are understood
- The only tool that supports all three Electribe models in one application

### Quality
- **451 automated tests** covering file parsing, DSP processing, and UI logic
- Parsers are tested against real hardware dumps, not synthetic buffers
- Test suite built with Vitest

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Electron | Cross-platform desktop app |
| JavaScript | Application logic |
| Web Audio API | Sample playback & DSP effects |
| Vitest | Test framework (451 tests) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run tests
npm test
```

---

## Supported Devices

| Device | Samples | Patterns | File Format |
|--------|---------|----------|-------------|
| Korg ESX-1 | read + write | view; preserved on write | `.esx` |
| Korg E2S | read + write | view + write | `.e2sSample.all`, `.e2pat`, `.e2allpat` |
| Korg EMX-1 | none in the format | view; rearrange + rename | `.emx` |

**On the EMX-1.** It is a synthesizer, not a sampler — an `.emx` file holds no
audio at all, and the sounds live in the hardware's ROM. Patterns can be viewed,
and their slots rearranged, cleared and renamed on a SmartCard image
(1,736,704 bytes), which is written out as a new file. Pattern *content* is not
editable, SysEx dumps are read-only, and song references are left pointing at
slot numbers — reordering patterns can therefore change what an existing song
plays. **No card written by this tool has yet been loaded into an EMX-1.**

**On the ESX-1.** Patterns are displayed and played back, but not edited. They
survive export because the writer patches sample data into the original file
rather than rebuilding it.

---

## License

MIT
