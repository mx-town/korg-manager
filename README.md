# 🎹 Korg Manager — Electribe Sample & Pattern Manager

[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Tests](https://img.shields.io/badge/Tests-240%20passed-brightgreen)](https://vitest.dev)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

Desktop application for managing Korg Electribe synthesizers. Supports the **ESX-1**, **E2S**, and **EMX-1** — read, edit, and organize samples and patterns across multiple devices from a single interface.

---

## Features

### Sample Management
- Import, export, and organize samples across Electribe devices
- Audition samples directly in the app using **Web Audio API** playback
- Apply any of **18 built-in DSP effects** (delay, reverb, filter, etc.)

### Pattern Viewer
- Visual pattern editor styled after the original Electribe hardware panels
- View and browse patterns with per-step parameter display

### Multi-Device Support
- Manage **ESX-1**, **E2S**, and **EMX-1** simultaneously
- Read and write device-specific binary file formats
- The only tool that supports all three Electribe models in one application

### Quality
- **240 automated tests** covering file parsing, DSP processing, and UI logic
- Test suite built with Vitest

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Electron | Cross-platform desktop app |
| JavaScript | Application logic |
| Web Audio API | Sample playback & DSP effects |
| Vitest | Test framework (240 tests) |

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
| Korg ESX-1 | ✅ | ✅ | `.esx` |
| Korg E2S | ✅ | ✅ | `.e2sallpat` |
| Korg EMX-1 | ✅ | ✅ | `.emx` |

---

## License

MIT
