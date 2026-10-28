import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";
import { isNil } from "@/lib/utils";

// Explicit column list for every vendor-board order read (initial load +
// realtime resync) — omits access_token, the customer's own status-page
// secret, which the board never needs (least privilege). Single source so
// the two read sites can't drift out of sync with each other.
export const BOARD_ORDER_COLUMNS =
  "id, booth_id, order_number, customer_name, items, status, total_cents, payment_status, payment_method_kind, paid_at, payment_proof_path, payment_proof_hash, print_status, print_status_updated_at, created_at, ready_at, completed_at, updated_at, idempotency_key, priority_bumped_at, source, auto_completed" as const;

// A finished order — off the active board, no further transitions. Single
// source of truth for the "is this done" check that several views need.
export const TERMINAL_STATUSES: OrderStatus[] = ["completed", "cancelled"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Forward transition keyed by an order's CURRENT status: where the advance
 * button takes it (`next`) and what the button says (`label` = intent, not the
 * raw status name). A status with no entry has no legal forward move. Shared by
 * the order board (button) and the `advanceOrder` server action (patch) so both
 * derive the next state from one source.
 */
export const ADVANCE: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  pending: { next: "preparing", label: "Start now" },
  confirmed: { next: "preparing", label: "Start now" },
  preparing: { next: "ready", label: "Mark Ready" },
  ready: { next: "completed", label: "Mark Picked Up" },
};

/**
 * A still-pending order with an outstanding payment claim gets the merged
 * "Mark paid & start" review action instead of separate confirm-payment and
 * advance buttons (order-card.tsx) — there's no real scenario where a
 * vendor confirms payment without also starting the order. Keyed on order
 * state, not source: a walk-up order left unpaid at creation needs the same
 * merge as a QR order. Pure.
 */
export function needsPaymentReview(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): boolean {
  return (
    status === "pending" &&
    paymentStatus !== "confirmed" &&
    paymentStatus !== "not_required"
  );
}

// Active-board ordering. Lower rank = higher on the board. Only the statuses
// that appear on the active board are ranked meaningfully; terminal/legacy
// statuses fall to the end so a stray order never sorts above live work.
const STATUS_RANK: Record<OrderStatus, number> = {
  preparing: 0,
  ready: 1,
  pending: 2,
  confirmed: 2,
  completed: 3,
  cancelled: 3,
};

/**
 * The four stages a customer watches their order pass through, in order. All
 * four are shown from the moment the order is placed, so the end is in sight
 * the whole time: people wait more patiently for something with a visible
 * finish than for a status that might be the last one or might not.
 *
 * Ready and Collected are separate stages. Merged, the page ended on "ready",
 * which told a customer nothing about whether the stall knew they had come, and
 * left a collected order looking exactly like one still sitting on the shelf.
 */
export const ORDER_STAGES = [
  "received",
  "preparing",
  "ready",
  "collected",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/**
 * How far along ORDER_STAGES an order is, or -1 for a cancelled one, which has
 * no place on the track. pending and confirmed both sit on "received": from the
 * customer's side the order is in and nothing more is asked of them, whichever
 * of the two the stall's own workflow happens to be in.
 */
export function orderStageIndex(status: OrderStatus): number {
  switch (status) {
    case "pending":
    case "confirmed":
      return 0;
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "completed":
      return 3;
    default:
      return -1;
  }
}

export type AgeTone = "fresh" | "aging" | "overdue";

/**
 * Ticket-aging tone for the live board. Defaults (5 min aging, 10 min overdue)
 * match the stock board_settings default; a vendor can set both independently
 * from /dashboard/settings. Pair the tone with the elapsed text + an icon in
 * the UI — never rely on color alone (WCAG 1.4.1). Pure.
 */
export function orderAgeTone(
  elapsedMs: number,
  agingMin = 5,
  overdueMin = 10,
): AgeTone {
  const min = elapsedMs / 60_000;
  if (min < agingMin) return "fresh";
  if (min < overdueMin) return "aging";
  return "overdue";
}

/** Whole-minute elapsed label for a ticket, floored at 0. */
/**
 * A waiting time short enough to read at a glance on a ticket: minutes under
 * an hour, hours and minutes under a day, whole days after that. A ticket left
 * open over a weekend used to read "9802m".
 */
export function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const rem = minutes % 60;
    const hours = Math.floor(minutes / 60);
    return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
  }
  return `${Math.floor(minutes / (24 * 60))}d`;
}

