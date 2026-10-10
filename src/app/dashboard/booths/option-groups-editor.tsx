"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPTION_CODE_MAX, suggestOptionCode } from "@/lib/ticket";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProLock } from "@/components/widgets/pro-lock";
import { canHaveOptionGroups, type Entitlement } from "@/lib/plan";
import { ALLERGEN_TAGS, type AllergenTag } from "@/lib/schemas";
import type { OptionChoice, OptionGroup } from "@/lib/types";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";
import { MoneyInput } from "@merqo/ui";

interface Props {
  groups: OptionGroup[];
  onChange: (groups: OptionGroup[]) => void;
  entitlement: Entitlement;
  // The item's own fixed allergens — for the "customer sees" preview below,
  // same union item-customizer.tsx computes at order time.
  itemAllergens: AllergenTag[];
}

function hasAdvancedSet(choice: OptionChoice): boolean {
  return (
    choice.cost_delta_cents != null ||
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

/**
 * Generic option-group editor used inside the menu editor. A vendor builds any
 * number of groups (Size, Spice, Add-ons, …), each single- or multi-select,
 * with any number of choices. Not coffee-specific.
 */
export function OptionGroupsEditor({
  groups,
  onChange,
  entitlement,
  itemAllergens,
}: Props) {
  // Advanced (cost + allergens) opens in a modal, one at a time — an
  // accordion here left every previously-opened choice's panel expanded
  // underneath the next, which got unreadable fast.
  const [openAdvancedFor, setOpenAdvancedFor] = useState<string | null>(null);
  // Tracks collapsed, not expanded, so a freshly-added group defaults open
  // without needing its id added anywhere first.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  function toggleGroupCollapsed(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // canHaveOptionGroups(count) asks "may an item carry `count` groups?" — so the
  // cap is hit when adding one more (groups.length + 1) is not allowed.
  const atGroupCap = !canHaveOptionGroups(entitlement, groups.length + 1);
  function updateGroup(gi: number, patch: Partial<OptionGroup>) {
    onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    onChange([
      ...groups,
      {
        id: crypto.randomUUID(),
        label: "",
        multiple: false,
        choices: [{ id: crypto.randomUUID(), label: "" }],
      },
    ]);
  }

  function removeGroup(gi: number) {
    onChange(groups.filter((_, i) => i !== gi));
  }

  function updateChoiceLabel(gi: number, ci: number, label: string) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.map((c, i) => (i === ci ? { ...c, label } : c)),
    });
  }

  function updateChoice(gi: number, ci: number, patch: Partial<OptionChoice>) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });
  }

  function setChoicePrice(gi: number, ci: number, cents: number | undefined) {
    updateChoice(gi, ci, {
      price_delta_cents: cents === 0 ? undefined : cents,
    });
  }

  function setChoiceCost(gi: number, ci: number, cents: number | undefined) {
    updateChoice(gi, ci, { cost_delta_cents: cents === 0 ? undefined : cents });
  }

  function setChoiceCode(gi: number, ci: number, code: string) {
    const trimmed = code.trim();
    updateChoice(gi, ci, { code: trimmed === "" ? undefined : trimmed });
  }

  function toggleChoiceAllergen(
    gi: number,
    ci: number,
    choice: OptionChoice,
    tag: AllergenTag,
    checked: boolean,
  ) {
    const current = choice.allergens ?? [];
    const next = checked ? [...current, tag] : current.filter((a) => a !== tag);
    updateChoice(gi, ci, { allergens: next.length ? next : undefined });
  }

  function addChoice(gi: number) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: [...group.choices, { id: crypto.randomUUID(), label: "" }],
    });
  }

  function removeChoice(gi: number, ci: number) {
    const group = groups[gi];
    updateGroup(gi, {
      choices: group.choices.filter((_, i) => i !== ci),
    });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => {
        const isCollapsed = collapsedGroups.has(group.id);
        return (
          <div
            key={group.id}
            className="space-y-3 rounded-lg border border-border bg-background p-3"
          >
            {/* Group identity + type — a one-time-per-group setting, kept
              visually heavier (font-medium) than the choices below so it
              reads as a header, not another row in the list. Two rows on
              mobile (name always paired with its collapse chevron; type +
              count + remove below, indented to align under the name) since
              cramming all five controls onto one uncontrolled flex-wrap
              line let any one of them drop to its own line unpredictably;
              back to a single row once there's room at sm:+. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => toggleGroupCollapsed(group.id)}
                  aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </Button>
                <Input
                  placeholder="Group name (e.g. Size, Spice, Add-ons)"
                  aria-label="Option group name"
                  value={group.label}
                  onChange={(e) => updateGroup(gi, { label: e.target.value })}
                  className="min-w-[8rem] flex-1 rounded-lg font-medium"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                <ToggleGroup
                  type="single"
                  value={group.multiple ? "any" : "one"}
                  onValueChange={(v) =>
                    v && updateGroup(gi, { multiple: v === "any" })
                  }
                  aria-label="How many options a customer can pick"
                  className="inline-flex shrink-0 rounded-lg border border-border p-0.5 text-sm"
                >
                  <ToggleGroupItem
                    value="one"
                    className="rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                  >
                    Pick one
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="any"
                    className="rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                  >
                    Pick any
                  </ToggleGroupItem>
                </ToggleGroup>
                {isCollapsed && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {group.choices.length}{" "}
                    {group.choices.length === 1 ? "choice" : "choices"}
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                  onClick={() => removeGroup(gi)}
                  aria-label="Remove group"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {/* Choices, visually nested under the header via a distinct
              background and indent rather than a decorative border. */}
            {!isCollapsed && (
              <div className="space-y-1.5 rounded-lg bg-muted/40 p-2 pl-3">
                {group.choices.map((choice, ci) => (
                  <ChoiceRow
                    key={choice.id}
                    choice={choice}
                    disableRemove={group.choices.length <= 1}
                    itemAllergens={itemAllergens}
                    isAdvancedOpen={openAdvancedFor === choice.id}
                    onAdvancedOpenChange={(open) =>
                      setOpenAdvancedFor(open ? choice.id : null)
                    }
                    onLabelChange={(label) => updateChoiceLabel(gi, ci, label)}
                    onPriceChange={(cents) => setChoicePrice(gi, ci, cents)}
                    onCostChange={(cents) => setChoiceCost(gi, ci, cents)}
                    onCodeChange={(code) => setChoiceCode(gi, ci, code)}
                    onAllergenToggle={(tag, checked) =>
                      toggleChoiceAllergen(gi, ci, choice, tag, checked)
                    }
                    onRemove={() => removeChoice(gi, ci)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-muted-foreground"
                  onClick={() => addChoice(gi)}
                >
                  <Plus className="size-3.5" /> Add choice
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {atGroupCap ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {entitlement.maxOptionGroupsPerItem}-group limit per item.
          </span>
          <ProLock feature="option_groups" label="Upgrade" />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={addGroup}
        >
          <Plus className="size-3.5" /> Add option group
        </Button>
      )}
    </div>
  );
}

function ChoiceRow({
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
