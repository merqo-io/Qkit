// Customer-side order history. Customers are unauthenticated, so there is no
// server record tying an order to a device — if they close the tab the status
// URL is lost. We stash placed orders in localStorage so the booth page can
// surface "track your recent order" links. Best-effort only: private mode or a
// cleared cache simply yields an empty list.

import type { ReorderLine } from "@/lib/reorder";

export interface RecentOrder {
  boothId: string;
  // Absent while an order that pays first waits for its number (numbering is
  // deferred until payment). Such an entry is reached through its token's pay
  // step, and gains its number when the status page opens with that token.
  orderNumber?: string;
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

// An entry the list can link to: by its number, or by its token while it
// has no number yet.
function reachable(o: RecentOrder): boolean {
  if (o.orderNumber !== undefined) return typeof o.orderNumber === "string";
  return typeof o.token === "string" && o.token.length > 0;
}

// Same order: same booth, and the same number or the same token. The token
// matters while one side has no number yet.
function sameOrder(a: RecentOrder, b: Omit<RecentOrder, "placedAt">): boolean {
  if (a.boothId !== b.boothId) return false;
  if (a.orderNumber !== undefined && a.orderNumber === b.orderNumber)
    return true;
  return a.token !== undefined && a.token === b.token;
}

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
        reachable(o as RecentOrder) &&
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
    const deduped = read().filter((o) => !sameOrder(o, order));
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
 * list, so the list names the order the way the customer last saw it. With the
 * page's token it also numbers an entry recorded before payment, which the
 * list knew only by that token.
 */
export function noteDisplayNumber(
  boothId: string,
  orderNumber: string,
  displayNumber: string,
  token?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const all = read();
    const entry = all.find((o) =>
      sameOrder(o, { boothId, orderNumber, token, customerName: "" }),
    );
    if (
      !entry ||
      (entry.orderNumber === orderNumber &&
        entry.displayNumber === displayNumber)
    )
      return;
    entry.orderNumber = orderNumber;
    entry.displayNumber = displayNumber;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode / quota) — silently skip.
  }
}
