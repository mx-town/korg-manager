# Backups und Versionierung

**Datum:** 2026-08-13
**Stand (2026-08-18):** **Ungebaut.** Der aktuellste Spec des Bestands und der einzige,
dessen Mechanismus-Entscheidung als ADR vorliegt
(`docs/adr/0001-keine-versionsverwaltung-fuer-backups.md`). Weder `src/settings.js` noch
`src/backup-store.js` existieren; der Main-Prozess persistiert weiterhin nichts außer
`.tags.json`. Kein Plan vorhanden.
**Branch:** ausgegrillt auf `feat/emx-slot-mapping`, das inzwischen in `main`
gemergt ist (`ef8ba94`). Zeilennummern in diesem Spec beziehen sich auf `main`
nach dem Merge.
**Betroffen:** `main.js`, `preload.js`, `src/index.html`, neu `src/backup-store.js`,
neu `src/settings.js`
**Glossar:** `CONTEXT.md`
**Vorgeschichte:** ausgelagert aus
`docs/superpowers/specs/2026-08-12-emx-slot-mapping-design.md:287`
**Entscheidung zum Mechanismus:** `docs/adr/0001-keine-versionsverwaltung-fuer-backups.md`

## Problem

Die App schreibt heute ohne Netz über Dateien, die Stunden Handarbeit tragen.

`save-esx-overwrite` (`main.js:356`) schreibt direkt auf den geöffneten Pfad und
ersetzt danach die einzige Kopie des Vorzustands, die es im Prozess gab:

```js
await fsp.writeFile(filePath, safeBuf);
esxOriginalBuffer = Buffer.from(safeBuf);            // main.js:377
openFiles[activeFileIdx].esxOriginalBuffer = esxOriginalBuffer;
```

`e2s:save-file` (`main.js:1259`) und `file:save` (`main.js:1629`) gehen zwar über
`dialog.showSaveDialog`, aber mit `defaultPath` auf die Quelldatei — Überschreiben
ist auch dort der Normalfall, nur mit einer Bestätigung mehr.

Drei Dinge gehen dabei verloren, und keines davon ist hypothetisch:

1. **Reue.** Eine Änderung, die sich erst nach dem Speichern als falsch herausstellt.
   Der Rückgängig-Stapel in `currentSamples` ist prozesslokal und beim nächsten Start weg.
2. **Writer-Fehler.** `E2S LOAD ALL "File Error"` und die ESLI-Pflichtfelder waren
   echte Datenverluste durch einen fehlerhaften Writer. Beim EMX-Writer, den
   `2026-08-12-emx-slot-mapping-design.md` beschreibt, ist die Datei die einzige
   Kopie einer Karte, die eventuell nicht mehr existiert.
3. **Historie.** Kein Weg zu sehen, wie eine Bank vor zwei Wochen aussah.

Voraussetzung fehlt ebenfalls: der Main-Prozess persistiert nichts. Einziger
Schreibvorgang außerhalb eines Dialogs ist die Sidecar-Datei
`filePath + '.tags.json'` (`main.js:551–568`); `localStorage` im Renderer hält nur
UI-Kleinkram (`src/index.html:2795`).

## Ground Truth

Gemessen an echten Dateien: `test-data/e2s/hacktribe.e2sSample.all` (16,33 MB),
`/home/mel2497/DEV/X.ESX` (25,31 MB), `test-data/emx/BEST.EMX` (1,66 MB).

**gzip genügt, und Stufe 1 genügt.**

| Gerät | roh | gzip L1 | gzip L6 | Zeit L1 |
|---|---|---|---|---|
| ESX | 25,31 MB | 16,14 MB | 16,06 MB | 233 ms |
| E2S | 16,33 MB | 10,35 MB | 10,12 MB | 161 ms |
| EMX | 1,66 MB | 0,22 MB | 0,18 MB | 3 ms |

