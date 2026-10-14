# ui

## Purpose

shadcn/ui (new-york style) primitive components, wrapping Radix UI. CLI-managed
per `AGENTS.md` — regenerate via the shadcn CLI rather than hand-editing, except
where noted below.

## Contents

- `alert-dialog.tsx` — `AlertDialog*` family (Radix `AlertDialog` wrapped),
  used by `OrderCard`'s cancel-order confirmation.
- `button.tsx` — `Button`. Customized: extra `size` variants beyond stock
  shadcn (`"xs"`, `"icon-xs"`) alongside default/sm/lg/icon/icon-sm/icon-lg.
- `checkbox.tsx` — Radix `Checkbox` wrapper with a `CheckIcon` indicator.
- `dialog.tsx` — `Dialog*` family, used by `ZoomableImage` and elsewhere.
- `dropdown-menu.tsx` — `DropdownMenu*` family (Radix wrapped).
- `input.tsx` — standard text `Input`.
- `input-group.tsx` — `InputGroup`/`InputGroupAddon`/`InputGroupButton`/
  `InputGroupText`/`InputGroupInput`/`InputGroupTextarea`: a bordered wrapper
  giving `Input`/`Textarea` a fixed leading/trailing addon (icon, text, or
  button) inside the same field, instead of a separate element beside it.
  Nothing uses it at present: its one user, the booth form's PayNow mobile
  field, went when payment details moved to paykit.
- `label.tsx` — Radix `Label` wrapper.
- `popover.tsx` — `Popover`/`PopoverTrigger`/`PopoverContent`/`PopoverAnchor`,
  used by `stat-breakdown.tsx`'s hover/tap breakdown tile.
- `radio-group.tsx` — Radix `RadioGroup` wrapper with a filled-circle
  indicator.
- `select.tsx` — Radix `Select` family with `sm`/`default` trigger sizes.
- `sheet.tsx` — side-panel `Sheet*` family (Radix `Dialog` under the hood),
  used by `ItemCustomizer`.
- `switch.tsx` — Radix `Switch` wrapper. Customized: adds a `size` prop
  (`"sm" | "default"`, stock shadcn has one fixed size).
- `tabs.tsx` — `Tabs*` family; `TabsTrigger` customized with a 44px
  (`h-11`) touch target and an active-state primary tint, used by the Pro
  stats view's Sales/Items/Service tabs.
- `textarea.tsx` — standard `Textarea`.
- `toggle-group.tsx` — Radix `ToggleGroup` wrapper. Customized: adds a
  `spacing` prop (numeric gap between items, default 0 = fused/bordered
  segmented-control look) not present in stock shadcn, propagated through
  context to each `ToggleGroupItem`.
- `toggle.tsx` — `Toggle` (`cva` default/outline variants, default/sm/lg
  sizes) — the base `toggleVariants` `toggle-group.tsx` builds on.
- `tooltip.tsx` — Radix `Tooltip` family; `TooltipProvider` defaults
  `delayDuration` to `0` (stock shadcn defaults to Radix's own delay).

## Connectivity

Everything under `src/components/` and `src/app/` composes these primitives
directly (e.g. `Button`, `Select`, `ToggleGroup`, `Sheet`, `Popover` are used
throughout the dashboard, stats, and ordering flow). `toggle.tsx` exports
`toggleVariants`, imported by `toggle-group.tsx`; `button.tsx` exports
`buttonVariants`, imported by `alert-dialog.tsx` for its action buttons.
`input-group.tsx` wraps `button.tsx`/`input.tsx`/`textarea.tsx` directly
(`InputGroupButton`/`InputGroupInput`/`InputGroupTextarea`), not Radix.

## Parent

[components](../README.md)