export function elapsedMinutes(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

/**
 * Human "time since" label for a customer (e.g. "just now", "5 min ago",
 * "1 hr 20 min ago"). Coarse on purpose — the customer wants a sense that the
 * wait is tracked, not second precision. Floored at 0. Pure.
 */
export function elapsedLabel(elapsedMs: number): string {
  const min = elapsedMinutes(elapsedMs);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  // Past two days, count days. An order reopened weeks later (see
  // isStaleOrderView) otherwise reads as "700 hr ago", which a person has to
  // divide in their head before realising the order is not today's.
  if (hrs >= 48) {
    const days = Math.floor(hrs / 24);
    return `${days} days ago`;
  }
  const rem = min % 60;
  return rem === 0 ? `${hrs} hr ago` : `${hrs} hr ${rem} min ago`;
}

/** Hours after which a reopened order-status page counts as a stale view. */
export const STALE_ORDER_VIEW_HOURS = 12;

/**
 * Whether an order-status page is being viewed long after the order was
 * placed. A repeat customer's browser can restore an earlier visit's status
 * URL (history, a restored tab, a home-screen shortcut), and that page still
 * looks live: a big number, a status line, a progress bar, for an order the
 * vendor served weeks ago. The customer then waits for a screen that will
 * never change, and the vendor has no way to reach them, since the order they
 * are actually queued for is a different row. The number looks wrong too:
 * displayOrderNumber returns the raw, permanent order_number whenever the
 * daily rank would be non-positive, so the page shows a 4-digit number beside
 * a vendor board counting 001, 002, 003.
 *
 * 12 hours rather than "before the start of the SGT day", so an order placed
 * at 23:50 and checked at 00:10 is not called stale.
 */
export function isStaleOrderView(createdAt: string, nowMs: number): boolean {
  const placed = Date.parse(createdAt);
  if (Number.isNaN(placed)) return false;
  return nowMs - placed > STALE_ORDER_VIEW_HOURS * 60 * 60_000;
}

/** How long an unpaid QR order waits for its payment before it is given up. */
export const ABANDONED_PAYMENT_MS = 30 * 60_000;

/**
 * Whether an order still waiting for its payment has waited past
 * ABANDONED_PAYMENT_MS. The sweeps cancel such an order, but a sweep is not
 * instant and older rows predate it, so the pay page and the claim action ask
 * this themselves: a payment link reopened days later must not take money, or
 * land a fresh "says paid" on the vendor's board, for an order nobody is
 * making.
 */
export function isAbandonedPayment(createdAt: string, nowMs: number): boolean {
  const placed = Date.parse(createdAt);
  if (Number.isNaN(placed)) return false;
  return nowMs - placed > ABANDONED_PAYMENT_MS;
}

/**
 * When qkit gives up on an order's payment: ABANDONED_PAYMENT_MS after it was
 * placed, as ISO 8601 UTC. Sent to paykit as the checkout's `expires_at`, so a
 * payment paykit detects later is never matched to an order qkit abandoned.
 * Taken from `createdAt`, never from now, so every call for one order (a late
 * reload, a confirm that re-creates the checkout) sends the same time. Null
 * for a date it cannot read; paykit then stores no expiry.
 */
export function paymentDeadline(createdAt: string): string | null {
  const placed = Date.parse(createdAt);
  if (Number.isNaN(placed)) return null;
  return new Date(placed + ABANDONED_PAYMENT_MS).toISOString();
}

/**
 * The DB patch for advancing an order to `next`: the new status plus the
 * transition timestamp it stamps — ready_at on entering "ready", completed_at on
 * "completed", neither otherwise. Pure: `nowIso` is passed in (no Date here).
 */
export function buildAdvancePatch(
  next: OrderStatus,
  nowIso: string,
): {
  status: OrderStatus;
  ready_at?: string;
  completed_at?: string;
} {
  if (next === "ready") return { status: next, ready_at: nowIso };
  if (next === "completed") {
    return { status: next, completed_at: nowIso };
  }
  return { status: next };
}

export type AgeSortOrder = "earliest" | "latest";

/**
 * Sort active orders for the vendor board display: a manually bumped order
 * (vendor's explicit "help this one now" override — most-recently-bumped
 * first) always leads, then every order by created_at — oldest first
 * ("earliest", the default) or newest first ("latest"). created_at is used
 * rather than order_number because order numbers are per-booth and not
 * globally ordered, and is never touched by a bump — ticket-aging display
 * stays accurate regardless of bump state.
 *
 * Deliberately status-agnostic: an old "ready" order sitting unclaimed is
 * exactly the kind of "been waiting longest" case a vendor wants surfaced
 * during a rush, so it can't be pinned below every "preparing" order just
 * because of its status. (The kitchen's own build-priority — what to cook
 * next — is a separate concern; see `ordersAheadOf`, which stays
 * status-aware for the customer-facing wait estimate.) Pure + non-mutating.
 */
/**
 * Orders that a later order has already overtaken: still being worked on, while
 * something ordered after them is already ready or collected.
 *
 * A barista calls "number 10 is done" across a noisy counter and the person on
 * the board does not hear it, so 10 never gets marked while 15 does. Nothing on
 * the board said so: a card that has sat there unmarked looks much like one just
 * started, and the customer for 10 is left waiting on a screen that never
 * changes. Scoped per booth, since two booths number and serve independently,
 * and compared on created_at, which is the order the counter works in.
 *
 * Returns ids rather than a mutated list so the caller can flag a card without
 * disturbing sortActiveOrders' own ordering, including a manual priority bump.
 */
export function overtakenOrderIds(orders: BoardOrder[]): Set<string> {
  const newestDoneAt = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "ready" && o.status !== "completed") continue;
    const at = new Date(o.created_at).getTime();
    const seen = newestDoneAt.get(o.booth_id);
    if (seen === null || seen === undefined || at > seen)
      newestDoneAt.set(o.booth_id, at);
  }

  const overtaken = new Set<string>();
  for (const o of orders) {
    if (isTerminal(o.status) || o.status === "ready") continue;
    const cutoff = newestDoneAt.get(o.booth_id);
    if (isNil(cutoff)) continue;
    if (new Date(o.created_at).getTime() < cutoff) overtaken.add(o.id);
  }
  return overtaken;
}

