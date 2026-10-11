// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompletedOrdersList } from "./completed-orders-list";
import type { BoardOrder } from "@/lib/types";

vi.mock("@/app/dashboard/order-actions", () => ({
  advanceOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function makeOrder(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: `o-${Math.random()}`,
    booth_id: "b1",
    order_number: "0007",
    customer_name: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 2 }],
    status: "completed",
    total_cents: 700,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: new Date(0).toISOString(),
    ready_at: new Date(0).toISOString(),
    completed_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

const BOOTHS = [{ id: "b1", name: "Kopi Corner" }];
// A cutoff so far in the past that the default "today" filter never
// excludes anything a test set up — used by every test that isn't itself
// exercising date-range filtering (which all use makeOrder's epoch
// completed_at default).
const EPOCH_ISO = new Date(0).toISOString();

// OrderCard emphasizes the order number's trailing digit in its own <span>
// (see splitTrailingDigit), so its text is split across elements — a plain
// string getByText can't match that (TRL's own hint: use a function
// matcher). Scoped to `h3` so the (identical-text) wrapping <div> around it
// isn't also a match.
function byOrderNumber(number: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === number;
}
const ORDER_NUMBER_OPTS = { selector: "h3" };

describe("CompletedOrdersList", () => {
  it("shows an empty state when there are no completed orders", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[]}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(screen.getByText("No completed orders yet")).toBeInTheDocument();
  });

  it("shows a retry banner on a load error instead of an empty state", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[]}
        loadError={true}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your completed orders",
    );
  });

  it("renders a card per completed order", () => {
    const orders = [
      makeOrder({ id: "o1", order_number: "0001" }),
      makeOrder({ id: "o2", order_number: "0002" }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(
      screen.getByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("only shows a booth banner when the vendor has more than one booth", () => {
    const order = makeOrder({ id: "o1" });
    const { rerender } = render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[order]}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(screen.queryByText("Kopi Corner")).not.toBeInTheDocument();

    rerender(
      <CompletedOrdersList
        booths={[...BOOTHS, { id: "b2", name: "Ice Cream Cart" }]}
        orders={[order]}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(screen.getByText("Kopi Corner")).toBeInTheDocument();
  });

  it("paginates beyond the first page", async () => {
    const user = userEvent.setup();
    const orders = Array.from({ length: 13 }, (_, i) =>
      makeOrder({ id: `o${i}`, order_number: String(i).padStart(4, "0") }),
    );
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    // Default pageSize is 12 — the 13th order starts on page 2.
    expect(
      screen.queryByText(byOrderNumber("#0012"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.getByText(byOrderNumber("#0012"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("notes the history cap when the fetch hit historyLimit", () => {
    const orders = [makeOrder({ id: "o1" })];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={1}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(
      screen.getByText(/most recent 1 completed orders/),
    ).toBeInTheDocument();
  });

  it("shows the x-y of N count even when everything fits on one page", () => {
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[makeOrder({ id: "o1" })]}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
  });

  it("filters by booth via the dropdown", async () => {
    const user = userEvent.setup();
    const orders = [
      makeOrder({ id: "o1", order_number: "0001", booth_id: "b1" }),
      makeOrder({ id: "o2", order_number: "0002", booth_id: "b2" }),
    ];
    render(
      <CompletedOrdersList
        booths={[...BOOTHS, { id: "b2", name: "Ice Cream Cart" }]}
        orders={orders}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );
    expect(
      screen.getByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Kopi Corner" }));

    expect(
      screen.getByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("filters by search text matching order number or customer name", async () => {
    const user = userEvent.setup();
    const orders = [
      makeOrder({ id: "o1", order_number: "0001", customer_name: "Ada" }),
      makeOrder({ id: "o2", order_number: "0002", customer_name: "Priya" }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search order # or customer name"),
      "priya",
    );

    expect(
      screen.queryByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("defaults to today's completed orders, then widens by date range", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    // Stand-in for sgtStartOfDayIso()'s result — "today" started 3h ago.
    const todayStartIso = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const orders = [
      makeOrder({
        id: "today",
        order_number: "0001",
        completed_at: new Date(now - 60_000).toISOString(), // 1 min ago
      }),
      makeOrder({
        id: "yesterday",
        order_number: "0002",
        completed_at: new Date(now - 26 * 60 * 60 * 1000).toISOString(), // 26h ago
      }),
      makeOrder({
        id: "old",
        order_number: "0003",
        completed_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
      }),
    ];
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={orders}
        loadError={false}
        historyLimit={500}
        todayStartIso={todayStartIso}
      />,
    );

    // Defaults to "Today" — only the order from within the last 3h shows.
    expect(
      screen.getByRole("button", { name: "Today", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toHaveClass(
      "text-primary",
    );
    expect(
      screen.getByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0003"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "7 days" }));
    expect(
      screen.getByText(byOrderNumber("#0001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0003"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All time" }));
    expect(
      screen.getByText(byOrderNumber("#0003"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("shows a no-match state when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <CompletedOrdersList
        booths={BOOTHS}
        orders={[makeOrder({ id: "o1" })]}
        loadError={false}
        historyLimit={500}
        todayStartIso={EPOCH_ISO}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search order # or customer name"),
      "nobody",
    );

    expect(screen.getByText("No matching orders")).toBeInTheDocument();
  });

  describe("daily numbering", () => {
    const TODAY_ISO = "2026-10-11T00:00:00.000Z";
    const today = makeOrder({
      id: "o-today",
      order_number: "0043",
      customer_name: "Ada",
      created_at: "2026-10-11T03:00:00.000Z",
      completed_at: "2026-10-11T03:10:00.000Z",
    });
    const yesterday = makeOrder({
      id: "o-yesterday",
      order_number: "0030",
      customer_name: "Bo",
      created_at: "2026-10-10T03:00:00.000Z",
      completed_at: "2026-10-10T03:10:00.000Z",
    });

    function renderList() {
      render(
        <CompletedOrdersList
          booths={BOOTHS}
          orders={[today, yesterday]}
          loadError={false}
          historyLimit={500}
          todayStartIso={TODAY_ISO}
          dailyOrderNumberBaselines={{ b1: "0041" }}
        />,
      );
    }

    it("shows today's ticket under the number the board gave it", () => {
      renderList();
      expect(
        screen.getByText(byOrderNumber("#003"), ORDER_NUMBER_OPTS),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(byOrderNumber("#0043"), ORDER_NUMBER_OPTS),
      ).not.toBeInTheDocument();
    });

    it("keeps an earlier day's ticket on its permanent number", async () => {
      const user = userEvent.setup();
      renderList();
      await user.click(screen.getByRole("button", { name: "All time" }));
      expect(
        screen.getByText(byOrderNumber("#0030"), ORDER_NUMBER_OPTS),
      ).toBeInTheDocument();
    });

    it("finds today's ticket by either number", async () => {
      const user = userEvent.setup();
      renderList();
      const search = screen.getByRole("searchbox");

      await user.type(search, "003");
      expect(screen.getByText("Ada")).toBeInTheDocument();

      await user.clear(search);
      await user.type(search, "0043");
      expect(screen.getByText("Ada")).toBeInTheDocument();
    });
  });
});
