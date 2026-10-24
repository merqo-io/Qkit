"use server";

// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { boardSettingsSchema, orderBoothIdSchema } from "@/lib/schemas";
import { displayOrderNumber, isStaleOrderView } from "@/lib/orders";
import { firstOrderNumberToday } from "@/lib/daily-order-number";
import { readKeysetRows } from "@/lib/supabase/read-keyset";
import type { OrderStatus } from "@/lib/types";

export interface QueueDisplayOrder {
  // Real order_number — stable identity for detecting a status transition
  // across polls. Never shown; displayNumber is what the screen renders.
  orderNumber: string;
  displayNumber: string;
  status: OrderStatus;
}

type ActiveOrderRow = {
  order_number: string;
  status: OrderStatus;
  created_at: string;
  priority_bumped_at: string | null;
  ready_at?: string | null;
};

/**
 * How long a number stays on the screen after it was auto-cleared.
 *
 * A customer who was not looking at their phone the moment it turned ready had
 * nothing to check: the number left the screen as soon as it was marked
 * collected, and board_settings.ready_auto_clear_min marks one collected
 * whether or not anyone picked it up, so a number could vanish with the cup
 * still sitting on the shelf. Staff then field "is mine ready?" all service.
 * The number stays up for this long afterwards, which is its honest state:
 * still on the shelf, come and take it.
 *
 * Only for auto_completed orders (set by the ready auto-clear sweep alone).
 * "Mark Picked Up" or the customer's own pickup scan means the customer has
 * the order, so that number leaves the screen at once.
 */
const COLLECTED_GRACE_MS = 10 * 60_000;

// Ready group: most recently readied first, holding that place as it ages.
// Auto-clear keeps ready_at, so a grace-period number sorts the same way.
function sortReadyForDisplay(orders: ActiveOrderRow[]): ActiveOrderRow[] {
  const readyMs = (o: ActiveOrderRow) => Date.parse(o.ready_at ?? o.created_at);
  return [...orders].sort((a, b) => readyMs(b) - readyMs(a));
}

// Same ordering as sortActiveOrders (@/lib/orders) — a bumped order first
// (most-recently-bumped leading), then oldest-created first. Reimplemented
// on this narrower row shape rather than imported, since sortActiveOrders is
// typed against the full BoardOrder row and this query deliberately selects
// far fewer columns (no customer_name/items/payment — least privilege for a
// screen anyone near the booth can see).
function sortForDisplay(orders: ActiveOrderRow[]): ActiveOrderRow[] {
  return [...orders].sort((a, b) => {
    const aBumped = a.priority_bumped_at != null;
    const bBumped = b.priority_bumped_at != null;
    if (aBumped !== bBumped) return aBumped ? -1 : 1;
    if (aBumped && bBumped) {
      return (
        new Date(b.priority_bumped_at!).getTime() -
        new Date(a.priority_bumped_at!).getTime()
      );
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/**
 * Active (non-terminal) orders for one booth, shaped for the public TV
 * display: just enough to render "preparing" vs "ready" groups and detect a
 * ready transition between polls. No customer name/phone/payment/items.
 *
 * Service client, no per-viewer secret: unlike the token-gated customer
 * status page, this screen is meant to be readable by anyone near the booth
 * — booth_id alone is the read key. That trade isn't new: getWaitEstimate
 * (../[orderNumber]/status-actions.ts) already reads every active order for
 * a booth the same way, just reached through a token-gated entry point.
 */
export async function getBoothQueueDisplay(
  boothId: string,
): Promise<QueueDisplayOrder[] | null> {
  if (!orderBoothIdSchema.safeParse(boothId).success) return null;
  const ip = clientIp(await headers());
  if (!(await rateLimit(`queue-display:${boothId}:${ip}`, 60, 60))) return null;
  const supabase = await createServiceClient();

  const { data: booth, error: boothError } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", boothId)
    .maybeSingle();
  if (boothError) {
    console.error(
      "getBoothQueueDisplay: booth read failed",
      boothError.message,
    );
    return null;
  }
  if (!booth) return null;

  // Daily order-number reset (board_settings.daily_order_number_reset) —
  // same display-only rule the vendor board and customer status page apply
  // (see displayOrderNumber). Decorative: any failure here degrades to the
  // real order_number rather than breaking the page.
  let baseline: string | null = null;
  const { data: vendor } = await supabase
    .from("vendors")
    .select("board_settings")
    .eq("id", booth.vendor_id)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  if (settings.success && settings.data.daily_order_number_reset) {
    baseline = await firstOrderNumberToday(supabase, boothId);
  }

  const cutoff = Date.now() - COLLECTED_GRACE_MS;
  const cutoffIso = new Date(cutoff).toISOString();
  const query = supabase
    .from("orders")
    .select(
      "id, order_number, status, created_at, priority_bumped_at, ready_at, completed_at, auto_completed",
    )
    .eq("booth_id", boothId)
    .or(
      `status.in.(pending,confirmed,preparing,ready),and(status.eq.completed,completed_at.gte.${cutoffIso},auto_completed.is.true)`,
    )
    .or("payment_status.neq.pending,source.neq.qr")
    .order("id");
  let orders;
  try {
    orders = await readKeysetRows((afterId) => {
      if (afterId !== null) query.gt("id", afterId);
      return query.limit(1000);
    });
  } catch {
    console.error(
      "getBoothQueueDisplay: orders read failed",
      "Could not load complete query results",
    );
    return null;
  }

  // An auto-cleared order keeps its place on the screen for
  // COLLECTED_GRACE_MS, shown as ready, which is what it still is from the
  // customer's side: the cup is on the shelf. Past that it drops off, so the
  // screen does not fill up with a whole service's numbers. One marked picked
  // up is gone at once: the customer has it.
  // An order left unfinished on the vendor's board from an earlier day is
  // still "preparing" as far as the row knows, and would sit on this public
  // screen as a number nobody is waiting for. Same age line the customer's
  // own status page draws (isStaleOrderView): the vendor still sees it on the
  // board to clear, the queue does not.
  const nonNullOrders = (orders ?? [])
    .filter(
      (o): o is typeof o & { order_number: string } => o.order_number != null,
    )
    .filter((o) => !isStaleOrderView(o.created_at, Date.now()))
    .filter((o) => {
      if (o.status !== "completed") return true;
      if (o.auto_completed !== true) return false;
      const at = o.completed_at == null ? NaN : Date.parse(o.completed_at);
      return Number.isNaN(at) ? false : at >= cutoff;
    });
  const shownReady = (o: ActiveOrderRow) =>
    o.status === "ready" || o.status === "completed";
  const sorted = [
    ...sortReadyForDisplay(nonNullOrders.filter(shownReady)),
    ...sortForDisplay(nonNullOrders.filter((o) => !shownReady(o))),
  ];
  return sorted.map((o) => ({
    orderNumber: o.order_number,
    displayNumber: displayOrderNumber(o.order_number, baseline),
    status: o.status === "completed" ? "ready" : o.status,
  }));
}
