# ESX-1 Pattern Byte-Mapping — Differential Testing Guide

**Ziel:** Das ESX-1 Pattern-Byte-Mapping (in `src/esx-format.js` + `ESX_FILE_STRUCTURE.md`)
gegen echte Hardware verifizieren und falsche Zuordnungen korrigieren.

**Methode:** Genau *einen* Regler ändern → Datei vorher/nachher speichern → Bytes diffen.
Werkzeug: `esx-pattern-diff.js` (im Repo-Root).

---

## Vorbereitung (einmalig)

1. **Leeres/aufgeräumtes Pattern wählen** (z.B. Pattern 001), damit wenig
   Grundrauschen im File steckt.
2. **Notieren, was getestet wird:** welcher Part (z.B. „Part 1 = Drum 1")
   und welcher Regler (z.B. Cutoff).
3. Projektordner bereithalten, in den die `.esx`-Dumps kopiert werden.

## Baseline-Rauschen ermitteln (einmalig)

Manche Bytes ändern sich bei *jedem* Speichern von selbst (Padding,
Current-Pattern-Zeiger). Die müssen aus dem Diff raus.

4. Karte im ESX-1 **speichern, ohne etwas zu ändern** → Reader → als
   **`BASE1.esx`** kopieren.
5. **Nochmal speichern, wieder ohne Änderung** → als **`BASE2.esx`** kopieren.
6. Rauschen ermitteln:
   ```bash
   node esx-pattern-diff.js BASE1.esx BASE2.esx --baseline
   ```
   → gibt eine fertige Zeile `--ignore 0x..,0x..` aus. **Diese Zeile aufheben.**

## Pro Regler-Test (wiederholen)

7. Regler auf klaren **Startwert** (z.B. Cutoff = 0). Speichern → **`BEFORE.esx`**.
8. **NUR diesen einen Regler** ändern, klarer **Endwert** (z.B. Cutoff = 127).
   **Nichts anderes anfassen.** Speichern → **`AFTER.esx`**.
9. Diff mit der Ignore-Zeile aus Schritt 6:
   ```bash
   node esx-pattern-diff.js BEFORE.esx AFTER.esx --ignore 0x..,0x..
   ```
10. **Ergebnis + Kontext notieren/schicken**, z.B.:
    *„ESX Part 1 / Drum 1, Regler Cutoff, 0 → 127"*.

## Encoding-Details (optional, sehr hilfreich)

11. Statt nur 0→127 mehrere Zwischenwerte speichern: **0, 1, 2, 64, 127**
    (`c0.esx`, `c1.esx`, …) und paarweise diffen. Daraus lässt sich ablesen,
    ob der Wert linear, mit Offset, invertiert oder bit-gepackt kodiert ist.

---

## Faustregeln

- **Immer nur EINE Sache pro Dump ändern** — sonst ist die Byte↔Regler-Zuordnung
  mehrdeutig.
- **Gleiches Pattern + gleicher Part** über eine ganze Testserie behalten.
- **Dateinamen sprechend** halten (`drum1_cutoff_0.esx`).

## Was der Diff ausgibt

- `Pattern 3 → Drum 5 → param:cutoff  0x7f→0x55` → Mapping **stimmt**.
- `Pattern 3 → Drum 5 → ⚠️ UNMAPPED(+13)` → Regler landet auf einem Byte, das
  der Code **nicht kennt** → Mapping falsch verschoben ODER unbekannter
  Parameter (Roll, Reverse, MFX-Send, Motion-Flag, …).

---

## Aktuelles Ist-Mapping (Stand: was der Code annimmt)

Pattern = 4280 Bytes, erstes Pattern ab `0x200`. Part-Offsets relativ zum
Pattern-Anfang:

| rel. Offset | Part | Größe |
|---|---|---|
| `0`    | Pattern-Header (Name `0–15`, Tempo `16–17` = u16BE/128) | 24 |
| `24`   | Drum 1–9 (9 × 34) | 306 |
| `330`  | KB 1  | 274 |
| `604`  | KB 2  | 274 |
| `878`  | Stretch 1 | 32 |
| `910`  | Stretch 2 | 32 |
| `942`  | Slice | 32 |
| `974`  | Audio In | 156 |
| `1130` | Accent | 18 |
| `1148` | FX (3 × 4) | 12 |
| `1160` | Motion (Slots à 130) | Rest |

Parameter-Offsets innerhalb der Parts (rel. zum Part-Anfang):

**Drum (34B):** 0–1 sampleNum(u16BE) · 4 filterType · 5 cutoff · 6 resonance ·
7 egInt · 8 pitch · 9 level · 10 pan · 11 egTime · 12 startPoint · 15 modSpeed ·
16 modDepth · 18–33 stepBytes(LSB-first) · **frei: 2,3,13,14,17**

**Keyboard KB1/KB2 (274B):** 0–1 sampleNum · 4 glide · 5 filterType · 6 cutoff ·
7 resonance · 8 egInt · 9 level · 10 pan · 11 egTime · 12 startPoint · 15 modSpeed ·
16 modDepth · 18–145 note-Bytes(Bit7=gate,0=ON) · 146–273 gates · **frei: 2,3,13,14,17**

**Stretch/Slice (32B):** 0–1 sampleNum · 2 filterType · 3 cutoff · 4 resonance ·
5 egInt · 6 pitch · 7 level · 8 pan · 9 egTime · 10 startPoint · 13 modSpeed ·
14 modDepth · 16–31 stepBytes · **frei: 11,12,15**

**Audio In (156B):** 0 filterType · 1 cutoff · 2 resonance · 3 egInt · 4 level ·
5 pan · 6 egTime · 9 modSpeed · 10 modDepth · 12–27 stepBytes · 28–155 gates ·
**frei: 7,8,11**

**Accent (18B):** 0 level · 1 reserved · 2–17 stepBytes (INVERTIERT: 1=OFF)

**FX (12B):** 3 Effekte à 4 Byte → type, param1, param2, param3

> Die **freien** Bytes sind die spannenden Kandidaten: fällt ein Regler dort hin,
> ist das Mapping korrekturbedürftig.
