"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@merqo/ui";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@merqo/ui/primitives";

import { startNewService } from "./booths/actions";

/**
 * "Start new service": puts a booth's daily item count back to zero, for a
 * stall running a morning and an afternoon service off one limit. Midnight
 * still resets it too. Gated behind a confirmation that names the booth, since
 * a stray tap would reopen ordering on a booth that had sold out.
 *
 * `compact` is the board's labelled pill, sized for the booth row; the
 * default is the full-width labelled button on the booth's edit page.
 */
export function StartServiceButton({
  boothId,
  boothName,
  compact = false,
  countLabel,
  low = false,
  onStarted,
}: {
  boothId: string;
  boothName: string;
  compact?: boolean;
  // Compact only: today's count ("12/200 items") shown inside the pill so the
  // count and its reset read as one control. `low` turns it amber.
  countLabel?: string;
  low?: boolean;
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
    toast.success(
      `New service started. ${boothName} count and Sold-out limits start again.`,
    );
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
              variant="outline"
              className={cn(
                "h-10 shrink-0 gap-1.5 rounded-full px-3 text-xs",
                low
                  ? "border-status-aging/50 text-status-aging hover:text-status-aging"
                  : "text-muted-foreground",
              )}
              aria-label={`Start a new service for ${boothName}`}
              onClick={() => setOpen(true)}
            >
              <RotateCcw className="size-3.5" />
              {countLabel && (
                <span className={cn("font-mono", low && "font-semibold")}>
                  {countLabel}
                </span>
              )}
              <span className={cn(countLabel && "hidden sm:inline")}>
                {countLabel && "· "}New service
              </span>
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
        description={`This starts ${boothName} again: its daily item count goes back to 0 and any per-item Sold-out limits start again. Orders already placed are not changed.`}
        confirmLabel="Start new service"
        pendingLabel="Starting…"
        errorMessage="Could not start a new service. Try again."
        onConfirm={confirm}
      />
    </>
  );
}