L6 bringt unter 2 % und kostet 40–50 % mehr Zeit. SHA-256 über 25,3 MB: **6 ms** —
die Prüfsumme für die Rückverknüpfung ist gratis.

**Blockweise Deduplizierung hält nur, solange keine Sample-Länge sich ändert.**
Zwei Stände derselben Datei, 4-KB-Blöcke:

| Änderung | neue Daten |
|---|---|
| 256 Byte Metadaten (Name, Kategorie) | 0,02 % |
| Sample gelöscht, PCM dahinter um 513 B verrutscht | **62,1 %** |
| Versatz zufällig = Blockgröße | 0,0 % |

Der zweite Fall ist genau das, was `rebuildEsxFile()` beim Löschen oder Ersetzen
eines Samples tut. Dedup ist also kein verlässlicher Gewinn, sondern einer, der von
der Art der Änderung abhängt. (Dass 62 % und nicht 100 % neu sind, liegt an
wiederholten Stille-Blöcken im PCM, nicht an gelungener Deduplizierung.)

**git löst das Problem nicht.** Dieselbe 16-MB-Datei, zwei Stände:

| Weg | nach Stand 1 | nach Stand 2 | nach `gc --aggressive` |
|---|---|---|---|
| System-git | 10,9 MB | 21,9 MB | 10,6 MB |
| `isomorphic-git` | 10,1 MB | 20,2 MB | **nicht möglich** |

Das Delta-Argument aus dem Vorgänger-Entwurf setzt Packfiles voraus, und Packfiles
entstehen erst durch `gc`/`repack`. `isomorphic-git` exportiert nur `indexPack` und
`packObjects` — kein `gc`, kein `repack`, kein `prune`. Es bleibt bei losen Objekten
und liegt damit **über** der simplen gzip-Kopie, bei ~1 s pro Commit und 4,8 MB
Abhängigkeit. Ein System-git ist auf den Ziel-Windows-Rechnern nicht vorauszusetzen.

