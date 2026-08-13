# Hardware-Testprotokoll — ESX-1 und EMX-1

Zum Ausdrucken. Ergebnisse direkt eintragen, danach ins Repo übernehmen.

**Gerät / Firmware:** ESX-1 ☐ ver. ______   EMX-1 ☐ ver. ______
**Datum:** __________   **Karte / Medium:** ______________________

---

## Grundregeln

- **Immer nur EINE Sache pro Dump ändern.** Sonst ist die Zuordnung Byte ↔ Regler mehrdeutig.
- **Dateinamen sprechend halten** — `drum1_cutoff_0.esx`, nicht `test3.esx`.
- **Gleiches Pattern und gleicher Part** über eine ganze Messreihe behalten.
- **Nie Dateien als Referenz nehmen, die durch Korg Manager gelaufen sind.** Sie prüfen den
  Parser gegen die Annahmen des eigenen Writers und bestätigen jeden gemeinsamen Fehler.

---

# TEIL 1 · EMX-1 — Grundrauschen

**Zuerst machen.** Ohne diesen Schritt ist jede weitere Messung wertlos: manche Bytes
ändern sich bei jedem Speichern von selbst und würden jeden Vergleich zumüllen.

☐ 1. Karte speichern, **ohne irgendetwas zu ändern** → Datei sichern als `BASE1.EMX`
☐ 2. Nochmal speichern, wieder ohne Änderung → `BASE2.EMX`
☐ 3. Beide Dateien an den Rechner übertragen

**Notieren — verändern sich Bytes von allein?**

☐ nein, Dateien identisch    ☐ ja, folgende Offsets:

```
_______________________________________________________________

_______________________________________________________________
```

> Sind die Dateien identisch, entfällt die Ignoreliste und alle folgenden Messungen
> werden deutlich einfacher.

---

# TEIL 2 · EMX-1 — Song-Struktur

Ziel ist **nicht**, Songs musikalisch zu verstehen. Ziel ist, alle Stellen aufzählen zu
können, an denen eine Slotnummer steht. Eine einzelne gefundene Referenz genügt nicht —
neun von zehn umzuschreiben zerstört einen Song unbemerkt.

Vorbereitung: eine Karte mit **möglichst wenigen** Songs verwenden, idealerweise gar keinen.

| ☐ | # | Am Gerät einstellen | Datei | Ergebnis eintragen |
|---|---|---|---|---|
| ☐ | 1 | Ein Song, **ein** Schritt, zeigt auf `A01` | `SONG_A01.EMX` | Song beginnt bei Offset: ______________ |
| ☐ | 2 | Denselben Schritt auf `A02` ändern | `SONG_A02.EMX` | Byte ändert sich um 1 bei: ______________ |
| ☐ | 3 | Denselben Schritt auf `A03` | `SONG_A03.EMX` | Wert: ______  (linear?) ☐ ja ☐ nein |
| ☐ | 4 | Denselben Schritt auf `B01` | `SONG_B01.EMX` | Wert: ______  Bank getrennt? ☐ ja ☐ nein |
| ☐ | 5 | Song auf **zwei** Schritte verlängern | `SONG_2ST.EMX` | Abstand zwischen Einträgen: ______ Bytes |
| ☐ | 6 | Song auf **vier** Schritte verlängern | `SONG_4ST.EMX` | Längenfeld bei Offset: ______________ |
| ☐ | 7 | Zweiten Song auf Songplatz 2 anlegen | `SONG_S2.EMX` | Abstand zwischen Songs: ______ Bytes |
| ☐ | 8 | Denselben Song auf Songplatz 8 | `SONG_S8.EMX` | bestätigt Abstand? ☐ ja ☐ nein |

**Abschlussprüfung** — erst wenn 1 bis 8 stimmig sind:

☐ Aus der ermittelten Struktur die Referenzstellen einer echten Karte aufzählen
☐ Zeigt jede Referenz auf einen existierenden Slot? ☐ ja ☐ nein
☐ Fehlt eine erwartete Stelle? ☐ nein ☐ ja → Struktur noch nicht richtig

---

# TEIL 3 · EMX-1 — Geschriebene Karte prüfen

**Erst nach dem Bau der Slot-Zuordnung.** Vorher gibt es nichts zu prüfen.

> ⚠ Vorher die Originalkarte sichern. Die EMX kennt kein Rückgängig.

☐ 1. Karte in der App laden, **nichts** ändern, als neue Datei speichern
☐ 2. Diese Datei auf die Karte, in die EMX laden → lädt sie fehlerfrei? ☐ ja ☐ nein
☐ 3. Zwei Patterns wählen, **⇄ TAUSCHEN**, speichern, laden → sitzen beide am
     Platz des jeweils anderen, und **kein dritter Slot** hat sich bewegt? ☐ ja ☐ nein
☐ 4. Ein Pattern über zehn Plätze **ziehen** (nachrücken — die zehn dazwischen
     rutschen um eins, nichts wird überschrieben) → Reihenfolge korrekt? ☐ ja ☐ nein
☐ 5. Ein Pattern umbenennen → Name im Display korrekt? ☐ ja ☐ nein
☐ 6. Ein Pattern löschen → wie zeigt die EMX den leeren Slot?

