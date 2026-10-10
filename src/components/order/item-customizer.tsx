"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MediaImage } from "@/components/widgets/media-image";
import { cn, formatPrice } from "@/lib/utils";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";
import type { MenuItem, SelectedOption } from "@/lib/types";

const CHOICE_ITEM_CLASS = cn(
  "inline-flex min-h-11 max-w-full items-center rounded-lg border border-border px-3.5 text-sm font-medium whitespace-normal break-words text-foreground transition-colors hover:border-primary/40",
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
);

// What picking a choice adds, on the chip itself: the footer only ever shows
// the running total of the extras, so without this a customer has to tap a
// choice to learn its price.
function ChoicePrice({ cents }: { cents?: number | null }) {
  if (!cents) return null;
  // The leading space is a real character, so the choice is read out as
  // "Oat Milk +$1.00" and not as one run-together word.
  return (
    <>
      {" "}
      <span className="ml-1 font-mono text-xs opacity-80">
        +{formatPrice(cents)}
      </span>
    </>
  );
}

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[]) => void;
}

export function ItemCustomizer({ item, onClose, onAdd }: Props) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-2xl"
      >
        {/* Keyed by id so each drink remounts with fresh default selections —
            no reset effect needed. Content only mounts while the sheet is open. */}
        {item && (
          <CustomizerBody
            key={item.id}
            item={item}
            onConfirm={(options) => {
              onAdd(item, options);
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CustomizerBody({
  item,
  onConfirm,
}: {
  item: MenuItem;
  onConfirm: (options: SelectedOption[]) => void;
}) {
  const groups = item.option_groups ?? [];

  // selected: group id -> array of chosen choice ids. Single-select groups
  // default to the first choice; multi-select groups default to none.
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    for (const g of groups) {
      if (g.multiple) defaults[g.id] = [];
      else defaults[g.id] = g.choices[0] ? [g.choices[0].id] : [];
    }
    return defaults;
  });

  // The actual selected Choice objects across every group — the single
  // source both the running total and the allergen badges derive from.
  const selectedChoices = groups.flatMap((g) =>
    (selected[g.id] ?? [])
      .map((id) => g.choices.find((c) => c.id === id))
      .filter((c): c is (typeof g.choices)[number] => !!c),
  );

  // Informational only — place_order re-derives the authoritative total the
  // same way from the stored menu (src/lib/cart.ts's sumOptionDeltas).
  const priceDelta = selectedChoices.reduce(
    (sum, c) => sum + (c.price_delta_cents ?? 0),
    0,
  );

  // Union of the item's fixed allergens and every currently-selected
  // choice's allergens — no subtraction, see the allergen-tagging spec.
  const allergens = Array.from(
    new Set([
      ...(item.allergens ?? []),
      ...selectedChoices.flatMap((c) => c.allergens ?? []),
    ]),
  );

  function confirm() {
    const options: SelectedOption[] = groups.flatMap((g) =>
      (selected[g.id] ?? [])
        .map((id) => g.choices.find((c) => c.id === id))
        .filter((c): c is (typeof g.choices)[number] => !!c)
        .map((c) => ({ group: g.label, choice: c.label })),
    );
    onConfirm(options);
  }

  return (
    <>
      {item.image_url && (
        // Sticky hero: the full photo (object-contain, never cropped) sits over a
        // blurred, zoomed copy of itself so there are no letterbox bars. Stays
        // pinned while the options scroll, capped at 28% of the screen height
        // so on a short phone it cannot crowd the options out of view. shrink-0
        // because the sheet is a flex column and this box has no in-flow
        // content (both images are absolutely positioned): left shrinkable it
        // collapsed to nothing as soon as the sheet had to scroll.
        <div className="sticky top-0 z-10 aspect-[16/9] max-h-[28dvh] w-full shrink-0 overflow-hidden rounded-t-2xl bg-muted">
          <MediaImage
            src={item.image_url}
            alt=""
            aria-hidden
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="scale-110 object-cover blur-xl"
          />
          <MediaImage
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-contain"
          />
          {/* Keep the sheet's close button legible over a bright photo. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/25 to-transparent" />
        </div>
      )}
      <SheetHeader>
        <SheetTitle className="font-display text-2xl">{item.name}</SheetTitle>
        {item.description && (
          <SheetDescription>{item.description}</SheetDescription>
        )}
        {/* Allergen info is a safety signal, not optional complexity — always
            shown, never behind an accordion, updates live with selection. */}
        {allergens.length > 0 && (
          <div
            role="status"
            className="flex flex-wrap gap-1.5 pt-1"
            aria-label="Contains allergens"
          >
            {allergens.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full border border-status-cancelled/40 bg-status-cancelled/10 px-2 py-0.5 text-xs font-medium capitalize text-status-cancelled"
              >
                {ALLERGEN_ICONS[a]} {a}
              </span>
            ))}
          </div>
        )}
      </SheetHeader>

      <div className="space-y-5 px-4">
        {groups.map((g) => (
          <div key={g.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.label}
              {g.multiple && (
                <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                  choose any
                </span>
              )}
            </p>
            {/* Selection state is conveyed by colour alone otherwise (fails WCAG
                1.4.1 / 4.1.2); ToggleGroup exposes the right semantics for each
                mode — role="radio" for single-select, a pressed toggle button
                for multi-select. */}
            {g.multiple ? (
              <ToggleGroup
                type="multiple"
                value={selected[g.id] ?? []}
                onValueChange={(values) =>
                  setSelected((s) => ({ ...s, [g.id]: values }))
                }
                spacing={2}
                aria-label={g.label}
                className="flex flex-wrap"
              >
                {g.choices.map((c) => (
                  <ToggleGroupItem
                    key={c.id}
                    value={c.id}
                    className={CHOICE_ITEM_CLASS}
                  >
                    {c.label}
                    <ChoicePrice cents={c.price_delta_cents} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <ToggleGroup
                type="single"
                value={selected[g.id]?.[0]}
                onValueChange={(v) =>
                  v && setSelected((s) => ({ ...s, [g.id]: [v] }))
                }
                spacing={2}
                aria-label={g.label}
                className="flex flex-wrap"
              >
                {g.choices.map((c) => (
                  <ToggleGroupItem
                    key={c.id}
                    value={c.id}
                    className={CHOICE_ITEM_CLASS}
                  >
                    {c.label}
                    <ChoicePrice cents={c.price_delta_cents} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>
        ))}
      </div>

      {/* Pinned to the bottom of the sheet. With several option groups, or
          on a short screen, the button used to sit below the fold with
          nothing to say the sheet scrolled, and "Add to order" is the one
          thing this sheet is for. */}
      <SheetFooter className="sticky bottom-0 z-10 border-t border-border bg-background pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Informational only — place_order re-derives the real total
            server-side from the stored menu, never trusts this. */}
        {priceDelta > 0 && (
          <p className="text-center text-sm font-semibold text-primary">
            +{formatPrice(priceDelta)}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-xl text-base font-semibold"
          onClick={confirm}
        >
          Add to order
        </Button>
      </SheetFooter>
    </>
  );
}
