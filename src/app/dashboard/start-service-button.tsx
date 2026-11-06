"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@merqo/ui";
import { Button } from "@/components/ui/button";
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
  onStarted,
}: {
  boothId: string;
  boothName: string;
  compact?: boolean;
  // Called with the stamped time as soon as the action succeeds, before the
  // page refresh, so the board ranks the next order from the new service.
  onStarted?: (boothId: string, startedAt: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function confirm() {
    // A rejected call becomes an empty message so the dialog shows its own
    // friendly errorMessage instead of a raw network error.
    const res = await startNewService(boothId).catch(() => null);
    if (!res?.success) throw new Error(res?.error ?? "");
    toast.success(`New service started. ${boothName} is back to 0 items.`);
    if (res.startedAt) onStarted?.(boothId, res.startedAt);
    router.refresh();
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

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Start a new service?"
        description={`The item count for ${boothName} goes back to 0, so it can take a full daily limit again. Orders already placed are not changed.`}
        confirmLabel="Start new service"
        pendingLabel="Starting…"
        errorMessage="Could not start a new service. Try again."
        onConfirm={confirm}
      />
    </>
  );
}
