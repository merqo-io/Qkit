"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAsyncAction } from "@/hooks/use-async-action";
import { toggleBoothActive } from "./actions";
import { cn } from "@/lib/utils";

const HOLD_MS = 3000;
// Long enough for a vendor to notice and undo a close mid-service, short
// enough that it isn't sitting around all shift. Distinct from (and longer
// than) the board's own advance-undo window (board_settings.undo_seconds,
// 2-15s) — closing is a rarer, higher-consequence action than advancing one
// ticket, so it gets more recovery time by design, not by coincidence.
const CLOSE_UNDO_MS = 60_000;

interface Props {
  boothId: string;
  boothName: string;
  isActive: boolean;
  // Keeps the booth-edit form's own `isActive` state (part of the Save-booth
  // payload) in sync with a close/reopen made through this control — without
  // this, an unrelated field edit + Save right after closing here would
  // silently reopen the booth with the form's stale pre-close value.
  onChanged: (active: boolean) => void;
}

/**
 * Hold a button, don't just tap it, to close. Same `toggleBoothActive`
 * server action (and the same `is_active` column) the live board's instant
 * pause `Switch` uses — the flag is identical, only the friction differs.
 * That's deliberate: pausing to clear a rush-hour backlog needs to be
 * instant and reversible (the board's job), while ending the day needs a
 * harder-to-fat-finger path (this one) — Confirm dialog, then a 3-second
 * hold, not a single tap. Reopening carries none of that risk, so it's a
 * plain instant button, no hold and no confirm.
 */
function HoldToCloseButton({
  disabled,
  onConfirm,
}: {
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (disabled || timerRef.current) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  }

  function cancel() {
    setHolding(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Unmounting mid-hold (e.g. the dialog is closed some other way) must not
  // leave a stray timer that fires the close after the button is gone.
  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      aria-label="Hold for 3 seconds to pause this booth"
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-xl border font-semibold select-none",
        "border-destructive/40 bg-destructive/[0.04] text-destructive",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {holding && (
        <span
          aria-hidden
          className="hold-fill-bar absolute inset-y-0 left-0 bg-destructive/20"
        />
      )}
      <span className="relative">
        {holding ? "Keep holding…" : "Hold to pause (3s)"}
      </span>
    </button>
  );
}

export function CloseBoothControl({
  boothId,
  boothName,
  isActive,
  onChanged,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { pending: closing, run: runClose } = useAsyncAction();
  const { pending: reopening, run: runReopen } = useAsyncAction();

  function reopen() {
    return runReopen(async () => {
      const res = await toggleBoothActive(boothId, true);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      onChanged(true);
      toast.success(`${boothName} is open again`);
    });
  }

  function close() {
    setConfirmOpen(false);
    return runClose(async () => {
      const res = await toggleBoothActive(boothId, false);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      onChanged(false);
      toast(`${boothName} is paused`, {
        duration: CLOSE_UNDO_MS,
        action: { label: "Undo", onClick: reopen },
      });
    });
  }

  if (!isActive) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm">
          <span className="font-medium">Paused</span>
          <span className="block text-muted-foreground">
            Not taking orders. Resume anytime.
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          disabled={reopening}
          onClick={reopen}
        >
          <Power className="size-4" />
          {reopening ? "Resuming…" : "Resume booth"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-sm">
        <span className="font-medium">Open</span>
        <span className="block text-muted-foreground">
          Taking orders. The switch on the live board pauses it too.
        </span>
      </span>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
            disabled={closing}
          >
            <PowerOff className="size-4" />
            {closing ? "Pausing…" : "Pause booth"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause “{boothName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Stops new orders from landing. Existing orders on the board stay
              exactly as they are. You can resume anytime, and you have 60
              seconds to undo right after pausing. Hold the button below for 3
              seconds to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <HoldToCloseButton onConfirm={close} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
