import { describe, it, expect } from "vitest";
import {
  ABANDONED_PAYMENT_MS,
  isAbandonedPayment,
  paymentDeadline,
  isTerminal,
  sortActiveOrders,
  orderAgeTone,
  elapsedMinutes,
  elapsedLabel,
  orderStageIndex,
  ORDER_STAGES,
  buildAdvancePatch,
  ordersAheadOf,
  estimateLabel,
  estimateRangeLabel,
  queuePositionLabel,
  displayOrderNumber,
  overtakenOrderIds,
  isStaleOrderView,
  STALE_ORDER_VIEW_HOURS,
  splitTrailingDigit,
  needsPaymentReview,
} from "./orders";
import type { Order, OrderStatus } from "./types";

const MIN = 60_000;

function order(over: Partial<Order>): Order {
  return {
    id: "id",
    booth_id: "booth",
    order_number: "0001",
    customer_name: "Cust",
    items: [],
    total_cents: 0,
    status: "preparing",
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: "2026-06-12T10:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T10:00:00Z",
    idempotency_key: null,
    access_token: "tok-test",
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...over,
  };
}

describe("sortActiveOrders", () => {
  it('defaults to "earliest": oldest created_at first, regardless of status', () => {
    const out = sortActiveOrders([
      order({
        id: "ready-new",
        status: "ready",
        created_at: "2026-06-12T10:05:00Z",
      }),
      order({
        id: "prep-old",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ]);
    // The ready order is newer, but a vendor triaging "who's waited
    // longest" needs the older order first even though its status differs —
    // status is intentionally not part of this ordering (see ordersAheadOf
    // for the status-aware kitchen-priority queue).
    expect(out.map((o) => o.id)).toEqual(["prep-old", "ready-new"]);
  });

  it("orders a mixed multi-booth, mixed-status set purely by age", () => {
    const out = sortActiveOrders([
      order({
        id: "ready-old",
        booth_id: "b1",
        status: "ready",
        created_at: "2026-06-12T10:01:00Z",
      }),
      order({
        id: "prep-new",
        booth_id: "b2",
        status: "preparing",
        created_at: "2026-06-12T10:09:00Z",
      }),
      order({
        id: "ready-new",
        booth_id: "b2",
        status: "ready",
        created_at: "2026-06-12T10:08:00Z",
      }),
      order({
        id: "prep-old",
        booth_id: "b1",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual([
      "prep-old",
      "ready-old",
      "ready-new",
      "prep-new",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      order({
        id: "r",
        status: "ready",
        created_at: "2026-06-12T10:05:00Z",
      }),
      order({
        id: "p",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
      }),
    ];
    sortActiveOrders(input);
    expect(input.map((o) => o.id)).toEqual(["r", "p"]);
  });

  it("ranks a bumped order ahead of older non-bumped orders", () => {
    const out = sortActiveOrders([
      order({
        id: "old",
        created_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "bumped",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: "2026-06-12T10:06:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["bumped", "old"]);
  });

  it("ranks multiple bumped orders by most-recently-bumped first", () => {
    const out = sortActiveOrders([
      order({
        id: "bumped-first",
        priority_bumped_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "bumped-second",
        priority_bumped_at: "2026-06-12T10:05:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["bumped-second", "bumped-first"]);
  });

  it("keeps a bumped order ahead even of an older order in a different status", () => {
    const out = sortActiveOrders([
      order({
        id: "ready-old",
        status: "ready",
        created_at: "2026-06-12T09:00:00Z",
      }),
      order({
        id: "prep-bumped",
        status: "preparing",
        created_at: "2026-06-12T10:05:00Z",
        priority_bumped_at: "2026-06-12T10:06:00Z",
      }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["prep-bumped", "ready-old"]);
  });

  it('order: "latest" reverses to newest-first, still status-agnostic', () => {
    const out = sortActiveOrders(
      [
        order({
          id: "old",
          status: "preparing",
          created_at: "2026-06-12T10:00:00Z",
        }),
        order({
          id: "new",
          status: "ready",
          created_at: "2026-06-12T10:05:00Z",
        }),
      ],
      "latest",
    );
    expect(out.map((o) => o.id)).toEqual(["new", "old"]);
  });

  it('order: "latest" still keeps a bumped order first', () => {
    const out = sortActiveOrders(
      [
        order({
          id: "ready-new",
          status: "ready",
          created_at: "2026-06-12T10:05:00Z",
        }),
        order({
          id: "prep-bumped",
          status: "preparing",
          created_at: "2026-06-12T10:01:00Z",
          priority_bumped_at: "2026-06-12T10:02:00Z",
        }),
      ],
      "latest",
    );
    expect(out.map((o) => o.id)).toEqual(["prep-bumped", "ready-new"]);
  });
});

describe("orderAgeTone", () => {
  it("fresh below aging, aging up to overdue, overdue at/over (5m/10m defaults)", () => {
    expect(orderAgeTone(2 * MIN)).toBe("fresh");
    expect(orderAgeTone(4 * MIN)).toBe("fresh");
    expect(orderAgeTone(5 * MIN)).toBe("aging");
    expect(orderAgeTone(9 * MIN)).toBe("aging");
    expect(orderAgeTone(10 * MIN)).toBe("overdue");
    expect(orderAgeTone(30 * MIN)).toBe("overdue");
  });

  it("respects independent aging/overdue thresholds", () => {
    expect(orderAgeTone(3 * MIN, 2, 4)).toBe("aging");
    expect(orderAgeTone(4 * MIN, 2, 4)).toBe("overdue");
    expect(orderAgeTone(1 * MIN, 2, 4)).toBe("fresh");
  });
});

describe("elapsedMinutes", () => {
  it("floors to whole minutes, never negative", () => {
    expect(elapsedMinutes(90_000)).toBe(1);
    expect(elapsedMinutes(59_000)).toBe(0);
    expect(elapsedMinutes(-5000)).toBe(0);
  });
});

describe("elapsedLabel", () => {
  it("says 'just now' under a minute (and for negative clock skew)", () => {
    expect(elapsedLabel(0)).toBe("just now");
    expect(elapsedLabel(59_000)).toBe("just now");
    expect(elapsedLabel(-5000)).toBe("just now");
  });

  it("counts minutes under an hour", () => {
    expect(elapsedLabel(60_000)).toBe("1 min ago");
    expect(elapsedLabel(5 * 60_000)).toBe("5 min ago");
    expect(elapsedLabel(59 * 60_000)).toBe("59 min ago");
  });

  it("switches to hours (+ minutes) at an hour", () => {
    expect(elapsedLabel(60 * 60_000)).toBe("1 hr ago");
    expect(elapsedLabel(80 * 60_000)).toBe("1 hr 20 min ago");
    expect(elapsedLabel(125 * 60_000)).toBe("2 hr 5 min ago");
    expect(elapsedLabel(47 * 60 * 60_000)).toBe("47 hr ago");
  });

  it("switches to days at two days", () => {
    expect(elapsedLabel(48 * 60 * 60_000)).toBe("2 days ago");
    expect(elapsedLabel(700 * 60 * 60_000)).toBe("29 days ago");
  });
});

describe("isStaleOrderView", () => {
  const placed = "2026-10-05T04:00:00Z";
  const placedMs = Date.parse(placed);

  it("is false for an order placed minutes ago", () => {
    expect(isStaleOrderView(placed, placedMs + 5 * 60_000)).toBe(false);
  });

  it("is false across midnight SGT, so a late-night order stays current", () => {
    // 23:50 SGT placed, checked 00:10 SGT: a different calendar day, 20
    // minutes old.
    expect(
      isStaleOrderView(
        "2026-10-05T15:50:00Z",
        Date.parse("2026-10-05T16:10:00Z"),
      ),
    ).toBe(false);
  });

  it("is true once the order is older than the stale window", () => {
    expect(
      isStaleOrderView(
        placed,
        placedMs + (STALE_ORDER_VIEW_HOURS + 1) * 3_600_000,
      ),
    ).toBe(true);
    expect(isStaleOrderView(placed, placedMs + 700 * 3_600_000)).toBe(true);
  });

  it("is false for an unparseable timestamp rather than warning wrongly", () => {
    expect(isStaleOrderView("not a date", placedMs)).toBe(false);
  });
});

describe("orderStageIndex", () => {
  it("puts both early states on Received", () => {
    expect(orderStageIndex("pending")).toBe(0);
    expect(orderStageIndex("confirmed")).toBe(0);
  });

  it("gives Preparing, Ready and Collected a stage each", () => {
    expect(orderStageIndex("preparing")).toBe(1);
    expect(orderStageIndex("ready")).toBe(2);
    // Collected is its own stage, not folded into Ready: a collected order must
    // not look like one still waiting on the shelf.
    expect(orderStageIndex("completed")).toBe(3);
  });

  it("keeps a cancelled order off the track, and every other index on it", () => {
    expect(orderStageIndex("cancelled")).toBe(-1);
    for (const status of [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
    ] as const) {
      expect(orderStageIndex(status)).toBeLessThan(ORDER_STAGES.length);
    }
  });
});

describe("isTerminal", () => {
  it("is true only for completed and cancelled", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("is false for in-flight statuses", () => {
    const live: OrderStatus[] = ["pending", "confirmed", "preparing", "ready"];
    for (const s of live) expect(isTerminal(s)).toBe(false);
  });
});

describe("buildAdvancePatch", () => {
  const NOW = "2026-06-12T04:00:00Z";

  it("stamps ready_at when advancing to ready", () => {
    expect(buildAdvancePatch("ready", NOW)).toEqual({
      status: "ready",
      ready_at: NOW,
    });
  });

  it("stamps completed_at when advancing to completed", () => {
    expect(buildAdvancePatch("completed", NOW)).toEqual({
      status: "completed",
      completed_at: NOW,
    });
  });

  it("stamps no timestamp for other transitions", () => {
    expect(buildAdvancePatch("preparing", NOW)).toEqual({
      status: "preparing",
    });
    expect(buildAdvancePatch("confirmed", NOW)).toEqual({
      status: "confirmed",
    });
  });
});

describe("ordersAheadOf", () => {
  it("counts preparing/ready orders ahead of a pending target", () => {
    const target = order({
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
    });
    const others = [
      order({ id: "a", status: "preparing" }),
      order({ id: "b", status: "ready" }),
      target,
    ];
    expect(ordersAheadOf(others, target)).toBe(2);
  });

  it("counts only earlier-created orders within the same rank", () => {
    const target = order({
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
    });
    const others = [
      order({
        id: "before",
        status: "pending",
        created_at: "2026-06-12T10:00:00Z",
      }),
      order({
        id: "after",
        status: "pending",
        created_at: "2026-06-12T10:10:00Z",
      }),
      target,
    ];
    expect(ordersAheadOf(others, target)).toBe(1);
  });

  it("excludes the target order itself even if present in the list", () => {
    const target = order({ id: "t", status: "preparing" });
    expect(ordersAheadOf([target], target)).toBe(0);
  });

  it("returns 0 when nothing ranks ahead", () => {
    const target = order({ id: "t", status: "preparing" });
    const other = order({ id: "o", status: "pending" });
    expect(ordersAheadOf([target, other], target)).toBe(0);
  });
});

describe("estimateLabel", () => {
  it("rounds to the nearest minute", () => {
    expect(estimateLabel(150)).toBe("~3 min");
    expect(estimateLabel(89)).toBe("~1 min");
  });

  it("shows a friendly label for a near-zero estimate", () => {
    expect(estimateLabel(0)).toBe("Any moment now");
    expect(estimateLabel(20)).toBe("Any moment now");
  });
});

describe("estimateRangeLabel", () => {
  it("bands ±25% around the point estimate", () => {
    expect(estimateRangeLabel(8 * 60)).toBe("6-10 min");
    expect(estimateRangeLabel(20 * 60)).toBe("15-25 min");
  });

  it("floors the band so a small estimate never degenerates to zero-width", () => {
    expect(estimateRangeLabel(60)).toBe("1-2 min");
  });

  it("shows a friendly label for a near-zero estimate", () => {
    expect(estimateRangeLabel(0)).toBe("Any moment now");
    expect(estimateRangeLabel(20)).toBe("Any moment now");
  });
});

describe("queuePositionLabel", () => {
  it("labels zero orders ahead as next in line", () => {
    expect(queuePositionLabel(0)).toBe("You're next in line");
  });

  it("singularizes exactly one order ahead", () => {
    expect(queuePositionLabel(1)).toBe("1 order ahead of you");
  });

  it("pluralizes multiple orders ahead", () => {
    expect(queuePositionLabel(4)).toBe("4 orders ahead of you");
  });
});

describe("displayOrderNumber", () => {
  it("returns the real order_number when there's no baseline (feature off)", () => {
    expect(displayOrderNumber("0847", null)).toBe("0847");
  });

  it("computes a 1-indexed rank relative to the baseline, zero-padded to 3 digits", () => {
    expect(displayOrderNumber("0001", "0001")).toBe("001");
    expect(displayOrderNumber("0002", "0001")).toBe("002");
    expect(displayOrderNumber("0847", "0845")).toBe("003");
  });

  it("stays stable regardless of later orders completing — pure arithmetic on fixed inputs, not a live recount", () => {
    // Order #0847, whatever the baseline is, gives the same rank every call —
    // nothing here depends on which other orders are still active.
    expect(displayOrderNumber("0847", "0845")).toBe("003");
    expect(displayOrderNumber("0847", "0845")).toBe("003");
  });

  it("grows past 3 digits instead of truncating a rank of 1000+", () => {
    expect(displayOrderNumber("2040", "1000")).toBe("1041");
  });

  it("falls back to the real order_number for a non-positive rank (data inconsistency)", () => {
    expect(displayOrderNumber("0001", "0005")).toBe("0001");
  });
});

describe("splitTrailingDigit", () => {
  it("splits leading digits from the trailing one", () => {
    expect(splitTrailingDigit("0847")).toEqual({ lead: "084", last: "7" });
    expect(splitTrailingDigit("003")).toEqual({ lead: "00", last: "3" });
  });

  it("returns an empty lead for a single-character number", () => {
    expect(splitTrailingDigit("7")).toEqual({ lead: "", last: "7" });
  });

  it("returns both fields empty for null (no order_number yet)", () => {
    expect(splitTrailingDigit(null)).toEqual({ lead: "", last: "" });
  });
});

describe("needsPaymentReview", () => {
  it("is true for a pending order with a claimed (unconfirmed) payment", () => {
    expect(needsPaymentReview("pending", "claimed")).toBe(true);
  });

  it("is true for a pending order that's still unpaid", () => {
    expect(needsPaymentReview("pending", "pending")).toBe(true);
  });

  it("is false once payment is confirmed", () => {
    expect(needsPaymentReview("pending", "confirmed")).toBe(false);
  });

  it("is false for an order that never required payment", () => {
    expect(needsPaymentReview("pending", "not_required")).toBe(false);
  });

  it("is false for a non-pending status regardless of payment status", () => {
    expect(needsPaymentReview("preparing", "claimed")).toBe(false);
    expect(needsPaymentReview("ready", "pending")).toBe(false);
  });
});

describe("overtakenOrderIds", () => {
  function o(id: string, status: OrderStatus, minute: number, boothId = "b1") {
    return order({
      id,
      booth_id: boothId,
      status,
      created_at: `2026-10-06T04:${String(minute).padStart(2, "0")}:00Z`,
    });
  }

  it("flags an in-progress order that a later one has already passed", () => {
    const ids = overtakenOrderIds([
      o("ten", "preparing", 10),
      o("fifteen", "ready", 15),
    ]);
    expect([...ids]).toEqual(["ten"]);
  });

  it("counts a collected order as having passed the ones before it", () => {
    const ids = overtakenOrderIds([
      o("ten", "preparing", 10),
      o("fifteen", "completed", 15),
    ]);
    expect(ids.has("ten")).toBe(true);
  });

  it("flags nothing while the queue is being served in order", () => {
    const ids = overtakenOrderIds([
      o("ten", "ready", 10),
      o("fifteen", "preparing", 15),
    ]);
    expect(ids.size).toBe(0);
  });

  it("never flags an order that is itself ready, cancelled or collected", () => {
    const ids = overtakenOrderIds([
      o("five", "ready", 5),
      o("six", "cancelled", 6),
      o("seven", "completed", 7),
      o("twenty", "ready", 20),
    ]);
    expect(ids.size).toBe(0);
  });

  it("keeps booths separate, since each numbers and serves on its own", () => {
    const ids = overtakenOrderIds([
      o("a-ten", "preparing", 10, "b1"),
      o("b-fifteen", "ready", 15, "b2"),
    ]);
    expect(ids.size).toBe(0);
  });

  it("flags every order behind the newest one that is out", () => {
    const ids = overtakenOrderIds([
      o("eight", "pending", 8),
      o("ten", "preparing", 10),
      o("twelve", "ready", 12),
      o("fourteen", "preparing", 14),
    ]);
    expect([...ids].sort()).toEqual(["eight", "ten"]);
  });
});

describe("isAbandonedPayment", () => {
  const NOW = Date.parse("2026-10-08T12:00:00Z");
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

  it("is false inside the 30 minute payment window", () => {
    expect(isAbandonedPayment(minutesAgo(5), NOW)).toBe(false);
    expect(isAbandonedPayment(minutesAgo(30), NOW)).toBe(false);
  });

  it("is true once the window has passed", () => {
    expect(isAbandonedPayment(minutesAgo(31), NOW)).toBe(true);
    expect(isAbandonedPayment(minutesAgo(60 * 24 * 40), NOW)).toBe(true);
  });

  it("is false for a date it cannot read, so a bad row is not refused", () => {
    expect(isAbandonedPayment("not a date", NOW)).toBe(false);
  });

  it("uses the same window the sweep cancels on", () => {
    expect(ABANDONED_PAYMENT_MS).toBe(30 * 60_000);
  });
});

describe("paymentDeadline", () => {
  it("is 30 minutes after the order was placed, in UTC with a Z", () => {
    expect(paymentDeadline("2026-10-14T09:15:00+08:00")).toBe(
      "2026-10-14T01:45:00.000Z",
    );
  });

  it("depends only on created_at, so every call for one order agrees", () => {
    const placed = "2026-10-14T01:15:00.123456+00:00";
    expect(paymentDeadline(placed)).toBe(paymentDeadline(placed));
    expect(paymentDeadline(placed)).toBe("2026-10-14T01:45:00.123Z");
  });

  it("matches the window isAbandonedPayment refuses after", () => {
    const placed = "2026-10-14T01:15:00Z";
    const deadline = Date.parse(paymentDeadline(placed) ?? "");
    expect(isAbandonedPayment(placed, deadline)).toBe(false);
    expect(isAbandonedPayment(placed, deadline + 1)).toBe(true);
  });

  it("is null for a date it cannot read", () => {
    expect(paymentDeadline("not a date")).toBeNull();
  });
});
