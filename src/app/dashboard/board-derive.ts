import {
  needsPaymentReview,
  isTerminal,
  sortActiveOrders,
  type AgeSortOrder,
} from "@/lib/orders";
import type { BoardOrder } from "@/lib/types";
import type { BoothView } from "./board-booths";

/**
 * The orders on the board, oldest or newest first. A QR order still waiting on
 * its payment stays off, and a terminal one stays on only while its undo
 * window is open.
 */
export function activeOrders(
  orders: BoardOrder[],
  undoWindowIds: ReadonlySet<string>,
  sortOrder: AgeSortOrder,
) {
  return sortActiveOrders(
    orders.filter(
      (o) =>
        (!isTerminal(o.status) || undoWindowIds.has(o.id)) &&
        !(o.payment_status === "pending" && o.source === "qr"),
    ),
    sortOrder,
  );
}

/**
 * The visible orders split into the board's two columns and the id groups the
 * batch controls act on.
 */
export function groupVisibleOrders(
  visible: BoardOrder[],
  booths: BoothView[],
  selectedIds: ReadonlySet<string>,
) {
  const preparingIds = visible
    .filter((o) => o.status === "preparing")
    .map((o) => o.id);
  const readyIds = visible.filter((o) => o.status === "ready").map((o) => o.id);
  const batchableIds = [...preparingIds, ...readyIds];
  // Arrival alone does not accept an order into preparation.
  const incoming = visible.filter(
    (o) => o.status === "pending" || o.status === "confirmed",
  );
  const accepted = visible.filter(
    (o) => o.status !== "pending" && o.status !== "confirmed",
  );
  // Incoming orders one tap can start together: nothing to check on them
  // first. An order whose payment is unconfirmed needs a look at its proof,
  // and a booth that waits for the customer's arrival is waiting on purpose.
  const waitsForArrival = new Set(
    booths.filter((b) => b.requires_arrival_confirm).map((b) => b.id),
  );
  const startableIds = incoming
    .filter(
      (o) =>
        o.status === "pending" &&
        !needsPaymentReview(o.status, o.payment_status) &&
        !waitsForArrival.has(o.booth_id),
    )
    .map((o) => o.id);
  return {
    preparingIds,
    readyIds,
    batchableIds,
    allSelected: batchableIds.every((id) => selectedIds.has(id)),
    // Counted against what is on the board now, not the raw selection: an
    // order ticked while preparing may have been marked ready from another
    // device.
    tickedPreparing: preparingIds.filter((id) => selectedIds.has(id)),
    tickedReady: readyIds.filter((id) => selectedIds.has(id)),
    // What a batch undo hands back to revertOrderAdvance for each order.
    paymentById: new Map(visible.map((o) => [o.id, o.payment_status])),
    incoming,
    accepted,
    waitsForArrival,
    startableIds,
  };
}

/**
 * The booth the walk-up dialog opens on. With no booth filtered, start on the
 * booth set up for walk-ups, not on whichever booth happens to be listed first.
 */
export function walkupStartBoothId(
  booths: BoothView[],
  effectiveFilter: string,
  boothIsActive: (b: BoothView) => boolean,
) {
  if (effectiveFilter !== "all") return effectiveFilter;
  return booths.find((b) => b.walkup_default && boothIsActive(b))?.id;
}
