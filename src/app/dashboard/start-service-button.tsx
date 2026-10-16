"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { startNewService } from "./booths/actions";

/**
 * "Start new service": puts a booth's daily item count back to zero, for a
 * stall running a morning and an afternoon service off one limit. Midnight
 * still resets it too. Gated behind a confirmation that names the booth, since
 * a stray tap would reopen ordering on a booth that had sold out.
 *
 * `compact` is the board's icon-only button, sized for the booth row; the
 * default is the full-width labelled button on the booth's edit page.
 */
export function StartServiceButton({
  boothId,
  boothName,
  compact = false,
}: {
  boothId: string;
  boothName: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const res = await startNewService(boothId);
        if (!res.success) {
          toast.error(res.error ?? "Could not start a new service");
          return;
        }
        toast.success(`New service started. ${boothName} is back to 0 items.`);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Could not start a new service. Try again.");
      }
    });
  }

  return (
    <>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-full text-muted-foreground"
              aria-label={`Start a new service for ${boothName}`}
              onClick={() => setOpen(true)}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start new service</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          onClick={() => setOpen(true)}
        >
          <RotateCcw className="size-4" /> Start new service
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new service?</AlertDialogTitle>
            <AlertDialogDescription>
              The item count for {boothName} goes back to 0, so it can take a
              full daily limit again. Orders already placed are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // keep the dialog open until the action resolves
                e.preventDefault();
                confirm();
              }}
              disabled={pending}
            >
              {pending ? "Starting…" : "Start new service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