export function sortActiveOrders(
  orders: BoardOrder[],
  order: AgeSortOrder = "earliest",
): BoardOrder[] {
  const dir = order === "latest" ? -1 : 1;
  return [...orders].sort((a, b) => {
    const aBumped =
      a.priority_bumped_at !== null && a.priority_bumped_at !== undefined;
    const bBumped =
      b.priority_bumped_at !== null && b.priority_bumped_at !== undefined;
    if (aBumped !== bBumped) return aBumped ? -1 : 1;
    if (aBumped && bBumped) {
      return (
        new Date(b.priority_bumped_at!).getTime() -
        new Date(a.priority_bumped_at!).getTime()
      );
    }
    return (
      dir *
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    );
  });
}

/**
 * How many orders rank strictly ahead of `target` in the kitchen's own
 * build queue — status rank (preparing before ready), then bump state, then
 * created_at/bump time. This is the customer-facing wait estimate, a
 * separate concern from the vendor board's display order
 * (`sortActiveOrders`, which is deliberately status-agnostic so a vendor
 * can triage by pure age): what matters here is what the kitchen still has
 * to *do*, not how the board is currently sorted on screen. Excludes
 * `target` itself and excludes exact ties (undefined ordering, safer to
 * under-count by one than over-promise). Pure.
 */
export function ordersAheadOf(
  orders: {
    id: string;
    status: OrderStatus;
    created_at: string;
    priority_bumped_at?: string | null;
  }[],
  target: {
    id: string;
    status: OrderStatus;
    created_at: string;
    priority_bumped_at?: string | null;
  },
): number {
  const targetRank = STATUS_RANK[target.status];
  const targetBumped =
    target.priority_bumped_at !== null &&
    target.priority_bumped_at !== undefined;
  const targetTime = new Date(
    target.priority_bumped_at ?? target.created_at,
  ).getTime();
  return orders.filter((o) => {
    if (o.id === target.id) return false;
    const rank = STATUS_RANK[o.status];
    if (rank < targetRank) return true;
    if (rank > targetRank) return false;
    const oBumped =
      o.priority_bumped_at !== null && o.priority_bumped_at !== undefined;
    if (oBumped !== targetBumped) return oBumped;
    const oTime = new Date(o.priority_bumped_at ?? o.created_at).getTime();
    // Bumped orders rank most-recently-bumped-first (descending); everyone
    // else stays FIFO (ascending) — matches sortActiveOrders exactly.
    return oBumped ? oTime > targetTime : oTime < targetTime;
  }).length;
}

