// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@merqo/ui/primitives";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardOrder } from "@/lib/types";
import { BoardColumns, type BatchControls } from "./board-columns";

const completed = {
  id: "d",
  status: "completed",
  booth_id: "b1",
  payment_status: "not_required",
} as unknown as BoardOrder;

function batch(overrides: Partial<BatchControls> = {}): BatchControls {
  return {
    selectMode: false,
    preparingIds: [],
    readyIds: [],
    batchableIds: [],
    startableIds: [],
    advancing: false,
    paymentById: new Map(),
    advanceSelected: vi.fn(),
    onStartSelect: vi.fn(),
    ...overrides,
  };
}

function renderColumns(controls: BatchControls) {
  render(
    <BoardColumns
      incoming={[]}
      preparing={[]}
      ready={[completed]}
      phoneSection="ready"
      onPhoneSectionChange={vi.fn()}
      batch={controls}
      renderCard={(o) => <div key={o.id}>card {o.id}</div>}
    />,
    { wrapper: TooltipProvider },
  );
}

describe("BoardColumns Ready header", () => {
  afterEach(cleanup);

  it("offers no Select for a column holding only picked-up orders", () => {
    renderColumns(batch());
    expect(screen.getByText("card d")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^select$/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Select once an order is waiting for pickup", () => {
    renderColumns(batch({ readyIds: ["r"], batchableIds: ["r"] }));
    expect(
      screen.getByRole("button", { name: /^select$/i }),
    ).toBeInTheDocument();
  });
});
