"use client";

import { Settings2, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@merqo/ui/primitives";
import { MoneyInput } from "@merqo/ui";

import { OPTION_CODE_MAX, suggestOptionCode } from "@/lib/ticket";
import { ALLERGEN_TAGS, type AllergenTag } from "@/lib/schemas";
import type { OptionChoice } from "@/lib/types";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";

function hasAdvancedSet(choice: OptionChoice): boolean {
  return (
    (choice.cost_delta_cents !== null &&
      choice.cost_delta_cents !== undefined) ||
    (choice.allergens?.length ?? 0) > 0 ||
    Boolean(choice.code)
  );
}

// Same union logic as item-customizer.tsx's live customer-facing badge.
function effectiveAllergens(
  itemAllergens: AllergenTag[],
  choiceAllergens: AllergenTag[] | undefined,
): AllergenTag[] {
  return Array.from(new Set([...itemAllergens, ...(choiceAllergens ?? [])]));
}

export function ChoiceRow({
  choice,
  disableRemove,
  itemAllergens,
  isAdvancedOpen,
  onAdvancedOpenChange,
  onLabelChange,
  onPriceChange,
  onCostChange,
  onCodeChange,
  onAllergenToggle,
  onRemove,
}: {
  choice: OptionChoice;
  disableRemove: boolean;
  itemAllergens: AllergenTag[];
  isAdvancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onLabelChange: (label: string) => void;
  onPriceChange: (cents: number | undefined) => void;
  onCostChange: (cents: number | undefined) => void;
  onCodeChange: (code: string) => void;
  onAllergenToggle: (tag: AllergenTag, checked: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        placeholder="Choice (e.g. Small)"
        aria-label="Choice name"
        value={choice.label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="rounded-lg bg-background"
      />
      <div className="flex gap-2">
        {/* Price matters to every vendor, always visible, not behind the
            Advanced dialog. Grows on mobile (fills the row beside the two
            fixed icon buttons instead of cramping into a fixed 7rem);
            pinned back to that width at sm:+, where it sits after the
            choice-name input. */}
        <div className="relative min-w-[6rem] flex-1 sm:w-28 sm:flex-none">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <MoneyInput
            placeholder="Price (opt.)"
            aria-label={`Extra price for ${choice.label || "this choice"}`}
            cents={choice.price_delta_cents}
            onCommit={onPriceChange}
            className="rounded-lg bg-background pl-6"
          />
        </div>
        <Dialog open={isAdvancedOpen} onOpenChange={onAdvancedOpenChange}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative shrink-0 rounded-lg bg-background text-muted-foreground"
              aria-label={`Advanced options for ${choice.label || "this choice"}`}
            >
              <Settings2 className="size-4" />
              {hasAdvancedSet(choice) && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary"
                />
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Advanced: {choice.label || "Choice"}</DialogTitle>
              <DialogDescription>
                A short code for the order ticket, plus extra cost and allergens
                only when this choice is picked.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`code-${choice.id}`} className="text-sm">
                  Short code on the order ticket
                </Label>
                <Input
                  id={`code-${choice.id}`}
                  value={choice.code ?? ""}
                  onChange={(e) => onCodeChange(e.target.value)}
                  maxLength={OPTION_CODE_MAX}
                  placeholder={suggestOptionCode(choice.label) || "e.g. LS"}
                  autoCapitalize="characters"
                  className="w-32 rounded-lg font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Your own shorthand, so a ticket reads quickly. Leave it blank
                  and the ticket prints the choice in full.
                </p>
              </div>
              <div className="relative w-32">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <MoneyInput
                  placeholder="Cost (opt.)"
                  aria-label={`Extra cost of ${choice.label || "this choice"}`}
                  cents={choice.cost_delta_cents}
                  onCommit={onCostChange}
                  className="rounded-lg pl-6"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {ALLERGEN_TAGS.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center gap-1.5 text-xs capitalize"
                  >
                    <Checkbox
                      checked={(choice.allergens ?? []).includes(tag)}
                      onCheckedChange={(checked) =>
                        onAllergenToggle(tag, checked === true)
                      }
                    />
                    <span aria-hidden="true">{ALLERGEN_ICONS[tag]}</span>
                    {tag}
                  </label>
                ))}
              </div>
              {(() => {
                const effective = effectiveAllergens(
                  itemAllergens,
                  choice.allergens,
                );
                return (
                  effective.length > 0 && (
                    <div className="space-y-1 border-t border-border/60 pt-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Customer sees when picked:
                      </p>
                      <div
                        role="status"
                        aria-label="Contains allergens"
                        className="flex flex-wrap gap-1.5"
                      >
                        {effective.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-status-cancelled/40 bg-status-cancelled/10 px-2 py-0.5 text-xs font-medium capitalize text-status-cancelled"
                          >
                            <span aria-hidden="true">
                              {ALLERGEN_ICONS[tag]}
                            </span>{" "}
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                );
              })()}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-lg bg-background text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove choice"
          disabled={disableRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
