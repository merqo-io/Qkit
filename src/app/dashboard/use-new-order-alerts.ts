"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fireNewOrderNotification, playSound } from "@/lib/order-alerts";
import { isNil } from "@/lib/utils";
import type { BoardOrder, BoardSettings } from "@/lib/types";
import { useAwayBadge } from "./use-away-badge";

const REFRESH_MIN_GAP_MS = 5000;

// booths is not in the realtime publication, so another device's Start new
// service only reaches this board through a server re-read. Throttled with a
// trailing call so a burst of orders costs one render and the last still lands.
function useThrottledRefresh() {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );
  return function refreshThrottled() {
    const wait = REFRESH_MIN_GAP_MS - (Date.now() - lastRefreshAt.current);
    if (wait <= 0) {
      lastRefreshAt.current = Date.now();
      router.refresh();
      return;
    }
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      lastRefreshAt.current = Date.now();
      router.refresh();
    }, wait);
  };
}

/**
 * Chime, toast, tab badge and desktop notification for an order that has just
 * arrived on the board, plus the bookkeeping that keeps this board's own
 * walk-up placements from alerting about themselves.
 *
 * newOrderNumberRef is read at alert time and assigned by the board once the
 * day's numbering is known: handleNewOrder has to exist before the orders that
 * numbering is read from.
 */
export function useNewOrderAlerts({
  boothName,
  boardSettings,
}: {
  boothName: Map<string, string>;
  boardSettings: BoardSettings;
}) {
  const refreshThrottled = useThrottledRefresh();
  const bumpAway = useAwayBadge();
  const newOrderNumberRef = useRef(
    (_boothId: string, orderNumber: string) => orderNumber,
  );

  // Walk-up orders this board placed itself, by booth and permanent number,
  // each forgotten after a minute. The dialog already says "Order #003 added to
  // the board", so its own realtime echo must not chime and toast again.
  // Other devices on the same account never see these and still alert.
  const ownWalkups = useRef(new Set<string>());
  // The INSERT can land before placeWalkupOrder returns the number, so while
  // a placement is in flight a walk-up INSERT waits here until it is known.
  const walkupsInFlight = useRef(0);
  const heldWalkupAlerts = useRef<BoardOrder[]>([]);

  // True when the order is this board's own walk-up, and forgets it.
  function claimOwnWalkup(order: BoardOrder): boolean {
    return ownWalkups.current.delete(`${order.booth_id}:${order.order_number}`);
  }

  function handleNewOrder(order: BoardOrder) {
    if (isNil(order.order_number)) return;
    refreshThrottled();
    if (order.source === "walkup") {
      if (claimOwnWalkup(order)) return;
      if (walkupsInFlight.current > 0) {
        heldWalkupAlerts.current.push(order);
        return;
      }
    }
    alertNewOrder(order);
  }

  function handleWalkupPlacing() {
    walkupsInFlight.current += 1;
  }

  // orderNumber is the permanent number, or null when the placement failed.
  function handleWalkupPlaced(boothId: string, orderNumber: string | null) {
    walkupsInFlight.current = Math.max(0, walkupsInFlight.current - 1);
    if (!isNil(orderNumber)) {
      const key = `${boothId}:${orderNumber}`;
      ownWalkups.current.add(key);
      setTimeout(() => ownWalkups.current.delete(key), 60_000);
    }
    const held = heldWalkupAlerts.current;
    heldWalkupAlerts.current = [];
    for (const order of held) {
      if (claimOwnWalkup(order)) continue;
      if (walkupsInFlight.current > 0) heldWalkupAlerts.current.push(order);
      else alertNewOrder(order);
    }
  }

  function alertNewOrder(order: BoardOrder) {
    if (isNil(order.order_number)) return;
    const shown = newOrderNumberRef.current(order.booth_id, order.order_number);
    void playSound(boardSettings.sound_id);
    toast(`New order #${shown} · ${order.customer_name}`);
    if (document.hidden) {
      bumpAway();
      if (boardSettings.desktop_notify) {
        void fireNewOrderNotification(
          boothName.get(order.booth_id) ?? "qkit",
          shown,
        );
      }
    }
  }

  return {
    handleNewOrder,
    handleWalkupPlacing,
    handleWalkupPlaced,
    newOrderNumberRef,
  };
}