```
_______________________________________________________________
```

☐ 7. Songs vorhanden? Spielen sie nach dem Umsortieren andere Patterns? ☐ ja ☐ nein

**Fehlermeldung im Display, falls etwas scheitert — wortwörtlich notieren:**

```
_______________________________________________________________
```

---

# TEIL 4 · ESX-1 — Export-Checkliste

Deckt fünf Änderungen ab, die bisher **nur gegen Dateien** geprüft wurden, nie gegen das
Gerät: variable Dateigröße, Stereo-Erhalt, Slice-Erhalt, Keyboard-Slice-Byte und den
MIDI-Globals-Editor.

> ⚠ Vorher die Originalkarte sichern.

**A · Grundfunktion**

☐ `.esx` aus der App exportieren
☐ Auf der ESX-1 laden → lädt fehlerfrei? ☐ ja ☐ nein
☐ Samples spielen korrekt? ☐ ja ☐ nein
☐ Sample-Namen im Display korrekt? ☐ ja ☐ nein
☐ Patterns triggern die richtigen Samples? ☐ ja ☐ nein

**B · Die riskanten Änderungen**

| ☐ | Was | Testdatei | Ergebnis |
|---|---|---|---|
| ☐ | **Variable Dateigröße** — Datei deutlich unter 26,5 MB exportieren und laden | | ☐ lädt ☐ Fehler |
| ☐ | **Stereo-Erhalt** — Bank mit Stereo-Samples speichern und laden | | ☐ Stereo erhalten ☐ verloren |
| ☐ | **Slice-Erhalt** — Bank mit Slices speichern, Slices am Gerät prüfen | | ☐ erhalten ☐ verloren |
| ☐ | **Keyboard-Slice-Byte** — neu gebaute Datei, Keyboard-Part spielt ganzes Sample? | | ☐ ja ☐ nein |
| ☐ | **MIDI-Globals** — Kanal in der App ändern, speichern, am Gerät im Global-Menü nachsehen | | ☐ übernommen ☐ nicht |

**C · MIDI-Zusammenspiel mit der EMX-1**

Bekannter Konflikt: ESX Keyboard1 = Ch.1, Keyboard2 = Ch.2, Drums = Ch.10 kollidieren mit
den EMX-Werkskanälen. Freie Kanäle für die ESX: **6–9 und 11–16**.

☐ ESX als MIDI-Slave an der EMX → doppeltes Triggern? ☐ ja ☐ nein
☐ Nach Kanalwechsel über den Globals-Editor behoben? ☐ ja ☐ nein

---

# TEIL 5 · ESX-1 — Pattern-Byte-Zuordnung

Werkzeug: `esx-pattern-diff.js`. Verfahren ausführlich in `ESX_PATTERN_MAPPING_TESTING.md`.

**Vorbereitung**

☐ Leeres, aufgeräumtes Pattern wählen (z.B. Pattern 001) — wenig Grundrauschen
☐ Part und Regler notieren, die getestet werden
☐ Grundrauschen: zweimal speichern ohne Änderung → `BASE1.esx`, `BASE2.esx`

```bash
node esx-pattern-diff.js BASE1.esx BASE2.esx --baseline
```

**Ignoreliste (aufheben, für alle folgenden Vergleiche):**

```
--ignore _______________________________________________________
```

**Messreihe** — je Regler: Startwert speichern, **nur diesen einen** Regler ändern,
Endwert speichern, diffen.

| ☐ | Part | Regler | von → bis | Dateien | Byte | Ergebnis |
|---|---|---|---|---|---|---|
| ☐ | Drum 1 | Cutoff | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | Resonance | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | Level | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | Pan | L → R | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | EG Time | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | Roll | aus → an | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Drum 1 | Reverse | aus → an | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Keyboard 1 | Glide | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Keyboard 1 | Cutoff | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Stretch 1 | Pitch | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Slice | Level | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Audio In | Cutoff | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | Accent | Level | 0 → 127 | | | ☐ stimmt ☐ UNMAPPED |
| ☐ | FX 1 | Type | wechseln | | | ☐ stimmt ☐ UNMAPPED |

> **UNMAPPED** heißt: der Regler landet auf einem Byte, das der Code nicht kennt. Genau
> das sind die Treffer. Besonders verdächtig sind die als frei geführten Bytes —
> Drum 2, 3, 13, 14, 17 · Keyboard 2, 3, 13, 14, 17 · Stretch/Slice 11, 12, 15 ·
> Audio In 7, 8, 11.

**Kodierung genauer bestimmen** (optional, sehr hilfreich): statt nur 0 → 127 mehrere
Zwischenwerte speichern — **0, 1, 2, 64, 127** — und paarweise diffen. Daraus liest man
ab, ob linear, mit Offset, invertiert oder bit-gepackt kodiert wird.

---

## Nach der Session

☐ Dateien nach WSL kopieren (nicht auf `/mnt/c` arbeiten)
☐ Ergebnisse in dieses Dokument oder direkt in die Format-Spezifikationen übertragen
☐ Gefundene Byte-Zuordnungen mit je einem Test absichern
☐ Widerlegte Doku-Aussagen korrigieren, statt sie stehen zu lassen
