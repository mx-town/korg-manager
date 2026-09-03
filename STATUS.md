# Status

**Stand: 2026-09-02** · `main` · 455/455 Tests grün

Diese Datei beantwortet drei Fragen und sonst nichts: **Was steht? Was kommt als
Nächstes? Was ist am Gerät bewiesen?** Sie ist die einzige Stelle, an der der
Gesamtstand steht — `ROADMAP.md` sammelt Ideen, die Specs beschreiben Entwürfe,
die ADRs halten Entscheidungen fest. Hier steht, wo wir sind.

## Wie die Spalte „Am Gerät" zu lesen ist

Dieses Projekt schreibt Binärformate, die aus Hardware-Dumps rückentwickelt wurden.
Grüne Tests beweisen davon **nichts** — sie prüfen den Parser gegen die Annahmen des
eigenen Writers. Eine Aussage über das Verhalten der Geräte gilt erst als belegt, wenn
sie gegen eine echte ESX-1, EMX-1 oder E2S geprüft wurde.

| Zeichen | Bedeutung |
|---|---|
| **✓ Datum** | Auf echter Hardware bestätigt, mit Datum |
| **— nie** | Code fertig, nie an einem Gerät gewesen |
| **n/a** | Rein lesend, es wird nichts geschrieben |

„Unbelegt" ist ein gültiger Zustand und wird hier bewusst so benannt, statt
weggerundet zu werden. Protokoll: `HARDWARE_TEST_CHECKLIST.md`.

---

## 1 · Was steht

| Bereich | Am Gerät | Anmerkung |
|---|---|---|
| **ESX-1 Sample-Manager** — Lesen/Schreiben, 18 Effekte, Waveform, Batch, Undo/Redo | — nie | Teil 4 der Checkliste |
| **ESX-1 Export-Validierung** — `src/esx-validate.js`, Auto-Reparatur vor jedem Export | — nie | Spec bewusst abweichend umgesetzt |
| **ESX-1 Leerzustand** — hardware-korrekte neu gebaute Dateien | — nie | Init-Namen, Song-Padding, Keyboard-Slice-Byte |
| **ESX-1 variable Dateigröße** — `0x250010 + curOff` | — nie | behob stille Truncation über 26,5 MB |
| **ESX-1 MIDI-Globals-Editor** | — nie | Teil 4 C der Checkliste |
| **E2S Sample-Manager** — `.all` lesen/schreiben, 1020×4-Offsettabelle, ESLI preserve-and-patch | **✓ 2026-08-11** | LOAD ALL SAMPLES ohne *File Error* |
| **Sample-Manager mit Datei-Tabs** — max. 2 Dateien, Split-View, Drag & Drop mit Auto-Konvertierung | n/a | Electron-Smoketest + Hands-on |
| **ESX↔E2S-Konvertierung** — `src/bank.js`, 44,1↔48 kHz, Slot-Vergabe, Preflight | ✓ über E2S oben | reine Bibliothek, Electron-frei |
| **Pattern-Viewer** — ESX-1, EMX-1, E2, E2S; PARTS/STEPS/GRID; Audio nur ESX | n/a | rein lesend |
| **EMX-1 Pattern-Verwaltung** — verschieben/kopieren/löschen/tauschen/umbenennen über eine Slot-Zuordnung | **— nie** | ⚠ **größtes offenes Risiko**, Teil 3 |
| **UI-Politur** — Make It Shine, Viewer-Redesign, LCD-Kontrast | n/a | alle drei Specs „umgesetzt" |

**Die wichtigste Zeile ist die vorletzte.** Es gibt eine gebaute, getestete und
gemergte Schreibfunktion für EMX-1-Karten, und **noch nie hat eine von dieser App
geschriebene Karte in einem Gerät gesteckt.** Das ist die einzige Frage im Projekt,
die niemand am Rechner beantworten kann.

---

## 2 · Was als Nächstes kommt

Die Reihenfolge ist Absicht, nicht Zufall — jeder Punkt setzt den davor voraus oder
gewinnt durch ihn.

