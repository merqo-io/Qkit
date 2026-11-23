"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@merqo/ui/primitives";

import { ProLock } from "@/components/widgets/pro-lock";
import { canHaveOptionGroups, type Entitlement } from "@/lib/plan";
import type { AllergenTag } from "@/lib/schemas";
import type { OptionChoice, OptionGroup } from "@/lib/types";
import {
  linkGroup,
  promoteToLibrary,
  unlinkGroup,
} from "@/lib/modifier-groups";
import { ChoiceRow } from "./option-choice-row";
import { SavedGroupPicker, SharedGroupCard } from "./saved-group-controls";

interface Props {
  groups: OptionGroup[];
  onChange: (groups: OptionGroup[]) => void;
  entitlement: Entitlement;
  // The item's own fixed allergens — for the "customer sees" preview below,
  // same union item-customizer.tsx computes at order time.
  itemAllergens: AllergenTag[];
  // Booth-wide reusable groups. Set on an item's editor, they enable the
  // "Add saved group" picker and "Save as reusable".
  library?: OptionGroup[];
  onLibraryChange?: (library: OptionGroup[]) => void;
  onEditShared?: (sharedId: string) => void;
  // Library mode: the caller owns removal (it needs a confirm) and adds groups
  // itself, so the per-item cap and the add button do not apply.
  onRemoveGroup?: (groupId: string) => void;
  libraryMode?: boolean;
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
  library,
  onLibraryChange,
  onEditShared,
  onRemoveGroup,
  libraryMode = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const atGroupCap =
    !libraryMode && !canHaveOptionGroups(entitlement, groups.length + 1);
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
    if (onRemoveGroup) {
      onRemoveGroup(groups[gi]!.id);
      return;
    }
    onChange(groups.filter((_, i) => i !== gi));
  }

  function attach(sharedId: string) {
    if (!library) return;
    const result = linkGroup(
      { option_groups: groups },
      library,
      sharedId,
      crypto.randomUUID(),
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChange(result.value.option_groups ?? groups);
    setPickerOpen(false);
  }

  function detach(groupId: string) {
    onChange(unlinkGroup({ option_groups: groups }, groupId).option_groups!);
  }

  function saveAsReusable(groupId: string) {
    if (!library || !onLibraryChange) return;
    const result = promoteToLibrary(
      library,
      { option_groups: groups },
      groupId,
      crypto.randomUUID(),
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onLibraryChange(result.value.library);
    onChange(result.value.item.option_groups ?? groups);
    toast.success("Saved to reusable groups");
  }

  const labelsOnItem = new Set(groups.map((g) => g.label.trim().toLowerCase()));

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
    { gi, ci }: { gi: number; ci: number },
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
        if (group.shared_id !== undefined && !libraryMode) {
          return (
            <SharedGroupCard
              key={group.id}
              group={group}
              onEditForAll={() => onEditShared?.(group.shared_id!)}
              onUnlink={() => detach(group.id)}
            />
          );
        }
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
                      toggleChoiceAllergen({ gi, ci }, choice, tag, checked)
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
            {!libraryMode && library && onLibraryChange && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg text-muted-foreground [@media(pointer:coarse)]:min-h-11"
                disabled={!group.label.trim()}
                onClick={() => saveAsReusable(group.id)}
              >
                <Link2 className="size-3.5" /> Save as reusable
              </Button>
            )}
          </div>
        );
      })}

      {!libraryMode && atGroupCap && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {entitlement.maxOptionGroupsPerItem}-group limit per item.
          </span>
          <ProLock feature="option_groups" label="See plans" />
        </div>
      )}
      {!libraryMode && !atGroupCap && (
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
      {!libraryMode && library && library.length > 0 && !atGroupCap && (
        <SavedGroupPicker
          library={library}
          takenLabels={labelsOnItem}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={attach}
        />
      )}
    </div>
  );
}
