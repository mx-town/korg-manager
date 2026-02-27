# 🎛️ KORG ESX-1 Sample Manager

A desktop application for Windows to manage samples for the **Korg Electribe ESX-1** sampler.  
Import WAV files from your PC, preview them, and export as `.esx` files ready for your SmartMedia/SD card.

![Electron](https://img.shields.io/badge/Electron-28-blue?logo=electron)
![Platform](https://img.shields.io/badge/Platform-Windows-blue?logo=windows)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **Import WAV files** → auto-converts to 16-bit mono PCM @ 44.1kHz (ESX-1 format)
- **Open existing .esx files** → view and edit samples from your Electribe backups
- **Waveform preview** → visual display of each sample
- **Audio playback** → listen to samples before exporting
- **Export .esx file** → ready to copy to SmartMedia/SD card and load into ESX-1
- **Export individual WAVs** → extract samples from .esx files
- **Memory monitor** → see how much of the ESX-1's 285-second sample memory you're using
- **Keyboard shortcuts** → Space (play), Delete (remove), F2 (rename), Arrow keys (navigate)

## 📋 Supported Input Formats

| Format | Bit Depth | Sample Rate | Channels |
|--------|-----------|-------------|----------|
| WAV    | 8/16/24/32-bit PCM | Any (resampled to 44.1kHz) | Mono/Stereo (mixed to mono) |
| WAV    | 32/64-bit Float | Any | Mono/Stereo |

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ 
- npm (comes with Node.js)

### Install & Run

```bash
# Clone or download this project
cd korg-esx-manager

# Install dependencies
npm install

# Start the app
npm start
```

### Build Windows Installer

```bash
# Build .exe installer
npm run build
```

The installer will be in the `dist/` folder.

## 🎹 How to Use

### 1. Import Samples
- Click **"Import WAV"** or drag & drop WAV files into the app
- Files are automatically converted to ESX-1 compatible format
- Sample names are truncated to 8 characters (ESX-1 limitation)

### 2. Manage Samples
- Click a sample to preview its waveform
- Press **Space** to play/stop the sample
- Press **F2** or double-click to rename
- Press **Delete** to remove
- Monitor memory usage in the sidebar

### 3. Export .ESX File
- Click **"Export .ESX"** to save your sample bank
- Copy the `.esx` file to your SmartMedia or SD card
- On the ESX-1: go to **GLOBAL** → **DATA** → **LOAD** → select your file

## ⚠️ ESX-1 Limitations

| Limit | Value |
|-------|-------|
| Max mono samples | 256 |
| Max stereo samples | 128 |
| Max sample memory | ~285 seconds @ 44.1kHz (~24 MB) |
| Sample name length | 8 characters |
| Sample format | 16-bit signed PCM (Big Endian) |
| Supported rates | 44100, 22050, 11025 Hz |

## 🏗️ Project Structure

```
korg-esx-manager/
├── main.js              # Electron main process + ESX logic
├── preload.js           # IPC bridge (context isolation)
├── package.json         # Dependencies & build config
├── src/
│   ├── index.html       # UI (HTML + CSS + JS)
│   └── esx-format.js    # ESX binary format builder/parser
└── README.md
```

## 📖 ESX File Format

The `.esx` file is a binary dump of the ESX-1's internal memory:

| Offset | Content |
|--------|---------|
| `0x000000` | KORG header signature |
| `0x000020` | Global parameters (tempo, etc.) |
| `0x000200` | 256 patterns × 4280 bytes |
| `0x130000` | 64 songs × 528 bytes |
| `0x1B0000` | Sample bank header ("BPX") |
| `0x1B0020` | Sample counters & offset |
| `0x1B0100` | 256 mono sample headers × 40 bytes |
| `0x1B2900` | 128 stereo sample headers × 44 bytes |
| `0x250000` | PCM sample data (variable length) |

## 🙏 Credits

- Format research from [open-electribe-editor](https://github.com/skratchdot/open-electribe-editor) by @skratchdot
- [electribe](https://github.com/lammas/electribe) Node.js toolkit by @lammas
- [Korg ESX-1 Owner's Manual](https://www.korg.com/us/support/download/manual/1/105/1606/)

## 📄 License

MIT
