# ESX-1: hardware-korrekter Leerzustand für neu gebaute Files

**Datum:** 2026-08-03
**Stand (2026-08-18):** **Gebaut und in `main`** (`4564061`, `f17f088`, `e5f4ae2`,
`0abaf63`, `9656951`, `fed10ac`, `6661c77`, `9dac6e2`). Plan:
`docs/superpowers/plans/2026-08-03-esx-init-state.md`. **§5 ist überholt:** die
Ziffernzahl fiel mit `a3946b2` (`A.001` → `A.01`, „no hardware backing"), und die
EMX-Notation lautet seit `2026-08-12-emx-slot-mapping-design.md` `A01`…`P16` statt
`A.001`…`D.064` — sie ist allerdings selbst unbelegt, siehe `CONTEXT.md`, Abschnitt
Slot. Ebenfalls überholt: `e5f4ae2` vergab „Init" als Namen leerer Patterns, `9dac6e2`
korrigierte das auf leere Namen.
**Branch:** `feat/unified-sample-manager`
**Betroffen:** `src/esx-format.js`, `src/index.html` (Pattern Viewer), `main.js`

## Problem

`EXPORT NEW` hat bei einem realen Anwenderfall (`Y2.esx`) alle 256 Patterns, alle
Songs und die MIDI-Globals eines geladenen Files verworfen. Ursache ist kein Bug im
engeren Sinn, sondern die Arbeitsteilung der beiden Export-Pfade:

| Button | Handler | Funktion | Verhalten |
|---|---|---|---|
| 💾 SAVE | `main.js:369` | `rebuildEsxFile()` | erhält Patterns/Songs/Globals byte-genau |
| 📤 EXPORT NEW | `main.js:397` | `buildEsxFile()` | baut von Null, verwirft alles außer Samples |

Verifiziert: `rebuildEsxFile(Y.ESX, samples)` ändert 0 Patterns, 0 Song-Bytes,
0 Global-Bytes bei identischer Dateigröße.

Der von `buildEsxFile()` erzeugte Leerzustand weicht aber vom echten Hardware-Leerzustand
ab, und die dabei vergebenen Pattern-Namen `A.001…D.064` sind eine Erfindung des
Korg Managers. Das ist die vom Anwender bemerkte „falsche Pattern-Benennung".

## Ground Truth

Referenzfile: `https://projects.skratchdot.com/esx-files/esx/ESX-Factory-Data.esx`
(20.721.848 Bytes, 200 Mono-Samples), gegengeprüft an einem unabhängigen
Hardware-Dump `X.ESX` (23.245.376 Bytes, 241 Samples).

**Pattern.** 105 Patterns im Factory-File heißen `Init`. 104 davon sind byte-identisch;
derselbe 4280-Byte-Block steckt 98× in `X.ESX`. Es gibt also genau einen kanonischen
Init-Block, aus zwei unabhängigen Quellen bestätigt.

**Song.** 4 der 64 Songs sind belegt. Die übrigen 60 sind untereinander byte-identisch:
Name = 8× `0x20`, Byte +8 = `0x3c`, Rest 0.

**Pattern Set** (GP+0x40…0xBF). Factory:
`00 0d 11 21 2b 31 36 38 41 4a 51 5d 61 68 6b 70 76 79 7e ff`, danach Identity ab
Slot 20. Also 19 Favoriten-Einträge plus `0xFF`-Terminator.

## Abweichungen `createEmptyEsx()` ↔ Hardware

Der kanonische Init-Block referenziert Factory-Sample-Nummern (21, 54, 55, 130, 138,
165, 183) und hat auf Drum-Part 1 einen durchlaufenden Four-on-the-floor
(`0x11` × 16 Bytes = Steps 1/5/9/13 über alle 128 Steps). Beides ist im Werks-Sampleset
sinnvoll, in einer beliebigen Anwenderbank nicht.

**Entscheidung:** Struktur des Hardware-Blocks übernehmen, Sample-Pointer und
Drum-1-Steps neutralisieren (auf 0). Nach dieser Neutralisierung bleiben exakt
**7 Delta-Bytes pro Pattern** und **8 pro Song**.

### Pattern (7 Bytes)

| Offset | Feld | jetzt | soll | Evidenz |
|---|---|---|---|---|
| +0…4 | Name | `A.001` | `Init ` | 104/105 WEB-Factory, 98/105 X.ESX |
| +332 | KB1 Slice | `0xFF` | `0x00` | 958 von 1024 echten KB-Parts sind `0x00`, nur 14 sind `0xFF` |
| +606 | KB2 Slice | `0xFF` | `0x00` | dito |

Alle übrigen 4273 Bytes stimmen bereits.

### Song (8 Bytes)

| Offset | Feld | jetzt | soll |
|---|---|---|---|
| +0…7 | Name | 8× `0x00` | 8× `0x20` |

Danach ist der leere Song byte-identisch zu den 60 leeren Factory-Songs.

## Änderungen

### 1. `initDefaultPattern()` — `src/esx-format.js:427`

- Name `"Init    "` statt Bank-Notation
- Parameter `patternIndex` entfällt (wird dadurch unbenutzt); Aufrufer `esx-format.js:601` anpassen

### 2. `initKeyboardPart()` — `src/esx-format.js:304`

- Slice-Byte +2 auf `0x00` statt `0xFF`

Der bestehende Kommentar („`0xFF` = kein Slice, spielt ganzes Sample") wird durch die
Messung ersetzt: die Hardware schreibt hier praktisch immer `0x00`.

### 3. `initDefaultSong()` — `src/esx-format.js:497`

- Name = 8× `0x20`

### 4. `buildEsxFile()` — Auto-Demo entfernen, `src/esx-format.js:806-829`

Der Block schreibt `Math.ceil(n/9)` Patterns mit
- Namen `A.001`…,
- Sample-Zuweisung `pat*9 + p` auf die 9 Drum-Parts,
- `0x11, 0x11` auf Drum-Part 0.

Er entfällt ersatzlos. Ein neues File enthält 256 identische Init-Patterns ohne
Sample-Referenzen und ohne Steps.

Der `loopStart = endFrame`-Fix (`esx-format.js:756-759`) **bleibt** — er ist korrekt und
war der Grund, weshalb Keyboard-Parts in `Y2.esx` wieder klangen: die Vorgängerfiles
hatten auf allen 241 Samples `loopStart = 0xFFFFFFFF`, im echten Factory-File kommt
dieser Wert nie vor.

### 5. Pattern-Liste zeigt die Bank-Position — `src/index.html:3883, 3897`

Die Zeile rendert heute den rohen Index `0…255`. Ersetzt durch die geräteübliche
Positions-Notation, Name daneben:

```
A.001   Init
A.002   Init
...
A.017   R&B1        (bei einem Factory-File)
```

Positions-Label je Gerät, abgeleitet aus `deviceId` des Unified-Pattern-Formats:

| Gerät | Patterns | Notation |
|---|---|---|
| ESX-1 | 256 | `A.001`…`D.064` (4 Bänke × 64) |
| EMX-1 | 256 | `A.001`…`D.064` (4 Bänke × 64) |
| E2 / E2S | 250 | `001`…`250` (flach) |

`patUpdateInfoBar()` (`src/index.html:3927`) bekommt die Position als erstes Badge vor
dem Namen.

### 6. Guard auf EXPORT NEW — `src/index.html:exportNewEsx()`

Ist ein File geladen (`fp` gesetzt), vor dem Speichern-Dialog bestätigen lassen:
Patterns, Songs und MIDI-Globals des geladenen Files werden verworfen, SAVE behält sie.
Ohne geladenes File kein Dialog.

## Bewusst nicht geändert

**Pattern Set** (GP+0x40…0xBF): bleibt bei Identity `0…127`. Korgs 19 Favoriten zeigen
auf Factory-Patterns, die in einem leeren File nicht existieren; „Slot n ruft Pattern n"
ist dort sinnvoller. 19 Bytes Abweichung, hardware-unkritisch.

**MIDI-Globals** von `createEmptyEsx()`: KB1 = Ch.1, KB2 = Ch.2, Drum = Ch.10 — identisch
zum Factory-File. Dass Ch.1/Ch.2/Ch.10 mit EMX-Defaults kollidieren, ist eine Frage der
Geräte-Konfiguration und wird vom MIDI-Globals-Editor (Commit `09bc6bf`) abgedeckt, nicht
vom Datei-Default.

## Tests

Neue Fixtures unter `tests/fixtures/`:

- `esx-init-pattern.bin` — 4280 Bytes, kanonischer Init-Block aus dem Factory-File,
  Sample-Pointer (Offsets 58, 194, 228, 330, 604, 878, 910, 942 als uint16BE) und
  Drum-1-Steps (+42…57) auf 0 gesetzt
- `esx-empty-song.bin` — 528 Bytes, leerer Factory-Song

Neue Assertions:

- jeder der 256 Pattern-Blöcke aus `createEmptyEsx()` ist byte-gleich zu `esx-init-pattern.bin`
- jeder der 64 Song-Blöcke ist byte-gleich zu `esx-empty-song.bin`
- `buildEsxFile(samples)` lässt alle 256 Pattern-Blöcke unverändert gegenüber `createEmptyEsx()`
- `rebuildEsxFile(original, samples)` ändert weiterhin 0 Pattern-, 0 Song- und 0 Global-Bytes

Anzupassende Tests (erwarten die alte Bank-Benennung):

- `tests/parsers/esx.test.js:167`
- `tests/parsers/esx-patterns.test.js:78`
- `tests/parsers/esx-patterns.test.js:117`

Alle bestehenden Tests müssen weiterhin durchlaufen (`npm test`).

## Nicht in diesem Spec

Reparatur vorhandener Files (`Y.ESX` → `Y3.esx` mit korrigierten Loop-Points bei
erhaltenen Patterns) ist eine separate, einmalige Aktion und kein Produktfeature.

## Anhang: ModernKorgManager v2.1

Geprüft auf Übernehmbares (`github.com/kozywav/ModernKorgManager`, Release v2.1 vom
2026-07-27). Ergebnis: nichts verwertbar.

- Repository enthält ausschließlich eine 80-Byte-README, ein Branch, keine Sourcen
- Kein LICENSE → alle Rechte vorbehalten
- Releases nur als Windows-Installer (`.exe`, 4,3 MB)
- Zielgerät ist die Electribe 2 / E2S, nicht die ESX-1 — anderes Patternformat
- Release-Notes v1.4: „Pattern Manager aus offizieller Clean-Version entfernt"

Übernehmbar sind allenfalls Feature-Ideen aus den Release-Notes (Vocal Cleaner,
Auto-Level-Presets, MIDI-to-Korg mit Piano-Roll, +12 dB pro Sample). Für den
ESX-1-Pattern-Bereich liegt die Ground Truth ohnehin in den echten Hardware-Files.
