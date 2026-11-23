"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";

import { ProLock } from "@/components/widgets/pro-lock";
import { usageCount } from "@/lib/modifier-groups";
import type { Entitlement } from "@/lib/plan";
import type { OptionGroup } from "@/lib/types";
import { OptionGroupsEditor } from "./option-groups-editor";

const MAX_LIBRARY_GROUPS = 40;

export function libraryGroupDomId(id: string): string {
  return `modifier-group-${id}`;
}

interface Props {
  library: OptionGroup[];
  items: { option_groups?: OptionGroup[] }[];
  entitlement: Entitlement;
  dirty: boolean;
  saving: boolean;
  onChange: (library: OptionGroup[]) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
}

function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export function ModifierLibrarySection({
  library,
  items,
  entitlement,
  dirty,
  saving,
  onChange,
  onRemove,
  onSave,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const locked = entitlement.maxOptionGroupsPerItem !== null;
  const deleting = library.find((g) => g.id === pendingDelete);
  const deletingCount = deleting ? usageCount(items, deleting.id) : 0;

  function addGroup() {
    onChange([
      ...library,
      {
        id: crypto.randomUUID(),
        label: "",
        multiple: false,
        choices: [{ id: crypto.randomUUID(), label: "" }],
      },
    ]);
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-labelledby="modifier-library-heading"
    >
      <div className="space-y-1">
        <h2 id="modifier-library-heading" className="text-base font-semibold">
          Reusable modifier groups
        </h2>
        <p className="text-sm text-muted-foreground">
          Define a group once, like Sugar level, then add it to many items. Edit
          it here and every item that uses it updates.
        </p>
      </div>

      {locked ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Reusable groups are available on paid plans.</span>
          <ProLock feature="option_groups" label="See plans" />
        </div>
      ) : (
        <>
          {library.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No reusable groups yet.
            </p>
          )}
          {library.map((group) => {
            const count = usageCount(items, group.id);
            return (
              <div
                key={group.id}
                id={libraryGroupDomId(group.id)}
                className="space-y-1.5"
              >
                <p className="text-xs text-muted-foreground">
                  Used by {itemsLabel(count)}
                  {count > 0 && `. Changes update all ${itemsLabel(count)}.`}
                </p>
                <OptionGroupsEditor
                  libraryMode
                  groups={[group]}
                  onChange={(next) =>
                    onChange(
                      library.map((g) => (g.id === group.id ? next[0]! : g)),
                    )
                  }
                  onRemoveGroup={setPendingDelete}
                  entitlement={entitlement}
                  itemAllergens={[]}
                />
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg [@media(pointer:coarse)]:min-h-11"
              disabled={library.length >= MAX_LIBRARY_GROUPS}
              onClick={addGroup}
            >
              <Plus className="size-3.5" /> New reusable group
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-lg [@media(pointer:coarse)]:min-h-11"
              disabled={!dirty || saving}
              onClick={onSave}
            >
              {saving ? "Saving…" : "Save reusable groups"}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        variant="destructive"
        title={`Delete “${deleting?.label || "this group"}”?`}
        description={
          deletingCount > 0
            ? `This unlinks it from ${itemsLabel(deletingCount)}. They keep their own copy of the group, so no choices are lost.`
            : "No items use this group."
        }
        confirmLabel="Delete group"
        cancelLabel="Keep group"
        onConfirm={() => {
          if (pendingDelete) onRemove(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </section>
  );
}
