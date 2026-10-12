"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/widgets/hint";
import { advanceOrder, revertOrderAdvance } from "./order-actions";
import type { BoardOrder, PaymentStatus } from "@/lib/types";

/**
 * Batch fulfillment advances preparing→ready or ready→completed, with an
 * expected-status guard on each order. Payment confirmation stays separate.
 */
// Heights here are the compact ones a mouse gets. On a touch device the
// `pointer: coarse` rule in globals.css raises every one of these to 44px.
export const BATCH_BUTTON = "rounded-full";

// The board's one batch control. Idle, it is a single "Select" button with a
// tap-to-open hint. In select mode it becomes Cancel, Select all (which flips
// to Clear all once everything is ticked) and the action itself, whose count
// is the confirmation: "Mark N Ready" for the ticked orders still being made,
// "Mark N Picked Up" for the ticked ones already ready. Both show only when
// both kinds are ticked, which is the end-of-event case: a vendor who had no
// time to mark anything clears the whole board in two taps.
export function BatchControls({
  selectMode,
  readyCount,
  pickupCount,
  pickupByDefault,
  allSelected,
  busy,
  onStart,
  onCancel,
  onToggleAll,
  onMarkReady,
  onMarkPickedUp,
}: {
  selectMode: boolean;
  // Ticked orders that are still preparing, and ticked orders that are ready.
  readyCount: number;
  pickupCount: number;
  // Which button stands in, disabled, while nothing is ticked: pick-up when
  // no order on the board is still being made.
  pickupByDefault: boolean;
  allSelected: boolean;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  onToggleAll: () => void;
  onMarkReady: () => void;
  onMarkPickedUp: () => void;
}) {
  if (!selectMode)
    return (
      <div className="ml-auto flex items-center">
        <Button
          variant="outline"
          size="sm"
          className={BATCH_BUTTON}
          onClick={onStart}
        >
          Select
        </Button>
        <Hint label="About Select">
          Tick several orders, or all of them, and mark them ready or picked up
          in one tap.
        </Hint>
      </div>
    );
  const nothingTicked = readyCount === 0 && pickupCount === 0;
  const showReady = readyCount > 0 || (nothingTicked && !pickupByDefault);
  const showPickup = pickupCount > 0 || (nothingTicked && pickupByDefault);
  return (
    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className={BATCH_BUTTON}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={BATCH_BUTTON}
        onClick={onToggleAll}
      >
        {allSelected ? "Clear all" : "Select all"}
      </Button>
      {showReady && (
        <Button
          size="sm"
          className={BATCH_BUTTON}
          disabled={readyCount === 0 || busy}
          onClick={onMarkReady}
        >
          Mark {readyCount} Ready
        </Button>
      )}
      {showPickup && (
        <Button
          size="sm"
          className={BATCH_BUTTON}
          disabled={pickupCount === 0 || busy}
          onClick={onMarkPickedUp}
        >
          Mark {pickupCount} Picked Up
        </Button>
      )}
    </div>
  );
}

// How long the Undo on a batch toast stays up. Longer than a single ticket's
// undo window: there are more orders to notice a mistake across.
const BATCH_UNDO_MS = 8000;

// The statuses a batch can move on from, each with where it goes and how the
// toast says so.
type BatchStep = "pending" | "preparing" | "ready";
const BATCH_NEXT = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
} as const;

function batchDoneMessage(step: BatchStep, count: number): string {
  const orders = `${count} order${count === 1 ? "" : "s"}`;
  if (step === "pending") return `Started ${orders}`;
  return `Marked ${orders} ${step === "preparing" ? "ready" : "picked up"}`;
}

/** Walk a batch back the one step it was just moved. */
async function undoAdvanced(
  ids: string[],
  from: BatchStep,
  paymentById: ReadonlyMap<string, PaymentStatus>,
) {
  const to = BATCH_NEXT[from];
  const results = await Promise.allSettled(
    ids.map((id) =>
      revertOrderAdvance(id, from, to, paymentById.get(id) ?? "not_required"),
    ),
  );
  const ok = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = results.length - ok;
  if (ok > 0) toast.success(`Put ${ok} order${ok === 1 ? "" : "s"} back`);
  if (failed > 0)
    toast.error(
      `${failed} order${failed === 1 ? "" : "s"} couldn't be put back. Check the board.`,
    );
}

// An order the batch control can act on: one step from done either way.
export function isBatchable(order: BoardOrder): boolean {
  return order.status === "preparing" || order.status === "ready";
}

export function useBatchSelection() {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [advancing, setAdvancing] = useState(false);
  // Moves each of `ids` one step on (advanceOrder: incoming to started,
  // preparing to ready, ready to picked up) and unticks them. Anything else still ticked stays ticked,
  // so a mixed selection is finished with the other button; unticking the
  // ones just moved is what stops a second tap from moving them again.
  async function advanceSelected(
    ids: string[],
    expectedStatus: BatchStep,
    paymentById: ReadonlyMap<string, PaymentStatus>,
  ) {
    setAdvancing(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => advanceOrder(id, expectedStatus)),
      );
      const moved = ids.filter((_, i) => {
        const r = results[i];
        return r.status === "fulfilled" && r.value.success;
      });
      const ok = moved.length;
      const failed = results.length - ok;
      // One tap moved many orders, and a customer watching theirs sees it
      // change, so the same tap has to be reversible in one tap.
      if (ok > 0)
        toast.success(batchDoneMessage(expectedStatus, ok), {
          duration: BATCH_UNDO_MS,
          action: {
            label: "Undo",
            onClick: () => undoAdvanced(moved, expectedStatus, paymentById),
          },
        });
      if (failed > 0)
        toast.error(
          `${failed} order${failed === 1 ? "" : "s"} couldn't be updated`,
        );
      const left = new Set(selectedIds);
      for (const id of ids) left.delete(id);
      setSelectedIds(left);
      if (left.size === 0) setSelectMode(false);
    } finally {
      setAdvancing(false);
    }
  }
  return {
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    toggleSelect,
    advancing,
    advanceSelected,
  };
}
