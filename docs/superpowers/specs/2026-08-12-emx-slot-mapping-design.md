# EMX-1: Pattern-Verwaltung über Slot-Zuordnung

**Datum:** 2026-08-12
**Branch:** offen — `feat/unified-sample-manager` ist 16 Commits vor `origin/main`
und nicht gemergt; laut `ROADMAP.md:53` soll pro Aufgabe von `main` aus gearbeitet werden
**Betroffen:** `src/emx-format.js`, `main.js`, `preload.js`, `src/index.html`
**Glossar:** `CONTEXT.md`

## Problem

Die EMX-1 ist read-only. `src/emx-format.js` hat `parseEmxDump`, `parseSmartCardDump`
und `listPatterns`, aber keine einzige `build*`-Funktion. Patterns lassen sich ansehen
und nicht zurückschreiben.

Angefragt wurde (Mail Aleksandr Sever, 2026-08-11) genau das Fehlende: Patterns
**löschen, kopieren, verschieben und umbenennen**, um Material für Live-Auftritte
vorzubereiten. Auf keiner Roadmap-Position enthalten.

Die öffentliche README behauptet für EMX-1 Patterns ✅ und „read and **write**
device-specific file formats". Beides ist unzutreffend und gehört unabhängig von
diesem Spec korrigiert.

## Ground Truth

Gemessen an den drei Hardware-Dumps in `test-data/emx/` (je 1.736.704 Bytes):
`BEST.EMX` (Werkskarte), `DA4TOFE.EMX`, `ZRITERLY.EMX`.

**Byte 0x00C ist keine Prüfsumme.** `BEST.EMX` und `ZRITERLY.EMX` tragen dort
identisch `9F86A0BA` und in den Flags bei 0x010 identisch `00010000`, obwohl ihr
Pattern-Bereich völlig verschieden ist (sum32 `07b2a726` gegen `0764dfe8`).
`DA4TOFE.EMX` weicht ab (`7E80F5AF` / `00020001`), was zu einer anderen Firmware-
oder Werkzeugversion passt, nicht zum Inhalt. Umsortieren kann das Feld also nicht
entwerten. `EMX_SMARTCARD_FORMAT.md:28` führt es zu Unrecht als „Checksum/Serial".

**Pattern-Blöcke sind ortsunabhängig.** Über alle 4.806 Byte-Positionen und alle
256 Slots korreliert in keiner der drei Dateien ein einziges Byte mit der Slotnummer
(geprüft gegen `index` und `index+1`). Ein Block trägt seine Position nicht in sich;
reines Blockkopieren genügt.

**Der leere Slot existiert als Hardware-Artefakt.**

| Karte | häufigster Block | Name | Tempo | Swing | Beat |
|---|---|---|---|---|---|
| `BEST.EMX` | 5× | `"Init    "` | 120,0 | 0 | 16tel |
| `DA4TOFE.EMX` | **114×** | 8× `0x20` | 130,0 | 6 | 16tri |
| `ZRITERLY.EMX` | 2× | 8× `0x20` | 180,0 | 23 | 32tel |

Die 114 identischen Blöcke in `DA4TOFE.EMX` sind unbenutzte Slots. Der Werks-Init-Block
aus `BEST.EMX` unterscheidet sich davon in **74 von 4.806 Bytes**, im Wesentlichen
Tempo, Swing und Beat. Dieselbe Struktur, einmal mit Werks-, einmal mit
Anwendereinstellungen.

`ZRITERLY.EMX` zeigt den dritten Fall: 242 leere Namen, aber 254 verschiedene Blöcke.
Ein geleerter Name räumt den Slot nicht auf. **Ein leerer Name ist kein leerer Slot.**

**Der Song-Bereich ist auf allen drei Karten dicht belegt.** Ab 0x12C800 sind
`BEST` 45,8 %, `DA4TOFE` 50,4 % und `ZRITERLY` 40,8 % nicht-null; letztere enthält
zusätzlich 128.593 Bytes `0xFF`, was nach gelöschtem Flash aussieht.
`EMX_SMARTCARD_FORMAT.md:162` behauptet für `ZRITERLY` „mostly zeros (no songs)" —
das ist widerlegt. Praktische Folge: **einer Datei ist nicht anzusehen, ob Songs
darauf sind**, solange die Struktur unbekannt ist. Eine bedarfsgesteuerte Warnung
ist damit nicht zu haben.