### 1. Settings-Store · `src/settings.js`

`main.js` persistiert heute **gar nichts** außer der `.tags.json`-Sidecar-Datei.
Das blockiert zwei fertig durchdachte Features gleichzeitig. Atomar geschriebene
`settings.json`, sonst nichts.

Offene Entwurfsfrage: [woran der Store eine Karte wiedererkennt](https://github.com/mx-town/korg-manager/issues/7) —
kein Blocker, der Store kann sitzungsweit starten.

### 2. Backups und Versionierung

Spec vollständig durchgegrillt (`docs/superpowers/specs/2026-08-13-backups-und-versionierung-design.md`),
Mechanik per Messung entschieden (`docs/adr/0001`: volle gzip-Kopien, **nicht** git).
Nichts mehr zu entscheiden — nur zu bauen, sobald 1 steht.

Zieht zwei Dinge hinter sich her: E2S bekommt ein dialogfreies SAVE, und das
Überschreiben von `.emx` an Ort und Stelle wird vertretbar.

### 3. Firmware-Chip ehrlich machen

Klein, hängt an 1. Der `HACKTRIBE`/`STOCK`-Chip (`src/index.html:3016`) zeigt eine
Rate-Heuristik an, als wäre sie gemessen. Er muss als *Voreinstellung* lesbar sein,
und die Erklärung muss die Sitzung überleben. Der Umschalter existiert bereits.
→ `docs/adr/0003-firmware-modus-wird-erklaert-nicht-erkannt.md`

### 4. EMX-1 und Pattern-Viewer als Ganzes

Der Hauptstrang. Enthält mindestens:

- **Hardware-Abnahme der Pattern-Verwaltung** (Teil 3) — muss vor allem anderen kommen
- **Song-Referenzen umbiegen** — braucht die Song-Block-Struktur aus Teil 2
- **E2/E2S-Patterns vollständig anzeigen**, wie EMX; Sample-Namen aus einer geladenen Bank
- **ESX-Pattern-Byte-Zuordnung verifizieren** — Werkzeug `esx-pattern-diff.js` steht, es fehlen die Dumps (Teil 5)

### 5. Nebengleis, eigener Branch: Sample-Manager + E2S ship-fertig

Läuft zu 90 %. Was zwischen „läuft" und „auslieferbar" liegt, ist noch nicht
aufgeschrieben — das ist der erste Schritt dieses Punkts, nicht das Bauen.
Bekannte Kandidaten stehen unten unter *Lücken*.

### Parallel, unabhängig vom Code

**Hardware-Messreihen.** Nichts davon braucht einen Entwickler, alles davon blockiert
etwas. Reihenfolge und Protokoll: `HARDWARE_TEST_CHECKLIST.md`.

---

## 3 · Was bewusst nicht kommt

| Verworfen | Warum | Wo festgehalten |
|---|---|---|
| Erkennung, ob eine Karte Hacktribe ist | Es gibt kein Byte, das die Firmware verrät — nichts zu erkennen | ADR-0003 |
| git als Backup-Mechanismus | Gemessen: 20,2 MB gegen 10,4 MB für zwei Stände; `isomorphic-git` packt nie | ADR-0001 |
| `bank:*`-IPC-Namensraum / Zwei-Bänke-Modell | Gebaut, driftete in App-weiten Umbau, verworfen | ADR-0002 |
| Project S in seiner alten Form | Regressionen; die App war vorher besser | `ROADMAP.md` |

ADR-0001 wurde durch **Messung** entschieden. Es wieder aufzumachen heißt, neue Zahlen
mitzubringen, nicht eine neue Meinung.

---

## 4 · Bekannte Lücken und Altlasten

| Was | Art | Wo |
|---|---|---|
| E2S verwirft Slots, die der Parser nicht lesen kann, statt die Rohbytes zu erhalten | Datenverlust | `ROADMAP.md` |
| `rebuildEsxFile` verliert Stereo-Flag und Slice-Daten, macht Namen zu Großbuchstaben | Datenverlust | `esx-export-format-findings` |
| Konvertierungs-Dialog (`convExecute`) ist ein Stub — zeigt nur *„feature in progress"*, und nichts ruft `openConversion()` auf | totes Gerüst, **keine** Regression | `src/index.html:5742` |
| `test-data/e2s/hacktribe.e2sSample.all` ist **falsch benannt** — enthält den Stock-Werkssatz um +500 verschoben | irreführende Testdatei | [#4](https://github.com/mx-town/korg-manager/issues/4) |
| Der Renderer kann nichts `require()`n — `emxMoveSlot` dupliziert `mappingMove`, Tests halten beide Seiten aneinander | strukturelle Schuld | `src/index.html` |
| Slot-Notation der EMX (16×16 oder 4×64) ist unbelegt, die Doku widerspricht sich | offene Faktenfrage | Checkliste Teil 2 |
| Kein LICENSE, Repo ist „Proprietary" | blockiert jede Mitarbeit von außen | `aleksandr-sever-collaboration` |

---

## 5 · Einwände aus der Historie

Kurzfassung dessen, was in Reviews zurückkam. Der Zweck ist nicht Buchhaltung, sondern
Wiederholungsvermeidung — die Regressionen dieses Projekts kamen **nie** aus falscher
Byte-Logik, sondern aus zu großem Umfang und aus Verifikationslücken.

| Wann | Einwand | Was daraus wurde |
|---|---|---|
| 2026-07-21 | „Commander"-UI mit fest zwei Panes abgelehnt | Tabs + Snap-Split |
| 2026-07-22 | Gehört **in** die bestehende ESX-Ansicht; **„Editor nicht anfassen"** | v2 ist rein additiv, `#modalBg` unverändert |
| 2026-07-22 | Beide Sampler **rot**; blau/cyan ist Synth und Waveform | mono-rot, Gerät nur über Beschriftung |
| 2026-07-23 | **„Die App war vorher besser"** → Revert | Project S geparkt, Arbeitsregel „additiv, ein winziger Spec" |
| 2026-07-28 | **Nie gegen Repo-`test-data` validieren** — die kann die eigenen Fehler enthalten | Referenzdateien kommen aus dem Web, Herkunft wird notiert |
| 2026-07-30 | „File Error immer noch da" — war eine Datei von *vor* dem Fix | Erst die Datei datieren, dann den Bug annehmen |
| laufend | Tests reichen nicht; Hands-on in der laufenden App gehört zu „fertig" | `ROADMAP.md`, Working Agreement |
| laufend | Große, umfassende Aufträge statt vieler kleiner Fixes | `CLAUDE.md` |

---

## 6 · Wie diese Datei gepflegt wird

Sie veraltet in dem Moment, in dem sie nicht mehr mitgeschrieben wird — und dann ist
sie schlimmer als keine, weil man ihr glaubt.

**Regel:** Wer ein Feature abschließt, einen Hardware-Test durchführt oder eine
Entscheidung trifft, ändert diese Datei **im selben Commit**. Nicht danach, nicht in
einem Aufräum-Commit.

Konkret, je nach Anlass:

| Anlass | Was sich hier ändert |
|---|---|
| Feature fertig | Zeile in **1**, Spalte „Am Gerät" auf `— nie` |
| Hardware-Test bestanden | `— nie` → `✓ JJJJ-MM-TT` |
| Hardware-Test **gescheitert** | Zeile bleibt `— nie`, Befund kommt nach **4** |
| Entscheidung getroffen | ADR anlegen, Zeile in **3** verlinken |
| Etwas verworfen | Zeile in **3**, mit Begründung |
| Lücke gefunden | Zeile in **4** — auch wenn sie nicht sofort behoben wird |
| Review-Einwand | Zeile in **5**, wenn er sich verallgemeinern lässt |

Und die Kopfzeile: Datum, Branch, Testzahl.

**Was hier nicht hingehört:** Details. Diese Datei ist ein Index. Jede Zeile zeigt auf
den Ort, an dem die Sache wirklich steht — Spec, ADR, Format-Doku, Issue. Steht etwas
nur hier, steht es an der falschen Stelle.
