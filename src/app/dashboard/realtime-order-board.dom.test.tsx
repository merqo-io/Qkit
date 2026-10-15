// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealtimeOrderBoard } from "./realtime-order-board";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toggleBoothActive } from "./booths/actions";
import { getWalkupMenu } from "./walkup-menu-actions";
import { placeWalkupOrder } from "./walkup-actions";
import { advanceOrder, revertOrderAdvance } from "./order-actions";
import { toast } from "sonner";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import type { BoardOrder } from "@/lib/types";

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: overrides.id ?? "o1",
    booth_id: overrides.booth_id ?? "b1",
    order_number: overrides.order_number ?? "0001",
    customer_name: overrides.customer_name ?? "Priya",
    items: [{ menuItemId: "m1", name: "Flat White", quantity: 1 }],
    status: "preparing",
    total_cents: 550,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

// The board renders via useRealtimeOrders, which opens a Supabase realtime
// channel — stub it out to a no-op so the hook just echoes initialOrders.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          not: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => ({}),
      }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./booths/actions", () => ({ toggleBoothActive: vi.fn() }));
vi.mock("./walkup-menu-actions", () => ({ getWalkupMenu: vi.fn() }));
vi.mock("./walkup-actions", () => ({ placeWalkupOrder: vi.fn() }));
vi.mock("./order-actions", () => ({
  sweepReadyOrders: vi.fn(),
  sweepAbandonedPayments: vi.fn(),
  advanceOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
}));

const BOOTHS = [{ id: "b1", name: "Kopi Corner", is_active: true, open: true }];

// OrderCard emphasizes the order number's trailing digit in its own <span>
// (see splitTrailingDigit), so its text is split across elements — a plain
// string/regex getByText can't match that (TRL's own hint: use a function
// matcher). Always pass with { selector: "h3" } (ORDER_NUMBER_OPTS below) so
// the (identical-text) wrapping <div> around it isn't also a match.
function byOrderNumber(pattern: string | RegExp) {
  return (_content: string, element: Element | null) => {
    const text = element?.textContent ?? "";
    return typeof pattern === "string" ? text === pattern : pattern.test(text);
  };
}
const ORDER_NUMBER_OPTS = { selector: "h3" };

// DEFAULT_BOARD_SETTINGS has daily_order_number_reset on (migration 0067 turned
// it on vendor-wide), but the board only rebases orders placed today, matching
// the server-side baseline query. order()'s default created_at is an earlier
// day, so those cards show the raw order_number (#0001); the daily-reset tests
// below pass today's timestamp, or a baseline, to see a rank (#001).

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(toggleBoothActive).mockResolvedValue({ success: true });
  vi.mocked(advanceOrder).mockResolvedValue({ success: true, status: "ready" });
});