## Modell

Vollständig in `CONTEXT.md`. Kurzfassung:

Eine **Karte** trägt 256 **Slots** (`A01`…`P16`). Ein Slot ist nie abwesend, nur leer.
Ein **Pattern** ist der Inhalt eines Slots und ortsunabhängig.

Jede Umsortierung ist genau **eine Slot-Zuordnung**: welcher Quellslot landet auf
welchem Zielplatz, für alle 256 auf einmal. Tauschen, Verschieben und Löschen sind
keine eigenen Dateioperationen, sondern verschiedene Zuordnungen. **Umbenennen** ist
die einzige Aktion außerhalb davon — sie ändert acht Bytes und keine Position.

**Verschieben** heißt nachrücken: die Patterns zwischen Quelle und Ziel verschieben
sich um eine Position, nichts wird überschrieben. Tauschen fällt als Sonderfall der
Zuordnung mit ab.

Weil Umbenennen außerhalb der Zuordnung steht, zählt es trotzdem als offene Änderung:
eine Sitzung, in der nur umbenannt wurde, muss speicherbar sein und muss sich
zurücknehmen lassen. Die Zuordnung allein zu befragen genügt dafür nicht — sie ist in
diesem Fall die Identität. Nachgetragen nach dem Code-Review, der genau diese Lücke
in der Umsetzung gefunden hat.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Format | **Nur SmartCard** (1.736.704 Bytes). SysEx bleibt draußen |
| Primitiv | **Eine Slot-Zuordnung**, nicht vier Operationen |
| Verschieben | **Nachrücken**, nicht tauschen |
| Leerer Slot | Init-Block aus `BEST.EMX`, **Name auf 8× `0x20`** |
| Songs | Referenzen **nicht** mitziehen, beim Speichern warnen |
| Speichern | **Nur neue Datei**, kein Überschreiben |

Zum leeren Slot: dieselbe Frage wurde für die ESX bereits zweimal entschieden.
`e5f4ae2` vergab „Init" als Namen, `9dac6e2` korrigierte das auf leere Namen mit der
Begründung „like a hardware-saved bank". Eine Karte aus diesem Werkzeug ist eine
gespeicherte Anwenderkarte, keine Werkskarte — also leerer Name. Nullen scheiden aus,
weil erfunden: der Wert kommt auf keiner der drei Karten vor.

