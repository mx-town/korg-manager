# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. It is authoritative: "when a word here
  conflicts with how the code or a conversation uses it, this file wins or the file gets corrected."
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **single-context**:

```
/
├── CONTEXT.md                      ← glossary: Card, Slot, Pattern, Slot Mapping,
│                                     Move, Rename, Song, State, Original State,
│                                     Backup Store
├── docs/adr/
│   ├── 0001-keine-versionsverwaltung-fuer-backups.md
│   └── 0002-dateien-als-tabs-statt-zweier-baenke.md
├── docs/superpowers/specs/         ← design specs, each with a `**Stand (date):**`
│                                     header saying whether it was built
└── src/
```

ADRs and specs in this repo are written in **German**; `CONTEXT.md` and the format
specs are in English. Match the language of the file you are editing.

## Read the format specs before touching a parser

The binary formats are the hard domain knowledge here, and they were reverse-engineered
from real hardware dumps. Before changing anything under `src/*-format.js`, read the
spec for that device — they are as binding as an ADR:

- `ESX_FILE_STRUCTURE.md` — ESX-1, every byte mapped
- `E2S_FORMAT.md` — E2S offset table and the ESLI metadata block
- `EMX_SMARTCARD_FORMAT.md` — EMX-1 SmartCard layout

Each records claims that were **refuted** as well as confirmed. A refuted claim is a
finding, not dead text — do not re-derive it, and do not restore it.

## Hardware claims need hardware evidence

A statement about what the devices do is only settled once it has been checked against
a real ESX-1, EMX-1 or E2S, or against a dump one of them wrote. `HARDWARE_TEST_CHECKLIST.md`
is where those checks are recorded. Until then, say so in the output — "unverified" is a
valid state and this project uses it deliberately (see `CONTEXT.md`, section *Slot*).

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (backups are full gzip copies, not git) — but worth reopening because…_

ADR-0001 in particular was settled by **measurement**, not argument. Reopening it means
bringing new numbers, not a new opinion.
