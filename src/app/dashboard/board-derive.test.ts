import { describe, expect, it } from "vitest";

import type { BoardOrder } from "@/lib/types";
import { groupVisibleOrders } from "./board-derive";

function o(id: string, status: string): BoardOrder {
  return {
    id,
    status,
    booth_id: "b1",
    payment_status: "not_required",
  } as unknown as BoardOrder;
}

describe("groupVisibleOrders", () => {
  const visible = [
    o("p", "pending"),
    o("c", "confirmed"),
    o("m", "preparing"),
    o("r", "ready"),
    o("d", "completed"),
    o("x", "cancelled"),
  ];
  const groups = groupVisibleOrders(visible, [], new Set());

  it("splits orders into Incoming, Preparing and Ready", () => {
    expect(groups.incoming.map((x) => x.id)).toEqual(["p", "c", "x"]);
    expect(groups.preparing.map((x) => x.id)).toEqual(["m"]);
    expect(groups.ready.map((x) => x.id)).toEqual(["r", "d"]);
  });

  it("keeps the batch id groups per column", () => {
    expect(groups.preparingIds).toEqual(["m"]);
    expect(groups.readyIds).toEqual(["r"]);
    expect(groups.batchableIds).toEqual(["m", "r"]);
    expect(groups.startableIds).toEqual(["p"]);
  });

  it("counts ticked orders against the column they sit in", () => {
    const ticked = groupVisibleOrders(visible, [], new Set(["m", "r", "gone"]));
    expect(ticked.tickedPreparing).toEqual(["m"]);
    expect(ticked.tickedReady).toEqual(["r"]);
  });
});