describe("RealtimeOrderBoard sort toggle", () => {
  it("defaults to earliest-first and re-sorts to latest-first on click", async () => {
    const user = userEvent.setup();
    const orders = [
      order({
        id: "old",
        order_number: "0001",
        created_at: "2026-06-12T04:00:00Z",
      }),
      order({
        id: "new",
        order_number: "0002",
        created_at: "2026-06-12T04:05:00Z",
      }),
    ];
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    const numbersInOrder = () =>
      screen
        .getAllByText(byOrderNumber(/^#000[12]$/), ORDER_NUMBER_OPTS)
        .map((el) => el.textContent);

    expect(numbersInOrder()).toEqual(["#0001", "#0002"]);
    expect(
      screen.getByRole("button", { name: "Earliest", pressed: true }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Latest" }));

    expect(numbersInOrder()).toEqual(["#0002", "#0001"]);
    expect(
      screen.getByRole("button", { name: "Latest", pressed: true }),
    ).toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard daily order-number reset", () => {
  it("shows the real order_number when no baseline is supplied", () => {
    // The component itself only reacts to dailyOrderNumberBaselines being
    // populated — whether to fetch/pass one at all is decided server-side
    // (page.tsx) from boardSettings.daily_order_number_reset, so this covers
    // "no baseline" regardless of that flag's value.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ order_number: "0847" })]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: false,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  const TODAY = new Date().toISOString();

  it("derives its own baseline when the board was opened before the day's first order", () => {
    // The server page has no baseline to send for a booth with no order yet
    // (staff open the board while setting up, which is the normal case at an
    // event). The board must still show the daily rank the customer's status
    // page, the TV display and the printed label each compute per request.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "b", order_number: "0848", created_at: TODAY }),
          order({ id: "a", order_number: "0847", created_at: TODAY }),
          order({ id: "none", order_number: null, created_at: TODAY }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber("#002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("ignores an order carried over from an earlier day", () => {
    // Its permanent number is what the customer's status page, the TV display
    // and the printed label all show for it, since none of them can rebase an
    // order that predates today's first.
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "yesterday",
            order_number: "0002",
            created_at: "2026-06-12T04:00:00Z",
          }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#0002"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("derives a baseline per booth, not one across booths", () => {
    render(
      <RealtimeOrderBoard
        booths={[
          ...BOOTHS,
          { id: "b2", name: "Teh Tarik Stand", is_active: true, open: true },
        ]}
        initialOrders={[
          order({
            id: "a",
            booth_id: "b1",
            order_number: "0847",
            created_at: TODAY,
          }),
          order({
            id: "b",
            booth_id: "b2",
            order_number: "0901",
            created_at: TODAY,
          }),
        ]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getAllByText(byOrderNumber("#001"), ORDER_NUMBER_OPTS),
    ).toHaveLength(2);
  });

  it("shows the daily-reset display number when a baseline is supplied", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ order_number: "0847" })]}
        boardSettings={{
          ...DEFAULT_BOARD_SETTINGS,
          daily_order_number_reset: true,
        }}
        dailyOrderNumberBaselines={{ b1: "0845" }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber("#003"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0847"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard phone section switcher", () => {
  function twoSections() {
    return [
      order({ id: "in", order_number: "0020", status: "pending" }),
      order({ id: "acc", order_number: "0021", status: "preparing" }),
    ];
  }

  it("offers both sections with their counts, so neither can be missed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={twoSections()}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: "Incoming (1)" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Accepted (1)" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("switches which section a phone shows", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={twoSections()}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: "Accepted (1)" }));
    expect(
      screen.getByRole("button", { name: "Accepted (1)" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not offer a switch when only one section has orders", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "in", status: "pending" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("group", { name: "Which orders to show" }),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard passed-over orders", () => {
  // A barista calls a number across a noisy counter, nobody marks it, and a
  // later order goes out first (Kessie's AAR, issue #5).
  it("flags an order a later one has already passed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "ten",
            order_number: "0010",
            status: "preparing",
            created_at: "2026-10-06T04:10:00Z",
          }),
          order({
            id: "fifteen",
            order_number: "0015",
            status: "ready",
            created_at: "2026-10-06T04:15:00Z",
          }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getAllByText("A later order is already out")).toHaveLength(1);
  });

  it("flags nothing while the queue is served in order", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "ten",
            order_number: "0010",
            status: "ready",
            created_at: "2026-10-06T04:10:00Z",
          }),
          order({
            id: "fifteen",
            order_number: "0015",
            status: "preparing",
            created_at: "2026-10-06T04:15:00Z",
          }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByText("A later order is already out"),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard cup cap counter", () => {
  it("shows items sold against the booth's cap", () => {
    render(
      <RealtimeOrderBoard
        booths={[{ ...BOOTHS[0], daily_cup_cap: 200, cups_today: 132 }]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("132/200 items")).toBeInTheDocument();
  });

  it("shows nothing for a booth with no cap", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByText(/\d items$/)).not.toBeInTheDocument();
  });

  it("warns inside the last tenth of the cap, so staff can tell the queue", () => {
    render(
      <RealtimeOrderBoard
        booths={[{ ...BOOTHS[0], daily_cup_cap: 200, cups_today: 185 }]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("185/200 items")).toHaveClass("text-status-aging");
  });
});

describe("RealtimeOrderBoard booth active toggle", () => {
  it("shows a single booth's open/pause toggle inline, no modal needed", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /booth status/i }),
    ).not.toBeInTheDocument();
  });

  it("gates 2+ booths behind a 'Booths' dialog, reflecting each is_active state", async () => {
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: false, open: false },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /Kopi Corner is/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Booth status, 1 of 2 open" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });

  it("stays reachable for a paused booth with no active orders", async () => {
    // visibleBooths (the filter dropdown's source) drops an inactive booth
    // with nothing in flight — the dialog's list must not, or there'd be no
    // way to turn it back on.
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: false, open: false },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(
      screen.getByRole("button", { name: "Booth status, 1 of 2 open" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });

  it("toggles instantly and calls toggleBoothActive", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
    expect(toggleBoothActive).toHaveBeenCalledWith("b1", false);
  });

  it("reverts the toggle when it fails", async () => {
    vi.mocked(toggleBoothActive).mockResolvedValue({
      success: false,
      error: "Could not update booth",
    });
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Kopi Corner is open. Tap to pause.",
        }),
      ).toBeInTheDocument(),
    );
  });

  it("rolls back and reports a rejected booth-toggle request", async () => {
    vi.mocked(toggleBoothActive).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not update the booth. Refresh to check its status.",
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "Kopi Corner is open. Tap to pause.",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the filter dropdown and header toggle after pausing the booth you're filtered to, even with nothing in flight", async () => {
    // Regression: visibleBooths used to drop a paused-and-empty booth
    // unconditionally, including the one the vendor had the board filtered
    // to — which collapsed multiBooth to false on the same render and
    // yanked the Select + the header's own toggle out from under the tap
    // that had just paused it.
    const user = userEvent.setup();
    const booths = [
      { id: "b1", name: "Kopi Corner", is_active: true, open: true },
      { id: "b2", name: "Ice Cream Cart", is_active: true, open: true },
    ];
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Ice Cream Cart/ }));

    await user.click(
      screen.getByRole("button", {
        name: "Ice Cream Cart is open. Tap to pause.",
      }),
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Ice Cream Cart is paused. Tap to resume.",
      }),
    ).toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard walk-up order button", () => {
  it("opens the walk-up dialog for the sole active booth", async () => {
    vi.mocked(getWalkupMenu).mockResolvedValue({
      menuItems: [],
      remaining: {},
      expectsPayment: false,
      paymentKind: null,
    });
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /new order/i }));

    expect(screen.getByText("New walk-up order")).toBeInTheDocument();
    await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledWith("b1"));
  });

  it("does not offer a paused booth as a walk-up target", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={[
          { id: "b1", name: "Kopi Corner", is_active: false, open: false },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /new order/i }));

    expect(
      screen.getByText(/no open booths to take a walk-up order for/i),
    ).toBeInTheDocument();
    // No active booth to preselect — getWalkupMenu never fires.
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });
});