Zum Speichern: Überschreiben wird vertretbar, sobald es Backups gibt. Die sind in eine
eigene Session verschoben (siehe „Nicht in diesem Spec"), also bleibt es vorerst bei
neuen Dateien.

## Änderungen

### 1. `src/emx-format.js` — Writer

Neu, alle rein und Electron-frei:

```
applySlotMapping(buffer, mapping) -> Buffer
```

`mapping` ist ein Array der Länge 256. `mapping[ziel]` ist entweder der Quellslot
(`0…255`) oder `null` für „leer". Die Funktion kopiert `buffer`, schreibt den
Pattern-Bereich `0x200 … 0x12C7FF` gemäß Zuordnung neu und lässt jedes Byte außerhalb
davon unangetastet. Quelle ist immer der **Originalpuffer**, nie ein Zwischenstand —
sonst überschreiben sich Slots gegenseitig.

```
renamePattern(buffer, slot, name) -> Buffer
```

Schreibt acht Bytes ASCII, mit `0x20` rechts aufgefüllt, an `0x200 + slot × 4806`.
Zeichen außerhalb `0x20…0x7E` werden abgewiesen, nicht ersetzt.

```
emptyPatternBlock() -> Buffer   // 4806 Bytes
```

Liefert den Fixture-Block (siehe 2.).

Hilfsfunktionen für die UI, ohne Dateizugriff:

```
mappingIdentity()                    -> number[256]
mappingMove(mapping, from, to)       -> number[256]   // nachrücken
mappingSwap(mapping, a, b)           -> number[256]
mappingClear(mapping, slots)         -> number[256]
```

Damit ist jede UI-Aktion eine Zuordnungstransformation, und die Datei wird genau
einmal am Ende geschrieben.

### 2. Fixture `tests/fixtures/emx-empty-pattern.bin`

4.806 Bytes, gewonnen aus `BEST.EMX` (der 5× vorkommende Init-Block, Werkseinstellungen
120 BPM / kein Swing / 16tel), Name auf 8× `0x20` gesetzt. Extraktionsskript analog zu
`extract-init-fixtures.js`.

Bewusst der Werksblock und nicht der 114×-Block aus `DA4TOFE.EMX`: letzterer trägt mit
130 BPM, Swing 6 und Beat 16tri die Vorlieben eines fremden Anwenders.

### 3. `main.js` — Puffer behalten

`emx:open-file` (`main.js:2029`) und `emx:open-patterns` (`main.js:2044`) lesen den
Puffer, parsen ihn und verwerfen ihn. `emx:open-patterns` gibt nicht einmal den Pfad
zurück. Preserve-and-Patch braucht beides.

Neu, analog zu `esxOriginalBuffer`:

```js
let emxOriginalBuffer = null;   // Originalbytes der geladenen Karte
let emxFilePath       = null;
```

Gesetzt in beiden Handlern, nur wenn `detectEmxFormat(buffer) === 'smartcard'`.
Bei `'sysex'` bleibt es `null` und die Verwaltungsfunktionen sind gesperrt.

Neue Handler:

- `emx:apply-mapping` — nimmt die Zuordnung, baut den Puffer, prüft die Invariante,
  öffnet den Speichern-Dialog, schreibt. Überschreiben wird nicht angeboten.
- `emx:rename-pattern` — Slot und Name, patcht im Speicher, kein Schreibvorgang.

### 4. `preload.js` — Bridge

Der `emx`-Block (`preload.js:96`) bekommt `applyMapping(mapping)` und
`renamePattern(slot, name)`.

### 5. `src/index.html` — Oberfläche im Pattern-Viewer

Nicht im Sample-Manager. Eine EMX-Karte enthält keine Samples (`CLAUDE.md`: „No audio in
the file — synthesis-based"), die Datenform in `file-tabs.js:45` ist durchgehend
Sample-förmig und für eine EMX nicht befüllbar. Die Zwei-Tab-Grenze samt Split-Ansicht
(`:3059`, `:3060`) existiert zudem, um Samples zwischen ESX und E2S zu vergleichen und zu
kopieren — ein EMX-Gegenstück gibt es nicht, Patterns wandern nicht zwischen Geräten.

Der Pattern-Viewer hat dagegen alles schon: EMX-Ladepfad (`:3852`), Pattern-Liste
`patRenderList()` (`:3903`), gerätespezifische Darstellung `renderEmxInline` (`:3607`),
Part-Bezeichnungen (`:3555`), und `patFormat` als Schalter (`:3545`, `:3800`).

**Schwebende Zuordnung.** Alle Aktionen ändern zunächst nur eine Zuordnung im Renderer,
nicht die Datei. Die Liste zeigt die geplante Reihenfolge sofort, geschrieben wird genau
einmal beim Speichern. Dazu gehört ein Zurücksetzen auf die Identität.

**Sichtbarkeit.** Verschobene und geleerte Slots werden gegenüber ihrem Ursprungszustand
markiert, damit vor dem Speichern erkennbar ist, was sich ändert.

**Bedienung.** Zeilen umsortieren per Ziehen, Mehrfachauswahl analog zum Sample-Manager
(`60f3461`: Paint-Select, Strg-/Umschalt-Klick, Strg+A). Umbenennen in der Zeile.
Löschen setzt den leeren Block ein.

Nachtrag aus der Umsetzung: **Paint-Select entfällt.** Ziehen ist hier fürs Umsortieren
belegt, und beides an dieselbe Geste zu hängen ginge nicht. Strg-/Umschalt-Klick und
Strg+A bleiben. Ebenso bleiben `Entf` und `F2` unbelegt: beide hängen bereits global am
Sample-Manager, eine Doppelbelegung würde im Pattern-Viewer Samples löschen. Die Leiste
hat dafür Schaltflächen.

**Sperre.** Die Bedienelemente erscheinen nur, wenn `patFormat === 'EMX-1'` **und** die
geladene Datei SmartCard ist. Bei einem SysEx-Dump bleiben sie aus — `emxOriginalBuffer`
ist dann `null`.

`patRenderList()` rendert heute Position, Name, Aktivitätspunkte und BPM in einer
zwischengespeicherten DOM-Liste (`_patListItems`). Die Zuordnung wird beim Rendern
zwischen Zeilenindex und `patData` gelegt; die Zeile zeigt die Zielposition, der Inhalt
kommt aus dem zugeordneten Quellslot.

### 6. Song-Warnung

Vor dem Schreiben, wenn die Zuordnung von der Identität abweicht:

> Songs verweisen auf Slotnummern, nicht auf Patterns. Nach dem Umsortieren spielen
> vorhandene Songs möglicherweise andere Patterns. Die Songdaten selbst bleiben
> unverändert erhalten.

Nicht unterdrückbar, solange nicht feststellbar ist, ob überhaupt Songs vorliegen.

## Invariante

Vor jedem Schreibvorgang, als harte Schranke:

1. **Alles außerhalb `0x200 … 0x12C7FF` ist byte-identisch zum Original.**
   512 Bytes Header plus 505.856 Bytes Song- und Globalbereich — 506 KB, die
   unverstanden sind und deshalb unberührt bleiben.
2. **Länge unverändert**, exakt 1.736.704 Bytes.
3. **Gegenprobe:** Ergebnis erneut mit `parseSmartCardDump` einlesen und Slot für Slot
   gegen die beabsichtigte Zuordnung vergleichen.

Schlägt eine der drei fehl, wird nicht geschrieben, sondern gemeldet.

Der Wert dieser Prüfung liegt darin, dass sie **ohne Hardware** läuft. Sie gehört in
`npm test` gegen die drei echten Karten und sichert das Feature ab, lange bevor
jemand eine Karte in ein Gerät steckt.

## Tests

Neue Datei `tests/parsers/emx-slot-mapping.test.js`, gegen alle drei echten Dumps:

- Identitätszuordnung liefert einen Puffer, der byte-identisch zum Original ist
- Tausch zweier Slots: nur die beiden Blöcke ändern sich, alle 254 anderen nicht
- Verschieben mit Nachrücken: Blockfolge stimmt, kein Block geht verloren, keiner
  kommt doppelt vor
- Löschen: der Zielblock ist byte-gleich zu `emx-empty-pattern.bin`
- Umbenennen: exakt 8 Bytes geändert, an der richtigen Position
- **Invariante**, bei jeder der obigen Operationen: alles außerhalb des
  Pattern-Bereichs unverändert, Länge konstant
- Rundlauf: `parseSmartCardDump(applySlotMapping(buf, m))` liefert die Patterns in
  der von `m` beschriebenen Reihenfolge
- Zufällige Permutationen (feste Startwerte, keine Zufallsquelle im Test) über 256
  Slots, jeweils mit Invariantenprüfung
- Nicht-druckbare Zeichen im Namen werden abgewiesen
- SysEx-Datei: Verwaltungsfunktionen verweigern die Arbeit statt zu raten

Alle bestehenden Tests müssen weiterhin durchlaufen (`npm test`).

## Offen

**Der Branch.** `feat/unified-sample-manager` oder frisch von `main`.

## Nicht in diesem Spec

**SysEx.** Anderes Layout (6.750 statt 4.806 Bytes Schrittweite), laut
`EMX_SMARTCARD_FORMAT.md:187` sind die Feld-Offsets nicht übertragbar, es gibt keinen
einzigen SysEx-Dump zum Gegenprüfen, und der Weg aufs Gerät führt über MIDI mit rund
neun Minuten je Richtung. `sysexPack7bit` / `sysexUnpack7bit` (`src/emx-format.js:191`,
`:225`) bleiben für eine spätere MIDI-Live-Bridge verwendbar — dort allerdings für
Parameter-Change-Nachrichten, nicht für Bulk-Dumps.

**Song-Repointing.** Ziel bleibt, Songreferenzen beim Verschieben mitzuziehen.

Dafür muss die **Struktur** des Songbereichs verstanden werden, nicht seine Bedeutung:
Anzahl der Songs, Anfang und Schrittweite je Song, Lage und Schrittweite der einzelnen
Songschritte. Was ein Song musikalisch tut — Mute-Zustände, Motion, Effektbelegung —
ist dafür gleichgültig und bleibt Preserve-and-Patch.

Der Grund für diese Mindesttiefe: eine einzelne gefundene Referenzstelle genügt **nicht**.
Wer neun von zehn Referenzen umschreibt, erzeugt einen halb richtigen Song — und das ist
schlechter, als ihn unangetastet zu lassen, weil der Fehler unbemerkt bleibt statt
sichtbar zu sein. Referenzstellen müssen **vollständig aufzählbar** sein, und das setzt
die Struktur voraus.

Verfahren im Anhang. Läuft parallel, weil es Hardware-Zeit kostet und keine
Programmierzeit.

**Backups und Versionierung.** Eigene Session. Entwurfsstand: zwei Orte — ein
automatischer, rollierender „Quick"-Ort als Rückgängig-Taste und ein selbst gewählter
Langzeitort ohne Löschen. Dateiweise Stände, alle drei Geräte, git als Kandidat für
den Mechanismus (ESX-Dateien sind zu über 99 % unveränderliches PCM, wofür
Delta-Kompression in Packfiles gut geeignet ist). Voraussetzung ist ein
Einstellungsspeicher im Main-Prozess, den es noch nicht gibt: `main.js` persistiert
nichts, `localStorage` im Renderer hält nur UI-Kleinkram (`src/index.html:2795`).

**Überschreiben der Originaldatei.** Kommt, wenn die Backups stehen.

## Anhang: Dump-Verfahren für die Song-Referenzen

Nach dem Muster von `ESX_PATTERN_MAPPING_TESTING.md`, an eigener Hardware.

Werkzeug fehlt noch: `esx-pattern-diff.js` parst ESX-Patterns und taugt hier nicht.
Gebraucht wird ein reiner Byte-Differ mit Grundrausch-Ignoreliste.

**Grundrauschen (einmalig).** Karte zweimal speichern, ohne etwas zu ändern →
`BASE1.EMX`, `BASE2.EMX`. Die Differenz ist die Ignoreliste. Ohne diesen Schritt
ertrinkt jeder Vergleich im Lärm der Bytes, die sich bei jedem Schreiben ohnehin ändern.

**Messreihe.** Immer nur eine Sache je Dump ändern:

| # | Änderung | erwartete Erkenntnis |
|---|---|---|
| 1 | Karte ohne Songs → ein Song mit einem Schritt auf `A01` | wo ein Song beginnt, wie ein Ein-Schritt-Song aussieht |
| 2 | derselbe Schritt `A01` → `A02` | **das Byte, das sich um exakt 1 ändert, ist die Slotreferenz** |
| 3 | `A01` → `A03`, dann `A01` → `B01` | durchgezählt 0–255 oder Bank und Nummer getrennt |
| 4 | Song auf zwei, dann auf vier Schritte verlängern | Schrittweite zwischen Einträgen, Längenfeld |
| 5 | zweiter Song auf Platz 2, dann auf Platz 8 | Schrittweite zwischen Songs, Anzahl der Songplätze |

Rund zwölf Dumps. Messung 2 findet die Kodierung, aber **4 und 5 sind Pflicht, nicht
Kür** — erst sie erlauben es, alle Referenzstellen aufzuzählen statt sie zu suchen.
Ohne sie weiß man nicht, ob man alle gefunden hat.

Abschlussprüfung vor dem Repointing: aus der ermittelten Struktur die Referenzstellen
einer echten Karte aufzählen und gegen die dort tatsächlich vorhandenen Songs
gegenprüfen. Ergibt eine Referenz einen Slot, den es nicht gibt, oder fehlt eine
erwartete Stelle, ist die Struktur noch nicht richtig.

**Was nicht als Referenz taugt:** Dateien, die durch dieses Werkzeug gelaufen sind.
Sie prüfen den Parser gegen die Annahmen des eigenen Writers und bestätigen jeden
gemeinsamen Fehler, statt ihn zu finden.