/**
 * Coarse "ready in ~N min" label for a customer wait estimate — rounds to
 * the nearest minute (never false second-precision) and reads as "any
 * moment" near zero rather than "~0 min". Pure.
 */
export function estimateLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "Any moment now";
  return `~${minutes} min`;
}

/**
 * Range-based "X-Y min" wait estimate rather than a single precise number —
 * research on waiting-line psychology: a point estimate reads as a promise,
 * and an average-based estimate that's sometimes wrong erodes trust more
 * than a range that was upfront about its own uncertainty. ±25% around the
 * point estimate, floored so a small estimate doesn't degenerate to a
 * zero-width band (e.g. "3-3 min"). Pure.
 */
export function estimateRangeLabel(seconds: number): string {
  const point = Math.round(seconds / 60);
  if (point < 1) return "Any moment now";
  const spread = Math.max(1, Math.round(point * 0.25));
  const lo = Math.max(1, point - spread);
  const hi = point + spread;
  return `${lo}-${hi} min`;
}

/**
 * Fallback for when there isn't enough recent order history to trust a
 * time-based estimate (see estimateWaitSeconds's minimum sample size).
 * Waiting-line research says an unexplained/silent wait feels worse than an
 * explained one — showing queue position instead of hiding the estimate
 * line entirely still answers "how much longer, roughly" without false
 * precision. Pure.
 */
export function queuePositionLabel(ordersAhead: number): string {
  if (ordersAhead <= 0) return "You're next in line";
  if (ordersAhead === 1) return "1 order ahead of you";
  return `${ordersAhead} orders ahead of you`;
}

/**
 * The vendor-facing "daily reset" display number for an order (board_settings
 * .daily_order_number_reset) — its position among the booth's orders placed
 * so far today (1-indexed), computed from the permanent `order_number`
 * relative to `baselineNumber` (the booth's first order_number of the SGT
 * day, from `sgtStartOfDayIso`). Immutable once computed: it never shifts as
 * later orders complete or drop off the active board, since both inputs
 * (order_number, created_at) are frozen at creation by the 0032 freeze
 * trigger — this is arithmetic on fixed values, not a live recount. Falls
 * back to the real, permanent order_number when the setting is off
 * (`baselineNumber` null) or the arithmetic would be non-positive (a data
 * inconsistency, not something to ever show as "#0" or negative). Zero-padded
 * to 3 digits like a ticket counter ("003", not "3") — grows past that
 * rather than truncating, same never-shrink convention as the real
 * order_number's own 4-digit pad (migration 0063). Pure.
 */
export function displayOrderNumber(
  orderNumber: string,
  baselineNumber: string | null,
): string {
  if (baselineNumber === null) return orderNumber;
  const rank = Number(orderNumber) - Number(baselineNumber) + 1;
  return rank > 0 ? String(rank).padStart(3, "0") : orderNumber;
}

/**
 * Splits a display order number into its leading digits and its trailing
 * one, so a vendor using a physical pickup-shelf-slot system (slotting an
 * order by the last digit of its number, e.g. bubble-tea-chain style) can
 * have that digit visually emphasized wherever the number is shown. Pure
 * string split — a single-character `orderNumber` returns an empty `lead`.
 * `null` (a payment-required order still awaiting claim, migration 0087,
 * has no order_number yet) returns both fields empty rather than throwing —
 * callers render this before an order necessarily has a number at all.
 */
export function splitTrailingDigit(orderNumber: string | null): {
  lead: string;
  last: string;
} {
  if (orderNumber === null) return { lead: "", last: "" };
  return {
    lead: orderNumber.slice(0, -1),
    last: orderNumber.slice(-1),
  };
}
