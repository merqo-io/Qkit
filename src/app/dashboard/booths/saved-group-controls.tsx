"use client";

import { Link2, Unlink } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@merqo/ui/primitives";

import type { OptionGroup } from "@/lib/types";

function choiceCountLabel(count: number): string {
  return `${count} ${count === 1 ? "choice" : "choices"}`;
}

export function SavedGroupPicker({
  library,
  takenLabels,
  open,
  onOpenChange,
  onPick,
}: {
  library: OptionGroup[];
  takenLabels: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (sharedId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-2 rounded-lg [@media(pointer:coarse)]:min-h-11"
        >
          <Link2 className="size-3.5" /> Add saved group
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a saved group</DialogTitle>
          <DialogDescription>
            Edits to a saved group update every item that uses it.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {library.map((entry) => {
            const taken = takenLabels.has(entry.label.trim().toLowerCase());
            const detail = taken
              ? "Already on this item"
              : choiceCountLabel(entry.choices.length);
            return (
              <li key={entry.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full justify-between rounded-lg py-2 text-left"
                  disabled={taken}
                  onClick={() => onPick(entry.id)}
                >
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {detail}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function SharedGroupCard({
  group,
  onEditForAll,
  onUnlink,
}: {
  group: OptionGroup;
  onEditForAll: () => void;
  onUnlink: () => void;
}) {
  return (
    <div
      className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
      data-testid="shared-group"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{group.label}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Shared
        </span>
        <span className="text-xs text-muted-foreground">
          {group.multiple ? "Pick any" : "Pick one"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {group.choices.map((c) => c.label).join(", ")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg [@media(pointer:coarse)]:min-h-11"
          onClick={onEditForAll}
        >
          Edit for all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-lg text-muted-foreground [@media(pointer:coarse)]:min-h-11"
          onClick={onUnlink}
        >
          <Unlink className="size-3.5" /> Unlink
        </Button>
      </div>
    </div>
  );
}