**Die Tab-Leiste taugt nicht als Ort für Wiederherstellung.** `MAX_OPEN_FILES = 2`
(`main.js:1422`, „the split view has exactly two panes"), und `bankModel.detectDevice`
(`main.js:1480`) kennt nur `esx` und `e2s` — **EMX läuft komplett an diesem Modell
vorbei** (`emx:open-file`, `main.js:2063`). Öffnen geht ausschließlich über den
Dialog; einen Handler „Datei von diesem Pfad öffnen" gibt es nicht.

**EMX schreibt nur auf neue Pfade.** Seit dem Slot-Mapping-Merge exportiert
`src/emx-format.js` sehr wohl Schreibfunktionen (`applySlotMapping`,
`renamePattern`, `emptyPatternBlock`), und `main.js:2180` schreibt eine Karte
heraus — aber der Handler **verweigert ausdrücklich** den Quellpfad:

```js
if (emxFilePath && path.resolve(result.filePath) === path.resolve(emxFilePath)) {
  return { error: 'Overwriting the card this file came from is not supported yet. …' };
}                                                                   // main.js:2175
```

Ein Auslöser, der am Schreiben auf einen **vorhandenen** Pfad hängt, feuert für
`.emx` also weiterhin nie. Genau diese Sperre ist das, was die Backups aufheben
sollen. `emx:open-file` reicht die Bytes bereits an `rememberEmxCard(buffer,
filePath)` weiter (`main.js:2074`) — der Aufhängepunkt beim Öffnen existiert schon.

## Modell

Ein **Stand** ist eine vollständige, gzip-komprimierte Kopie einer Datei zu einem
Zeitpunkt. Stände einer Datei bilden eine **Kette**, keinen Baum: es gibt keine
Verzweigungen und keine Zusammenführungen.

Die Kette ist lückenlos, ohne dass dafür etwas Zusätzliches gespeichert wird: die
Vorher-Kopie von Speichervorgang *N* **ist** das Ergebnis von *N−1*, und der neueste
Zustand ist die lebende Datei selbst. Sichern vor dem Schreiben liefert die Historie
also gratis mit; der Knopf von Hand schließt nur das offene Ende der Kette.

Der **Backup-Speicher** ist inhaltsblind. Er kennt Dateien, Bytes und Prüfsummen —
keine Slots, Patterns oder Samples. `Card`, `Slot` und `Pattern` aus `CONTEXT.md`
kommen in ihm nicht vor und werden von ihm nicht berührt.

Der **Urzustand** ist der eine geschützte Stand pro Datei: der letzte Zustand, der
nachweislich nicht von diesem Werkzeug stammt. Genau einer pro Datei — dadurch kann
das Budget nie mit geschützten Einträgen zulaufen.

## Entscheidungen

**Zweck sind alle drei Dinge, begrenzt durch Platz statt durch Auswahl.** Reue,
Writer-Versicherung und Historie fallen aus demselben Mechanismus, sobald vor dem
Schreiben kopiert wird. Es gibt keinen Grund, eines davon wegzulassen.

**Ein Stand ist eine volle gzip-Kopie, Stufe 1, plus ein Eintrag im Index.** Keine
neue Abhängigkeit — `zlib` ist in Node. Ein beschädigter Stand kostet genau diesen
einen Stand. Begründung und verworfene Alternativen: `docs/adr/0001-…`.

**Ausgelöst wird vor jedem Schreiben auf einen Pfad, der bereits existiert.** Kopiert
werden die **Bytes von der Platte**, nicht `esxOriginalBuffer` — der ist nach
`main.js:377` bereits der neue Zustand und als Quelle wertlos.

**Für Dateien, die nie auf ihren eigenen Pfad geschrieben werden, entsteht der Stand
beim Öffnen.** Das betrifft heute `.emx`: der Handler verweigert den Quellpfad
(`main.js:2175`), der Schreib-Auslöser feuert also nie, und die Karte ist genau das
Material, das man nicht ersetzen kann. Der beim Öffnen erfasste Stand ist sofort der
Urzustand, weil er per Definition nicht von diesem Werkzeug stammen kann. Kosten:
0,22 MB und 3 ms.

Für ESX und E2S bleibt es beim Schreib-Auslöser. Ein Stand beim Öffnen würde dort
16 MB und 233 ms pro erstmalig geöffneter Datei kosten und beim bloßen Durchsehen
vieler Bänke geschützte Einträge anhäufen — der Fehler, den die Ein-Urzustand-Regel
gerade vermeidet.

**Dazu ein Knopf von Hand.** „Diesen Stand festhalten" sichert den aktuellen Zustand
ohne Speichervorgang und schließt damit das Ende der Kette.

**Genau ein Backup-Ordner, frei wählbar.** Standard ist der App-Ordner. Kein zweiter,
„schneller" Ort — die Grillrunde hat keine Frage gefunden, die zwei Orte beantworten
und einer nicht.

**Grenze 5 GB, einstellbar; ist sie erreicht, fällt der älteste ungeschützte Stand.**
Angezeigt wird immer belegter Platz **und** Anzahl, damit die Zahl nicht abstrakt bleibt.

| Grenze | ESX-Stände | E2S-Stände | EMX-Stände |
|---|---|---|---|
| 2 GB | ~124 | ~197 | ~9.000 |
| 5 GB | ~310 | ~493 | ~23.000 |
| 10 GB | ~620 | ~986 | ~46.000 |

**Genau ein geschützter Stand pro Datei, und er ist verschiebbar.** Der Knopf
„dieser Stand läuft auf dem Gerät" befördert den gewählten Stand zum Urzustand und
gibt den alten frei. Ohne diesen Weg wäre Schutz eine Einbahnstraße, die das Budget
mit der Zeit ausschließlich mit Geschütztem füllt.

**Stände hängen am Pfad, mit Rückverknüpfung über die Prüfsumme.** Zu jedem
geschriebenen *Ergebnis* wird dessen SHA-256 vermerkt. Taucht später eine Datei mit
genau dieser Prüfsumme unter anderem Pfad auf, erbt sie die Historie. Reines
Inhaltsvergleichen genügt dafür nicht: gespeichert sind Vorher-Zustände, und die
umbenannte Datei ist ein Nachher-Zustand. Nicht auflösbare Waisen werden beim
Erreichen der Grenze zur Freigabe angeboten, nicht stillschweigend ewig behalten.

**Wiederherstellen schreibt zurück an den Pfad.** Weil das selbst ein Schreiben auf
einen vorhandenen Pfad ist, greift der Auslöser automatisch — **die Wiederherstellung
ist damit selbst rückgängig zu machen**. Ist die Datei offen, wird der Tab neu
geladen; bei ungesicherten Änderungen wird vorher gefragt. Die Alternative „in einen
Tab laden" scheitert an `MAX_OPEN_FILES = 2` und daran, dass EMX im Tab-Modell nicht
vorkommt.

**Scheitert die Sicherung, wird nicht geschrieben.** Kein Schreiben ohne Netz. Die
Zieldatei bleibt unangetastet, die Arbeit bleibt im Speicher, angeboten werden
„Ort ändern", „Speichern unter…" und „Abbrechen". Eine Regel, kein stiller Sonderfall.

**E2S bekommt ein direktes SPEICHERN.** Gleichstand mit ESX, abgesichert durch die
Vorher-Kopie; „Speichern unter…" bleibt daneben bestehen.

**Die EMX-Sperre bei `main.js:2175` darf fallen — aber nicht in diesem Spec.** Sobald
die Vorher-Kopie steht, ist der Grund für die Verweigerung weg und
`2026-08-12-emx-slot-mapping-design.md:295` („Überschreiben der Originaldatei. Kommt,
wenn die Backups stehen.") eingelöst. Es bleibt trotzdem ein eigener Schritt, weil
dann auch der Auslöser für `.emx` von „beim Öffnen" auf „vor dem Schreiben"
umschwenkt und der beim Öffnen erfasste Urzustand befördert werden muss statt neu
zu entstehen.

## Änderungen

### 1. Neu: `src/settings.js` — Einstellungsspeicher

Der Main-Prozess persistiert bisher nichts. Kleinster tragfähiger Speicher:
`settings.json` neben der App, gelesen beim Start, geschrieben **atomar**
(`.tmp` schreiben, dann `fsp.rename`) — ein abgebrochener Schreibvorgang darf die
Einstellungen nicht zerstören.

```
{ "backupDir": "…", "backupLimitBytes": 5368709120 }
```

Fehlende oder kaputte Datei ⇒ Standardwerte, keine Ausnahme nach oben. Der
Einstellungsspeicher ist bewusst allgemein gehalten; er ist die Voraussetzung, nicht
Teil des Backup-Speichers.

### 2. Neu: `src/backup-store.js` — reine Logik, testbar ohne Electron

Ordnerbild:

```
<backupDir>/
  index.json
  states/
    a7f3…-20260813-0912.gz
    b2c1…-20260813-1044.gz
```

`index.json`:

```
{
  "version": 1,
  "files": {
    "<pfad>": {
      "states": [
        { "id": "…", "at": "2026-08-13T09:12:00Z",
          "bytes": 16924672, "gzBytes": 16920576,
          "sha256": "…",            // Prüfsumme DIESES Standes
          "protected": true }
      ],
      "lastWrittenSha256": "…"      // Ergebnis des letzten Schreibens → Rückverknüpfung
    }
  }
}
```

Funktionen: `capture(filePath, reason)`, `list(filePath)`, `restore(stateId)`,
`promote(stateId)`, `enforceLimit()`, `relink(filePath, sha256)`.
`index.json` wird ebenfalls atomar geschrieben.

### 3. `main.js` — Auslöser einhängen

Vor jedem der Schreibvorgänge bei 373, 401, 416, 1266, 1354, 1642, 1891, 1940, 1959
und 2180: existiert das Ziel, `capture()` — schlägt es fehl, mit Fehler zurückkehren
**ohne zu schreiben**. Nach jedem erfolgreichen Schreiben `lastWrittenSha256` setzen.
Bei 416 (WAV-Export eines einzelnen Samples), 1354 und 1959 ist das Ziel praktisch
immer neu; die Regel bleibt trotzdem dieselbe, damit es keinen Sonderfall gibt.
`emx:open-file` (`main.js:2063`) erfasst zusätzlich beim Öffnen, direkt geschützt.
Die Sidecar-Datei `.tags.json` (`main.js:557`) bleibt außen vor — sie ist
wiederherstellbares Beiwerk, keine Arbeit.

### 4. `preload.js` — Bridge

`backup.list`, `backup.restore`, `backup.mark`, `backup.promote`, `backup.usage`,
`backup.chooseDir`, `backup.setLimit`.

### 5. `src/index.html` — Oberfläche

Ein Bereich „Stände" zur aktiven Datei: Liste mit Zeitpunkt und Größe, Urzustand mit
Schloss markiert, je Zeile „Zurückholen", darunter „diesen Stand festhalten",
„dieser Stand läuft auf dem Gerät", sowie Belegung („2,1 GB von 5 GB · 174 Stände")
mit Zugang zu Ort und Grenze. Bei E2S zusätzlich der neue SPEICHERN-Knopf neben
„Speichern unter…".

## Invariante

**Nach jedem Schreibvorgang auf einen vorhandenen Pfad existiert ein Stand mit dem
Inhalt, den die Datei unmittelbar davor hatte — oder es wurde nicht geschrieben.**

## Tests

- `capture` → `restore` liefert Byte-für-Byte dieselbe Datei, für alle drei Formate.
- Fehlgeschlagene `capture` (Ordner nicht schreibbar) lässt die Zieldatei unverändert.
- Grenze erreicht: ältester ungeschützter Stand fällt, geschützter überlebt.
- `promote` verschiebt den Schutz und lässt nie zwei geschützte pro Datei zurück.
- Umbenannte Datei findet über `lastWrittenSha256` ihre Historie wieder.
- Kaputtes `index.json` ⇒ Standardzustand statt Ausnahme; kaputter `.gz`-Stand wird
  als unlesbar markiert, ohne die übrigen zu entwerten.
- Atomares Schreiben: abgebrochener Schreibvorgang lässt weder `index.json` noch
  `settings.json` in Trümmern.
- `.emx` öffnen erzeugt genau einen geschützten Stand, zweimal öffnen keinen zweiten.

## Offen

- Ob der Backup-Ordner beim ersten Start aktiv erfragt oder still angelegt wird.
- Ob Belegung dauerhaft sichtbar ist oder erst ab einem Schwellwert auffällt.

## Nicht in diesem Spec

- **Verzweigungen.** Stände sind eine Kette. Kein Baum, keine Zusammenführung.
- **Vergleich zweier Stände.** Wäre inhaltsabhängig und bräche die Inhaltsblindheit.
- **Stände über mehrere Rechner.** Ein lokaler Ordner, kein Abgleich.
- **Automatisches Sichern ohne Speichervorgang.** Kein Zeitgeber, kein Beobachter.
- **Blockweise Deduplizierung.** Später umstellbar, ohne dass sich am Modell etwas
  ändert — die Liste der Stände bleibt dieselbe. Erst dann sinnvoll, wenn Messungen
  zeigen, dass in der Praxis überwiegend Metadaten geändert werden.
- **EMX-Überschreiben.** Der Writer ist da, die Sperre bei `main.js:2175` fällt in
  einem eigenen Schritt, nicht hier.