describe("RealtimeOrderBoard event-mode (walkup_default)", () => {
  it("auto-opens the walk-up dialog on load when the sole booth defaults to it", async () => {
    vi.mocked(getWalkupMenu).mockResolvedValue({
      menuItems: [],
      remaining: {},
      expectsPayment: false,
      paymentKind: null,
    });
    render(
      <RealtimeOrderBoard
        booths={[
          {
            id: "b1",
            name: "Kopi Corner",
            is_active: true,
            open: true,
            walkup_default: true,
          },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    expect(await screen.findByText("New walk-up order")).toBeInTheDocument();
    await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledWith("b1"));
  });

  it("opens on the walk-up booth, not on the first booth listed", async () => {
    vi.mocked(getWalkupMenu).mockResolvedValue({
      menuItems: [],
      remaining: {},
      expectsPayment: false,
      paymentKind: null,
    });
    render(
      <RealtimeOrderBoard
        booths={[
          { id: "b1", name: "Kopi Corner", is_active: true, open: true },
          {
            id: "b2",
            name: "Event Stall",
            is_active: true,
            open: true,
            walkup_default: true,
          },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    expect(await screen.findByText("New walk-up order")).toBeInTheDocument();
    await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledWith("b2"));
    expect(getWalkupMenu).not.toHaveBeenCalledWith("b1");
  });

  it.each([
    {
      name: "the day's rank when the booth already has a baseline",
      reset: true,
      baselines: { b1: "0845" } as Record<string, string>,
      expected: "Order #003 added to the board",
    },
    {
      name: "#001 for the booth's first order of the day",
      reset: true,
      baselines: {} as Record<string, string>,
      expected: "Order #001 added to the board",
    },
    {
      name: "the permanent number when daily reset is off",
      reset: false,
      baselines: {} as Record<string, string>,
      expected: "Order #0847 added to the board",
    },
  ])(
    "names a walk-up order by $name",
    async ({ reset, baselines, expected }) => {
      vi.mocked(getWalkupMenu).mockResolvedValue({
        menuItems: [
          {
            id: "m1",
            name: "Kopi",
            description: "",
            available: true,
            price_cents: 350,
          },
        ],
        remaining: {},
        expectsPayment: false,
        paymentKind: null,
      });
      vi.mocked(placeWalkupOrder).mockResolvedValue({
        success: true,
        orderNumber: "0847",
        accessToken: "tok",
        payment: null,
      });
      const user = userEvent.setup();
      render(
        <RealtimeOrderBoard
          booths={[
            {
              id: "b1",
              name: "Event Stall",
              is_active: true,
              open: true,
              walkup_default: true,
            },
          ]}
          initialOrders={[]}
          boardSettings={{
            ...DEFAULT_BOARD_SETTINGS,
            daily_order_number_reset: reset,
          }}
          dailyOrderNumberBaselines={baselines}
        />,
        { wrapper: TooltipProvider },
      );

      await user.click(await screen.findByRole("button", { name: "Add" }));
      await user.click(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      );

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expected));
    },
  );

  it("does not auto-open for a walk-up booth that is switched off", () => {
    render(
      <RealtimeOrderBoard
        booths={[
          { id: "b1", name: "Kopi Corner", is_active: true, open: true },
          {
            id: "b2",
            name: "Last Weekend's Event",
            is_active: false,
            open: false,
            walkup_default: true,
          },
        ]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByText("New walk-up order")).not.toBeInTheDocument();
  });

  it("does not auto-open the walk-up dialog for an ordinary QR booth", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.queryByText("New walk-up order")).not.toBeInTheDocument();
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });

  it("offers a 'Set up for an event' entry point alongside 'Add your first booth' when a vendor has no booths yet", () => {
    render(
      <RealtimeOrderBoard
        booths={[]}
        initialOrders={[]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("link", { name: /add your first booth/i }),
    ).toHaveAttribute("href", "/dashboard/booths/new");
    expect(
      screen.getByRole("link", { name: /set up for an event/i }),
    ).toHaveAttribute("href", "/dashboard/booths/new?mode=event");
  });
});

describe("RealtimeOrderBoard batch mark-ready", () => {
  it("has no Select control when no order is preparing or ready", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "o1", status: "pending" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /select/i }),
    ).not.toBeInTheDocument();
  });

  it("lets a vendor select multiple preparing orders and mark them ready in one tap", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "preparing" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /select order #0001/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /select order #0002/i }),
    );

    const markReadyButton = screen.getByRole("button", {
      name: /mark 2 ready/i,
    });
    await user.click(markReadyButton);

    await waitFor(() => {
      expect(advanceOrder).toHaveBeenCalledWith("o1", "preparing");
      expect(advanceOrder).toHaveBeenCalledWith("o2", "preparing");
    });
    expect(advanceOrder).toHaveBeenCalledTimes(2);
  });

  it("splits a mixed Select all into a ready step and a pick-up step", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "preparing" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
          order({ id: "o3", order_number: "0003", status: "ready" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    // Nothing happens until the vendor reads the counts and confirms one.
    expect(advanceOrder).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Mark 1 Picked Up" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Mark 2 Ready" }));

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));
    expect(advanceOrder).toHaveBeenCalledWith("o1", "preparing");
    expect(advanceOrder).toHaveBeenCalledWith("o2", "preparing");
    expect(advanceOrder).not.toHaveBeenCalledWith("o3", "preparing");
    expect(toast.success).toHaveBeenCalledWith(
      "Marked 2 orders ready",
      expect.anything(),
    );

    // The two just moved are unticked, so the ready button has nothing left
    // to act on; the order that was already ready is still ticked.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /mark \d+ ready/i }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Mark 1 Picked Up" }));

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(3));
    expect(advanceOrder).toHaveBeenLastCalledWith("o3", "ready");
    expect(toast.success).toHaveBeenCalledWith(
      "Marked 1 order picked up",
      expect.anything(),
    );
    // Nothing left ticked: select mode ends.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^select$/i }),
      ).toBeInTheDocument(),
    );
  });

  it("marks every ready order picked up when nothing is still being made", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "ready" }),
          order({ id: "o2", order_number: "0002", status: "ready" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    // With nothing ticked the bar asks for a pick, not "Mark 0".
    expect(screen.getByRole("button", { name: "Pick orders" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /mark \d+ ready/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 Picked Up" }));

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));
    expect(advanceOrder).toHaveBeenCalledWith("o1", "ready");
    expect(advanceOrder).toHaveBeenCalledWith("o2", "ready");
    expect(toast.success).toHaveBeenCalledWith(
      "Marked 2 orders picked up",
      expect.anything(),
    );
  });

  it("undoes a whole batch from its toast", async () => {
    vi.mocked(revertOrderAdvance).mockResolvedValue({
      success: true,
      status: "ready",
    });
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "ready" }),
          order({ id: "o2", order_number: "0002", status: "ready" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 Picked Up" }));
    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));

    const batchToast = vi
      .mocked(toast.success)
      .mock.calls.find(([message]) => message === "Marked 2 orders picked up");
    const options = batchToast?.[1] as {
      action: { label: string; onClick: () => Promise<void> };
    };
    expect(options.action.label).toBe("Undo");
    await options.action.onClick();

    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "ready",
      "completed",
      "not_required",
    );
    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o2",
      "ready",
      "completed",
      "not_required",
    );
    expect(toast.success).toHaveBeenCalledWith("Put 2 orders back");
  });

  it("ticks a ticket when it is tapped anywhere, not only on its checkbox", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({
            id: "o1",
            order_number: "0001",
            status: "ready",
            customer_name: "Mei Ling",
          }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: /^select$/i }));
    expect(screen.getByRole("button", { name: "Pick orders" })).toBeDisabled();

    await user.click(screen.getByText("Mei Ling"));
    expect(
      screen.getByRole("button", { name: "Mark 1 Picked Up" }),
    ).toBeEnabled();
    // Ticking a ticket moves nothing by itself.
    expect(advanceOrder).not.toHaveBeenCalled();
  });

  it("turns Select all into Clear all once everything is ticked", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "preparing" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("button", { name: "Pick orders" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /mark \d+/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select all" }),
    ).toBeInTheDocument();
  });

  it("reports both completed and rejected requests in a batch", async () => {
    vi.mocked(advanceOrder)
      .mockResolvedValueOnce({ success: true, status: "ready" })
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001" }),
          order({ id: "o2", order_number: "0002" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: /^select$/i }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: /mark 2 ready/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("1 order couldn't be updated"),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Marked 1 order ready",
      expect.anything(),
    );
    expect(advanceOrder).toHaveBeenCalledWith("o1", "preparing");
    expect(advanceOrder).toHaveBeenCalledWith("o2", "preparing");
    expect(advanceOrder).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /^select$/i })).toBeEnabled();
  });

  it.each(["stale", "rejected"])(
    "guards bulk pickup and reports a %s order alongside successful pickups",
    async (failure) => {
      vi.mocked(advanceOrder).mockResolvedValueOnce({
        success: true,
        status: "completed",
      });
      if (failure === "stale")
        vi.mocked(advanceOrder).mockResolvedValueOnce({
          success: false,
          error: "Order changed. Please refresh.",
        });
      else vi.mocked(advanceOrder).mockRejectedValueOnce(new Error("offline"));
      const user = userEvent.setup();
      render(
        <RealtimeOrderBoard
          booths={BOOTHS}
          initialOrders={[
            order({ id: "o1", order_number: "0001", status: "ready" }),
            order({ id: "o2", order_number: "0002", status: "ready" }),
          ]}
          boardSettings={DEFAULT_BOARD_SETTINGS}
        />,
        { wrapper: TooltipProvider },
      );
      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getByRole("button", { name: "Select all" }));
      await user.click(
        screen.getByRole("button", { name: "Mark 2 Picked Up" }),
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("1 order couldn't be updated"),
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Marked 1 order picked up",
        expect.anything(),
      );
      expect(toast.success).not.toHaveBeenCalledWith(
        "Marked 2 orders picked up",
        expect.anything(),
      );
      expect(vi.mocked(advanceOrder).mock.calls).toEqual([
        ["o1", "ready"],
        ["o2", "ready"],
      ]);
      expect(screen.getByRole("button", { name: /^select$/i })).toBeEnabled();
    },
  );

  it("floats the selection bar over the board instead of pushing it down", async () => {
    const user = userEvent.setup();
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "ready" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: /^select$/i }));

    const bar = screen.getByRole("toolbar", { name: "Selected orders" });
    expect(bar).toHaveClass("fixed", "bottom-0");
    expect(bar.className).toMatch(/safe-area-inset-bottom/);
    expect(
      within(bar).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "Select all" }),
    ).toBeInTheDocument();
    // Select mode is on, so its own button is gone from the header.
    expect(
      screen.queryByRole("button", { name: /^select$/i }),
    ).not.toBeInTheDocument();

    await user.click(within(bar).getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("toolbar", { name: "Selected orders" }),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard Accepted header", () => {
  function renderBoard(orders: BoardOrder[]) {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
  }
  const acceptedHeader = () =>
    screen.getByRole("heading", { name: /^Accepted \(\d+\)$/ })
      .parentElement as HTMLElement;

  it("puts Select in the Accepted header, the only section it acts on", () => {
    renderBoard([
      order({ id: "o1", order_number: "0001", status: "pending" }),
      order({ id: "o2", order_number: "0002", status: "preparing" }),
    ]);
    expect(
      within(acceptedHeader()).getByRole("button", { name: /^select$/i }),
    ).toBeInTheDocument();
    expect(
      within(acceptedHeader()).getByRole("button", { name: "About Select" }),
    ).toBeInTheDocument();
  });

  it("marks every preparing order ready in one tap and can undo it", async () => {
    vi.mocked(revertOrderAdvance).mockResolvedValue({
      success: true,
      status: "preparing",
    });
    const user = userEvent.setup();
    renderBoard([
      order({ id: "o1", order_number: "0001", status: "preparing" }),
      order({ id: "o2", order_number: "0002", status: "preparing" }),
      order({ id: "o3", order_number: "0003", status: "ready" }),
    ]);

    await user.click(
      within(acceptedHeader()).getByRole("button", {
        name: "Mark all 2 ready",
      }),
    );

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));
    expect(advanceOrder).toHaveBeenCalledWith("o1", "preparing");
    expect(advanceOrder).toHaveBeenCalledWith("o2", "preparing");
    const batchToast = vi
      .mocked(toast.success)
      .mock.calls.find(([message]) => message === "Marked 2 orders ready");
    const options = batchToast?.[1] as {
      action: { label: string; onClick: () => Promise<void> };
    };
    expect(options.action.label).toBe("Undo");
    await options.action.onClick();
    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "preparing",
      "ready",
      "not_required",
    );
  });

  it("is not offered for a single preparing order, which has its own button", () => {
    renderBoard([
      order({ id: "o1", order_number: "0001", status: "preparing" }),
      order({ id: "o2", order_number: "0002", status: "ready" }),
    ]);
    expect(
      screen.queryByRole("button", { name: /^mark all/i }),
    ).not.toBeInTheDocument();
  });

  it("never offers a bulk pick-up outside Select: customers collect one at a time", () => {
    renderBoard([
      order({ id: "o1", order_number: "0001", status: "ready" }),
      order({ id: "o2", order_number: "0002", status: "ready" }),
    ]);
    expect(
      screen.queryByRole("button", { name: /^mark (all )?\d+ picked up/i }),
    ).not.toBeInTheDocument();
  });

  it("steps aside while Select is on", async () => {
    const user = userEvent.setup();
    renderBoard([
      order({ id: "o1", order_number: "0001", status: "preparing" }),
      order({ id: "o2", order_number: "0002", status: "preparing" }),
    ]);
    await user.click(screen.getByRole("button", { name: /^select$/i }));
    expect(
      screen.queryByRole("button", { name: "Mark all 2 ready" }),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard incoming/accepted split", () => {
  it("groups a pending order under Incoming, separate from an accepted one", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", status: "pending" }),
          order({ id: "o2", order_number: "0002", status: "preparing" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    // Each label appears twice now: the section heading, and the phone-only
    // SectionSwitcher tab. Query the headings specifically.
    expect(
      screen.getByRole("heading", { name: "Incoming (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Accepted (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start now/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Accepted header when every order is accepted, since Select lives there", () => {
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={[order({ id: "o1", status: "preparing" })]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.queryByText(/^Incoming/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Accepted (1)" }),
    ).toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard start all incoming", () => {
  function renderIncoming(
    orders: BoardOrder[],
    booths: Parameters<typeof RealtimeOrderBoard>[0]["booths"] = BOOTHS,
  ) {
    render(
      <RealtimeOrderBoard
        booths={booths}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
  }

  it("starts every incoming order in one tap and can undo it", async () => {
    vi.mocked(advanceOrder).mockResolvedValue({
      success: true,
      status: "preparing",
    });
    vi.mocked(revertOrderAdvance).mockResolvedValue({
      success: true,
      status: "pending",
    });
    const user = userEvent.setup();
    renderIncoming([
      order({ id: "o1", order_number: "0001", status: "pending" }),
      order({ id: "o2", order_number: "0002", status: "pending" }),
      order({ id: "o3", order_number: "0003", status: "preparing" }),
    ]);

    await user.click(screen.getByRole("button", { name: "Start all 2" }));

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));
    expect(advanceOrder).toHaveBeenCalledWith("o1", "pending");
    expect(advanceOrder).toHaveBeenCalledWith("o2", "pending");

    const startedToast = vi
      .mocked(toast.success)
      .mock.calls.find(([message]) => message === "Started 2 orders");
    const options = startedToast?.[1] as {
      action: { label: string; onClick: () => Promise<void> };
    };
    expect(options.action.label).toBe("Undo");
    await options.action.onClick();
    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "pending",
      "preparing",
      "not_required",
    );
    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o2",
      "pending",
      "preparing",
      "not_required",
    );
  });

  it("leaves out an order whose payment still needs checking", async () => {
    const user = userEvent.setup();
    renderIncoming([
      order({ id: "o1", order_number: "0001", status: "pending" }),
      order({ id: "o2", order_number: "0002", status: "pending" }),
      order({
        id: "o3",
        order_number: "0003",
        status: "pending",
        payment_status: "claimed",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Start all 2" }));

    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(2));
    expect(advanceOrder).not.toHaveBeenCalledWith("o3", "pending");
  });

  it("is not offered for a single incoming order", () => {
    renderIncoming([
      order({ id: "o1", order_number: "0001", status: "pending" }),
    ]);
    expect(
      screen.queryByRole("button", { name: /^start all/i }),
    ).not.toBeInTheDocument();
  });

  it("is not offered at a booth that waits for the customer to arrive", () => {
    renderIncoming(
      [
        order({ id: "o1", order_number: "0001", status: "pending" }),
        order({ id: "o2", order_number: "0002", status: "pending" }),
      ],
      [{ ...BOOTHS[0]!, requires_arrival_confirm: true }],
    );
    expect(
      screen.queryByRole("button", { name: /^start all/i }),
    ).not.toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard payment filter", () => {
  it("hides a pending-payment QR order from the board", () => {
    const orders = [
      order({
        id: "1",
        order_number: "0001",
        status: "pending",
        payment_status: "pending",
        source: "qr",
      }),
      order({
        id: "2",
        order_number: "0002",
        status: "pending",
        payment_status: "not_required",
        source: "qr",
      }),
    ];
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByText(byOrderNumber(/#0001/), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(byOrderNumber(/#0002/), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });

  it("still shows a pending-payment walk-up order", () => {
    const orders = [
      order({
        id: "1",
        order_number: "0001",
        status: "pending",
        payment_status: "pending",
        source: "walkup",
      }),
    ];
    render(
      <RealtimeOrderBoard
        booths={BOOTHS}
        initialOrders={orders}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText(byOrderNumber(/#0001/), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
  });
});

describe("RealtimeOrderBoard booth colours", () => {
  // "a" and "i" landed on the same hue under the old id hash.
  const TWO_BOOTHS = [
    { id: "a", name: "Kopi Corner", is_active: true, open: true },
    { id: "i", name: "Teh Stand", is_active: true, open: true },
  ];

  it("gives each booth's tickets a different dot, labelled with the booth", () => {
    render(
      <RealtimeOrderBoard
        booths={TWO_BOOTHS}
        initialOrders={[
          order({ id: "o1", order_number: "0001", booth_id: "a" }),
          order({ id: "o2", order_number: "0002", booth_id: "i" }),
        ]}
        boardSettings={DEFAULT_BOARD_SETTINGS}
      />,
      { wrapper: TooltipProvider },
    );
    const kopi = screen.getByTitle(
      "Kopi Corner's colour, the same on its tickets and in the booth filter",
    );
    const teh = screen.getByTitle(
      "Teh Stand's colour, the same on its tickets and in the booth filter",
    );
    expect(kopi.style.backgroundColor).not.toBe("");
    expect(kopi.style.backgroundColor).not.toBe(teh.style.backgroundColor);
  });
});
