# Context

Glossary for NBG-GESCHRUBBE (Korg Manager). Terms only — no implementation
details, no specs. When a word here conflicts with how the code or a
conversation uses it, this file wins or the file gets corrected.

## Card

A saved image of an Electribe's memory. The EMX-1 writes one to a SmartMedia
card; a card always holds the full set of Slots, never a subset.

Distinct from a **Dump**, which is the same content transferred over MIDI
instead of written to a card. The two are different encodings of the same
musical material and are not interchangeable byte-for-byte.

## Slot

One of the 256 numbered positions on a Card, named `A01` through `P16`.

A Slot always exists. It is never absent, only empty. Deleting a Pattern
therefore does not remove a Slot — it changes what the Slot holds.

## Pattern

The musical content occupying a Slot: name, tempo, parts, steps, motion
sequences.

A Pattern is **position-independent** — it carries no record of which Slot it
sits in, so the same Pattern is unchanged by being placed anywhere else.

## Empty Slot

A Slot holding no musical material the user cares about.

Emptiness is a matter of **content, not absence** — an empty Slot still holds a
full Pattern. The hardware's own empty Pattern is a real artifact recoverable
from a factory Card, not something to be invented; a Slot emptied by this
project holds that Pattern with a blank name, which is how a Card saved by the
hardware itself represents an unused Slot.

A blank name alone does not make a Slot empty: real Cards contain Slots with
blank names whose Patterns still hold playable material.

## Slot Mapping

A complete statement of which source Slot's Pattern ends up in each
destination Slot, for all 256 Slots at once.

Every rearrangement of a Card is expressed as exactly one Slot Mapping.
Swapping, moving and deleting are not separate operations on the Card; they
are different Slot Mappings.

## Move

Placing a Pattern at a destination Slot such that the Patterns between origin
and destination each shift by one position to make room. Nothing is
overwritten.

Contrast **Swap**, where two Slots exchange Patterns and no other Slot is
touched.

## Rename

Changing a Pattern's name. A Rename never changes which Slot the Pattern
occupies, and is therefore the one edit that is not a Slot Mapping.

## Song

A stored arrangement that plays Patterns in sequence by referring to Slots
**by number**, not by content.

A Song therefore follows the position, not the Pattern: if a Pattern moves to
a different Slot, every Song that referenced it now plays whatever took its
place.
