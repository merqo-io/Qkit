import type { OrderStatus } from "@/lib/types";
import { isTerminal } from "@/lib/orders";

// A same-day F&B queue — nothing legitimately active should sit this long.
export const STUCK_THRESHOLD_MS = 30 * 60_000;

export type OrderStatusEventLite = {
  order_id: string;
  to_status: string;
  created_at: string;
};

export type OrderForStatusSince = {
  id: string;
  status: OrderStatus;
  created_at: string;
};

/**
 * When did each order enter its CURRENT status? `order_status_events`
 * (migration 0078) only logs a transition made via advanceOrder/
 * revertOrderAdvance/cancelOrder/sweepReadyOrders (src/app/dashboard/order-*-actions.ts),
 * placement itself (place_order/place_walkup_order, SQL)
 * writes no row, so an order that's never advanced has no event at all and
 * has been in its current ("pending") status since order.created_at. When
 * events exist, the latest one's created_at is the current status's start
 * time, but only when its to_status still matches the order's live status —
 * recordOrderStatusEvent (src/lib/audit.ts) is best-effort and can silently
 * fail, so a stale/mismatched latest event is untrustworthy and falls back
 * to created_at too (safer to over-flag a possibly-stuck order on bad data
 * than to hide a real one behind it). Pure.
 */
export function statusSinceByOrder(
  orders: OrderForStatusSince[],
  events: OrderStatusEventLite[],
): Map<string, string> {
  const latestByOrder = new Map<string, OrderStatusEventLite>();
  for (const e of events) {
    const prev = latestByOrder.get(e.order_id);
    if (!prev || e.created_at > prev.created_at)
      latestByOrder.set(e.order_id, e);
  }
  const result = new Map<string, string>();
  for (const o of orders) {
    const latest = latestByOrder.get(o.id);
    result.set(
      o.id,
      latest && latest.to_status === o.status
        ? latest.created_at
        : o.created_at,
    );
  }
  return result;
}

export type StuckOrderCandidate = {
  id: string;
  booth_id: string;
  status: OrderStatus;
  status_since: string;
};

export type StuckOrder = StuckOrderCandidate & { stuckForMs: number };

/**
 * Orders sitting in a non-terminal status (pending/confirmed/preparing/
 * ready — anything `isTerminal` says isn't done) for longer than
 * STUCK_THRESHOLD_MS. Sorted longest-stuck first. Pure: `nowMs` is passed
 * in, no Date/DB here.
 */
export function findStuckOrders(
  orders: StuckOrderCandidate[],
  nowMs: number,
): StuckOrder[] {
  return orders
    .filter((o) => !isTerminal(o.status))
    .map((o) => ({ ...o, stuckForMs: nowMs - Date.parse(o.status_since) }))
    .filter((o) => o.stuckForMs > STUCK_THRESHOLD_MS)
    .sort((a, b) => b.stuckForMs - a.stuckForMs);
}
