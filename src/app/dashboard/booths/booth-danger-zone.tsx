"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";

interface Props {
  boothName: string;
  deleting: boolean;
  saving: boolean;
  onDelete: () => Promise<void> | void;
}

export function BoothDangerZone({
  boothName,
  deleting,
  saving,
  onDelete,
}: Props) {
  return (
    <div className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
        Danger zone
      </p>
      <p className="text-sm text-muted-foreground">
        Deleting this booth permanently removes it and every order placed at it.
        The data can&apos;t be retrieved.
      </p>
      <ConfirmDialog
        variant="destructive"
        title={`Delete “${boothName}”?`}
        description="This permanently deletes the booth."
        consequence="Every order placed at this booth is deleted too. This can't be undone."
        confirmPhrase={boothName}
        confirmLabel="Delete booth"
        cancelLabel="Keep booth"
        pendingLabel="Deleting…"
        onConfirm={onDelete}
        trigger={
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
            disabled={deleting || saving}
          >
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete booth"}
          </Button>
        }
      />
    </div>
  );
}
