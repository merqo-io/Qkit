"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import type { BoardSettings } from "@/lib/types";
import {
  sweepReadyOrders,
  sweepAbandonedPayments,
} from "./order-sweep-actions";
import type { BoothView } from "./board-booths";

/**
 * Order ids currently inside an OrderCard undo window (see order-card.tsx) —
 * kept on the active board even once their status is terminal, so the undo
 * affordance a vendor just tapped doesn't get yanked out from under them by
 * the realtime echo of the very write it's offering to undo.
 */
export function useUndoWindowIds() {
  const [undoWindowIds, setUndoWindowIds] = useState<Set<string>>(new Set());
  const handleUndoWindowChange = useCallback(
    (orderId: string, active: boolean) => {
      setUndoWindowIds((prev) => {
        if (active === prev.has(orderId)) return prev;
        const next = new Set(prev);
        if (active) next.add(orderId);
        else next.delete(orderId);
        return next;
      });
    },
    [],
  );
  return { undoWindowIds, handleUndoWindowChange };
}

/**
 * Event-mode setup (migration 0080): a booth with walkup_default=true
 * means staff enter every order directly, so open the walk-up dialog the
 * moment the board loads instead of waiting for a "New order" tap — the
 * QR/menu-first board underneath is unaffected either way, and a vendor
 * with no such booth (every booth today) never triggers this. Runs once
 * on mount only, so closing the dialog doesn't reopen it on a later
 * render (e.g. after toggling a booth active/inactive). Only an ACTIVE
 * booth counts: a walk-up booth that is switched off (last weekend's event,
 * a booth kept for testing) is not being served from, and used to pop this
 * dialog over the board on every load anyway.
 */
export function useWalkupAutoOpen(booths: BoothView[], open: () => void): void {
  const autoOpenedWalkup = useRef(false);
  useEffect(() => {
    if (autoOpenedWalkup.current) return;
    if (booths.some((b) => b.walkup_default && b.is_active)) {
      autoOpenedWalkup.current = true;
      open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are intentionally limited to the booth list
  }, []);
}

/**
 * Auto-clear sweep for stale 'ready' orders (board_settings.
 * ready_auto_clear_min) — a plain periodic tick, not tied to any local
 * state. The board's own realtime channel already reflects whatever this
 * flips, so no client-side merge is needed here.
 *
 * Abandoned-payment sweep: cancels pending QR orders older than 30 minutes.
 * Unconditional (no vendor setting gate) — this is baseline hygiene, not an
 * opt-in preference. Separate from the ready-orders sweep since its condition
 * and frequency may differ in the future.
 */
export function useOrderSweeps(boardSettings: BoardSettings): void {
  usePolling(
    useCallback(async () => {
      await sweepReadyOrders();
    }, []),
    {
      intervalMs: 30_000,
      enabled:
        boardSettings.ready_auto_clear_min !== null &&
        boardSettings.ready_auto_clear_min !== undefined,
    },
  );

  usePolling(
    useCallback(async () => {
      await sweepAbandonedPayments();
    }, []),
    { intervalMs: 30_000, enabled: true },
  );
}
