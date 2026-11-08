import { useEffect, useState } from "react";
import type { OrderStatus } from "@/lib/types";

/**
 * Time left before sweepReadyOrders auto-completes this order, for the
 * "Mark Picked Up" drain bar. Set once per ready_at (the effect only
 * re-runs when these deps actually change, not on every poll tick) so the
 * CSS animation drains smoothly from a fixed duration instead of
 * restarting each time this card re-renders — the actual clearing is
 * still entirely server-side; a stale/frozen value here only ever makes
 * the bar a few seconds off, never wrong about whether the order clears.
 * null hides the bar (auto-clear off, no ready_at yet, or already past
 * due — the next sweep poll will complete it any moment).
 */
export function useAutoClearCountdown(
  readyAutoClearMs: number | null,
  status: OrderStatus,
  readyAt: string | null | undefined,
): number | null {
  const [remainingAutoClearMs, setRemainingAutoClearMs] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (
      readyAutoClearMs === null ||
      readyAutoClearMs === undefined ||
      status !== "ready" ||
      !readyAt
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the countdown when auto-clear no longer applies
      setRemainingAutoClearMs(null);
      return;
    }
    const remaining = readyAutoClearMs - (Date.now() - Date.parse(readyAt));
    setRemainingAutoClearMs(remaining > 0 ? remaining : null);
  }, [readyAutoClearMs, status, readyAt]);
  return remainingAutoClearMs;
}
