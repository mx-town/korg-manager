# Backups sind volle gzip-Kopien, nicht git

Die Backup-Stände dieser App speichern jede Datei als vollständige gzip-Kopie plus
einen Eintrag in `index.json` — obwohl der Inhalt zu über 99 % unverändertes PCM ist
und git dafür wie gemacht wirkt. Gemessen an einer echten 16-MB-E2S-Datei hält das
Delta-Argument nicht: `isomorphic-git` kam nach zwei Ständen auf 20,2 MB gegenüber
10,4 MB für zwei gzip-Kopien, weil Delta-Kompression erst in Packfiles entsteht und
die Bibliothek weder `gc` noch `repack` noch `prune` exportiert — es bleibt bei losen
Objekten, bei ~1 s pro Stand und 4,8 MB Abhängigkeit. Ein System-git, das packen
könnte, ist auf den Ziel-Windows-Rechnern nicht vorauszusetzen.

## Verworfene Alternativen

**Blockweise Deduplizierung** (4-KB-Blöcke, inhaltsadressiert) ist glänzend, solange
sich nur Metadaten ändern (0,02 % neue Daten), und bricht auf 62,1 % ein, sobald eine
Sample-Länge sich ändert und das PCM dahinter verrutscht — genau das, was
`rebuildEsxFile()` beim Löschen oder Ersetzen eines Samples tut. Dazu käme ein eigener
Aufräumer beim Verdrängen und ein verlorener Block, der alle Stände beschädigt, die
ihn teilen. Später umstellbar, ohne dass sich am Modell etwas ändert.

## Konsequenz

Ein Stand kostet vollen Platz: ESX 16,1 MB, E2S 10,4 MB, EMX 0,22 MB. Deshalb ist der
Speicher über eine Größengrenze mit Verdrängung begrenzt statt über die Zahl der
Stände. Dafür kostet ein beschädigter Stand genau diesen einen Stand, und der Speicher
kommt ohne Abhängigkeit aus — `zlib` steckt in Node.
