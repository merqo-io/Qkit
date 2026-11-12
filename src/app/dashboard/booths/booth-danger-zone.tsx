"use client";

import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@merqo/ui/primitives";

interface Props {
  boothName: string;
  deleting: boolean;
  saving: boolean;
  onDelete: () => void;
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
            disabled={deleting || saving}
          >
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete booth"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{boothName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the booth and every order placed at it.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Keep booth
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete booth
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
