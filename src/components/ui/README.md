# ui

## Purpose

Primitives that qkit keeps locally. The shared set (`Badge`, `Button`, `Card`,
`Checkbox`, `Dialog`, `Input`, `Label`, `Select`, `Switch`, `Tabs`, `Textarea`,
`Tooltip` and `cn`) comes from `@merqo/ui/primitives` and is imported from
there, not from this folder. The files below stay local because
`@merqo/ui/primitives` does not export them yet.

## Contents

- `alert-dialog.tsx` — `AlertDialog*` family (Radix `AlertDialog` wrapped),
  used by `OrderCard`'s cancel-order confirmation.
- `dropdown-menu.tsx` — `DropdownMenu*` family (Radix wrapped).
- `input-group.tsx` — `InputGroup`/`InputGroupAddon`/`InputGroupButton`/
  `InputGroupText`/`InputGroupInput`/`InputGroupTextarea`: a bordered wrapper
  giving `Input`/`Textarea` a fixed leading/trailing addon (icon, text, or
  button) inside the same field, instead of a separate element beside it.
  Nothing uses it at present: its one user, the booth form's PayNow mobile
  field, went when payment details moved to paykit.
- `popover.tsx` — `Popover`/`PopoverTrigger`/`PopoverContent`/`PopoverAnchor`,
  used by `stat-breakdown.tsx`'s hover/tap breakdown tile.
- `radio-group.tsx` — Radix `RadioGroup` wrapper with a filled-circle
  indicator.
- `sheet.tsx` — side-panel `Sheet*` family (Radix `Dialog` under the hood),
  used by `ItemCustomizer`.
- `toggle-group.tsx` — Radix `ToggleGroup` wrapper. Customized: adds a
  `spacing` prop (numeric gap between items, default 0 = fused/bordered
  segmented-control look) not present in stock shadcn, propagated through
  context to each `ToggleGroupItem`.
- `toggle.tsx` — `Toggle` (`cva` default/outline variants, default/sm/lg
  sizes) — the base `toggleVariants` `toggle-group.tsx` builds on.

## Connectivity

Everything under `src/components/` and `src/app/` composes these primitives and
the shared `@merqo/ui/primitives` set. `toggle.tsx` exports `toggleVariants`,
imported by `toggle-group.tsx`. `alert-dialog.tsx` takes `buttonVariants` and
`input-group.tsx` takes `Button`/`Input`/`Textarea` from
`@merqo/ui/primitives`.

## Parent

[components](../README.md)
