# Der Sample-Manager führt Dateien als Tabs, nicht zwei Bänke

Der Unified Sample Manager hält geöffnete Dateien in `openFiles[]` und lässt die
Legacy-Globals `currentSamples` / `esxOriginalBuffer` immer auf den aktiven Eintrag
zeigen (`main.js:1422 ff.`, IPC-Namensraum `file:*`). Der Vorgängerentwurf
`docs/superpowers/specs/2026-07-17-unified-sample-manager-design.md` sah stattdessen
ein Feld `banks[2]` und einen eigenen IPC-Namensraum `bank:*` vor, in den **alle**
Handler — die 18 Effekte, Undo/Redo, Waveform, Preview, Speichern — hätten umziehen
müssen. Dieser Entwurf wurde gebaut, driftete in einen App-weiten Umbau mit
UI-Regressionen und wurde verworfen (`ROADMAP.md:8`). Die Fassung von 2026-07-23
gewann dieselbe Zwei-Datei-Fähigkeit, indem sie unter den vorhandenen Handlern
tauscht statt sie zu ersetzen.

## Konsequenzen

**`bank:*` existiert nicht und wird nicht kommen.** `src/bank.js` trägt den Namen
trotzdem — es ist eine reine, Electron-freie Bibliothek für Parsen, Konvertieren und
Serialisieren, kein IPC-Layer. Wer den Namen für einen Hinweis auf `bank:*` hält,
irrt; der Layer heißt `file:*` und ruft `bank.js` auf.

**Zwei Specs zeigen dadurch ins Leere.** `2026-07-21-sample-import-2.0-design.md`
(`bank:importSample`) und `2026-07-21-import-comfort-design.md` (`bank:importFiles`,
`bank:inspectImport`) nennen als Voraussetzung ausdrücklich Project S. Ihre fachlichen
Ziele bleiben gültig, ihr Architekturteil ist gegenstandslos und gegen `file:*` plus
den vorhandenen Import-Pfad (`import-samples`, `import-wav-files`, `import-zip`,
`e2s:import-wav`) neu zu schreiben.

**Der Preis ist Disziplin statt Struktur.** Weil die Globals geteilt bleiben, muss
jeder `file:*`-Handler zuerst `stashActive()` rufen, und jeder Legacy-Handler, der die
Globals neu zuweist, muss den aktiven Eintrag nachziehen. Das ist eine Regel, die der
Compiler nicht durchsetzt — sie war in v1 die Bruchstelle und ist im Spec von
2026-07-23 deshalb ausdrücklich festgeschrieben.

**Umkehrbar ist die Entscheidung nicht billig.** Jeder der 84 IPC-Handler, der heute
implizit auf der aktiven Datei arbeitet, bekäme in einem `bank:*`-Modell einen
Bank-Index als ersten Parameter — genau der Umbau, an dem der erste Anlauf scheiterte.
