// Customer-side order history. Customers are unauthenticated, so there is no
// server record tying an order to a device — if they close the tab the status
// URL is lost. We stash placed orders in localStorage so the booth page can
// surface "track your recent order" links. Best-effort only: private mode or a
// cleared cache simply yields an empty list.

import type { ReorderLine } from "@/lib/reorder";

export interface RecentOrder {
  boothId: string;
  orderNumber: string;
  // The number the status page shows the customer: the day's rank when the
  // stall numbers from 1 each day, else the same as orderNumber. Learned on
  // the status page, so an entry that page never opened has none.
  displayNumber?: string;
  customerName: string;
  // Per-order access token (gates the status page). Optional: entries stored
  // before this existed simply can't deep-link (they'll 404 on the token check).
  token?: string;
  // epoch ms
  placedAt: number;
  // Compact snapshot of the order's lines, so the list can offer "Reorder"
  // without a server round-trip. Optional: entries placed before this existed
  // (and any future write that omits it) simply have no reorder button.
  items?: ReorderLine[];
}

const KEY = "qkit:recent-orders";
const MAX = 10;

function read(): RecentOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is RecentOrder =>
        !!o &&
        typeof o === "object" &&
        typeof (o as RecentOrder).boothId === "string" &&
        typeof (o as RecentOrder).orderNumber === "string" &&
        typeof (o as RecentOrder).customerName === "string" &&
        typeof (o as RecentOrder).placedAt === "number",
    );
  } catch {
    return [];
  }
}

export function getRecentOrders(): RecentOrder[] {
  // Newest first.
  return read().sort((a, b) => b.placedAt - a.placedAt);
}

export function getRecentOrdersForBooth(boothId: string): RecentOrder[] {
  return getRecentOrders().filter((o) => o.boothId === boothId);
}

export function addRecentOrder(order: Omit<RecentOrder, "placedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const deduped = read().filter(
      (o) =>
        !(o.boothId === order.boothId && o.orderNumber === order.orderNumber),
    );
    // Stamp the time here (in a plain module) rather than in the calling
    // component, where Date.now() trips react-hooks/purity.
    const next = [{ ...order, placedAt: Date.now() }, ...deduped].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode / quota) — silently skip.
  }
}

/**
 * Records the number the status page is showing for an order already in the
 * list, so the list names the order the way the customer last saw it.
 */
export function noteDisplayNumber(
  boothId: string,
  orderNumber: string,
  displayNumber: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const all = read();
    const entry = all.find(
      (o) => o.boothId === boothId && o.orderNumber === orderNumber,
    );
    if (!entry || entry.displayNumber === displayNumber) return;
    entry.displayNumber = displayNumber;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode / quota) — silently skip.
  }
}
