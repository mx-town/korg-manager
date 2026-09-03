# Der Firmware-Modus wird erklärt, nicht erkannt

Ob eine `.e2sSample.all` von einer Stock- oder einer Hacktribe-E2S stammt, entscheidet
in dieser App **der Mensch**. Die Datei liefert höchstens einen Vorschlag. Grund: es
gibt nichts zu erkennen — **kein Byte in einer `.e2sSample.all` identifiziert die
Firmware, die sie geschrieben hat.** Keine Primärquelle (Oe2sSLE, Hacktribes Code,
Wiki oder Maintainer) dokumentiert einen solchen Marker, und der einzige Kandidat,
den dieses Projekt je hatte — das Feld 0x4E im ESLI-Block — hat sich als
Bau-Rückstand herausgestellt, nicht als Konvention einer Karte
(`E2S_FORMAT.md`, Abschnitt *0x4E is build residue*).

Die Erkennung, die heute im Code steht, ist eine Belegungs-Heuristik:
`detectHacktribe()` in `src/bank.js:76` liest „irgendein belegter Slot unter Index 500
⇒ Stock, sonst Hacktribe", `src/file-tabs.js:118` und `main.js:1291` wiederholen
dieselbe Regel. Sie liegt falsch für eine Stock-Karte, deren Nutzersamples zufällig
alle ab #501 sitzen, und für eine Hacktribe-Karte mit einem alten Eintrag unter #501.
Der Schaden ist klein — die Basis setzt nur den Boden der Slot-Vergabe, neue Samples
hängen sich ohnehin hinter den höchsten belegten Slot — aber der `HACKTRIBE`/`STOCK`-Chip
auf dem Datei-Tab (`src/index.html:3016`) präsentiert das Ergebnis, als wäre es gemessen.

## Konsequenzen

**Die Heuristik bleibt, ihre Rolle ändert sich.** Sie darf einen Vorschlag setzen, aber
nichts behaupten. Der Chip muss als *Voreinstellung* lesbar sein, die bestätigt wird —
nicht als Feststellung. Der Umschalter dafür existiert bereits
(`file:set-hacktribe`, `src/index.html:3095`); gebaut werden muss nur die Ehrlichkeit.

**Der Modus gehört an den Zielpfad, nicht an die Quelle.** Entschieden wird er beim
*Schreiben*: der reale Schaden ist ein Sample, das auf der Karte unsichtbar bleibt, auf
die geschrieben wurde. Der Quellpfad darf den Tab nur vorbelegen.

**Die Erklärung ist pro Karte und muss überdauern.** Einmal beantwortet, nicht einmal
pro Sitzung — sonst ist der Button eine Zumutung. Das setzt einen Settings-Store
voraus, den `main.js` heute nicht hat (persistiert wird nichts außer der
`.tags.json`-Sidecar-Datei). Offen und dorthin verschoben: **woran** der Store eine
Karte wiedererkennt (Issue #7). Bis der Store steht, gilt die Erklärung nur für die
Sitzung.

**`deriveEsliNumbering` ist davon nicht berührt.** Dass ein frisches Sample die
0x14/0x4E-Konvention der Datei übernimmt, der es beitritt, statt einer festverdrahteten
Konstante, bleibt richtig — nur die Begründung dafür hat gewechselt. Beide Kodierungen
sind gerätebestätigt.

## Verworfene Alternativen

**Inhaltsbasierte Erkennung verbessern.** War der ursprüngliche Auftrag (Wayfinder-Map
`#3`, sieben Tickets). Zwei Research-Tickets haben ihn erledigt, indem sie die Prämisse
widerlegten: `#5` fand keine Quelle, die irgendeinen Marker dokumentiert, `#6` erklärte
den letzten verbliebenen Kandidaten weg. Eine bessere Heuristik bleibt eine Heuristik.

**Den Nutzer bei jedem Öffnen fragen.** Ein Dialog vor jeder Datei ist teurer als ein
falscher Vorschlag, den ein Klick korrigiert — zumal die Folgen eines Fehlgriffs klein
und reversibel sind.

## Restunsicherheit

Der Byte-Vergleich zweier echter Karten wurde nie durchgeführt (Issue `#4` bleibt
dafür offen). Die Schlussfolgerung stützt sich auf das Verhalten der
Referenzimplementierung plus die exakte Übereinstimmung der Werksindex-Spanne in
einem Dump. Ein echter Hacktribe-Dump, dessen 0x4E etwas enthält, das kein Werkzeug
so geschrieben hätte, würde sie kippen — und nur sie, nicht die Entscheidung oben:
selbst ein gefundener Marker macht die Erklärung durch den Menschen nicht falsch,
nur den Vorschlag besser.
