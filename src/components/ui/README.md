# ui

## Purpose

Nothing is kept locally any more. Every primitive qkit uses, including
`AlertDialog*`, `DropdownMenu*`, `Popover`, `Sheet*`, `Toggle` and
`ToggleGroup`, comes from `@merqo/ui/primitives` and is imported from there.
Add a primitive to `@merqo/ui` rather than copying it here;
`merqoNoLocalCopies` flags local copies.

## Contents

No source files. The shared toggles and the sheet close button grow to 44px
under a coarse pointer, so layouts that hold them must tolerate that height
(the 0 to 10 score row in `feedback-form.tsx` wraps to two rows below `sm`
instead of shrinking them). The sheet scrim is black at 50% through a
`[data-slot="sheet-overlay"]` rule in `globals.css`.

## Connectivity

Everything under `src/components/` and `src/app/` imports its primitives from
`@merqo/ui/primitives`.

## Parent

[components](../README.md)
