// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { OrderCard } from "./order-card";
import { buildOptionCodes } from "@/lib/ticket";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sgtClock, shortDateTime } from "@/lib/tz";
import type { BoardOrder } from "@/lib/types";

// The card delegates mutations to server actions (order-actions.ts). We mock
// those and assert the card calls the right one with the order id; the patch
// content is the server action's job (covered in order-actions.test.ts).
const {
  advanceOrder,
  confirmOrderPayment,
  confirmPaymentAndStart,
  revertPaymentAndStart,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
  restoreAutoCompleted,
} = vi.hoisted(() => ({
  advanceOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
  confirmPaymentAndStart: vi.fn(),
  revertPaymentAndStart: vi.fn(),
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
  restoreAutoCompleted: vi.fn(),
}));

vi.mock("@/app/dashboard/order-actions", () => ({
  advanceOrder,
  confirmOrderPayment,
  confirmPaymentAndStart,
  revertPaymentAndStart,
  cancelOrder,
  bumpOrder,
  revertOrderAdvance,
  restoreAutoCompleted,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// PaymentProofViewer is dynamically imported (next/dynamic, see order-card.tsx)
// and heavy (pulls in tesseract.js on demand) — its own rendering/OCR/duplicate
// logic is covered by payment-proof-viewer.dom.test.tsx. Here we only assert
// the wiring: the trigger's visibility rules and the props it's given.
vi.mock("./payment-proof-viewer", () => ({
  PaymentProofViewer: ({
    orderId,
    expectedAmountCents,
  }: {
    orderId: string;
    expectedAmountCents: number;
  }) => (
    <div data-testid="proof-viewer">
      {orderId}:{expectedAmountCents}
    </div>
  ),
}));

function makeOrder(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0007",
    customer_name: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 2 }],
    status: "preparing",
    total_cents: 700,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: new Date(0).toISOString(),
    ready_at: null,
    completed_at: null,
    updated_at: new Date(0).toISOString(),
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  advanceOrder.mockReset();
  confirmOrderPayment.mockReset();
  confirmPaymentAndStart.mockReset();
  revertPaymentAndStart.mockReset();
  cancelOrder.mockReset();
  bumpOrder.mockReset();
  revertOrderAdvance.mockReset();
  restoreAutoCompleted.mockReset();
  advanceOrder.mockResolvedValue({ success: true, status: "ready" });
  confirmOrderPayment.mockResolvedValue({ success: true });
  confirmPaymentAndStart.mockResolvedValue({
    success: true,
    status: "preparing",
    prevPaymentStatus: "claimed",
  });
  revertPaymentAndStart.mockResolvedValue({ success: true, status: "pending" });
  cancelOrder.mockResolvedValue({ success: true });
  bumpOrder.mockResolvedValue({ success: true });
  revertOrderAdvance.mockResolvedValue({ success: true, status: "preparing" });
  restoreAutoCompleted.mockResolvedValue({ success: true, status: "ready" });
});

// The order number's trailing digit is emphasized in its own <span> (see
// splitTrailingDigit), so its container's text is split across elements —
// getByText's plain-string form can't match that; TRL's own recommended fix
// is a function matcher against the element's full textContent. Scoped to
// `p` so the (identical-text) wrapping <div> around it isn't also a match.
function byOrderNumber(number: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === number;
}
const ORDER_NUMBER_OPTS = { selector: "h3" };

// Bump and cancel live behind the ticket's "more" menu, so the ticket itself
// carries one button. Opens it and hands back the query for one of its items.
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /more actions/i }));
}
const moreButton = () =>
  screen.queryByRole("button", { name: /more actions/i });
const menuItem = (name: RegExp) => screen.queryByRole("menuitem", { name });

describe("OrderCard", () => {
  it("renders order number, customer and items, and no prices on the live board", () => {
    render(<OrderCard order={makeOrder()} />, { wrapper: TooltipProvider });
    expect(
      screen.getByText(byOrderNumber("#0007"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/Kopi/)).toBeInTheDocument();
    // Whoever is making the order needs the number, the name and the drinks.
    // What it cost is the history list's business.
    expect(screen.queryByText("$7.00")).not.toBeInTheDocument();
  });

  it("shows each line's price and the total in the history view", () => {
    render(<OrderCard order={makeOrder()} showDate />, {
      wrapper: TooltipProvider,
    });
    // Line total (350×2) and order total both read $7.00.
    expect(screen.getAllByText("$7.00")).toHaveLength(2);
  });

  it("shows displayNumber instead of the real order_number when supplied", () => {
    render(<OrderCard order={makeOrder()} displayNumber="3" />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.getByText(byOrderNumber("#3"), ORDER_NUMBER_OPTS),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(byOrderNumber("#0007"), ORDER_NUMBER_OPTS),
    ).not.toBeInTheDocument();
  });

  it("carries no timestamp on the live board, a date and time when showDate is set", () => {
    const order = makeOrder();
    const { rerender } = render(<OrderCard order={order} />, {
      wrapper: TooltipProvider,
    });
    // On the board the waiting time in the header is the only clock that
    // matters; the wall-clock time an order came in is history's concern.
    expect(
      screen.queryByText(sgtClock(order.created_at)),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(shortDateTime(order.created_at)),
    ).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <OrderCard order={order} showDate />
      </TooltipProvider>,
    );
    expect(
      screen.getByText(shortDateTime(order.created_at)),
    ).toBeInTheDocument();
  });

  it("shows Free (not $0.00) for an unpriced item in an otherwise-priced order", () => {
    render(
      <OrderCard
        order={makeOrder({
          items: [
            { menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 1 },
            { menuItemId: "m2", name: "Extra sauce", quantity: 1 },
          ],
          total_cents: 350,
        })}
        showDate
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows every customisation with nothing to open", () => {
    render(
      <OrderCard
        order={makeOrder({
          items: [
            {
              menuItemId: "m1",
              name: "Iced Latte",
              price_cents: 650,
              quantity: 1,
              options: [
                { group: "Size", choice: "Large" },
                { group: "Milk", choice: "Oat" },
                { group: "Sweetness", choice: "25 percent" },
              ],
            },
          ],
          total_cents: 650,
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("Large")).toBeInTheDocument();
    expect(screen.getByText("Oat")).toBeInTheDocument();
    expect(screen.getByText("25 percent")).toBeInTheDocument();
    // A tap per order to read the drink was the thing vendors could not
    // afford mid-service, so there is no expand control at all.
    expect(
      screen.queryByRole("button", { name: /options/i }),
    ).not.toBeInTheDocument();
  });

  it("prints the vendor's short code for a choice that has one", () => {
    render(
      <OrderCard
        order={makeOrder({
          items: [
            {
              menuItemId: "m1",
              name: "Kopi",
              quantity: 1,
              options: [
                { group: "Sugar", choice: "Less sugar" },
                { group: "Temp", choice: "Hot" },
              ],
            },
          ],
        })}
        optionCodes={buildOptionCodes([
          {
            id: "m1",
            option_groups: [
              {
                label: "Sugar",
                choices: [{ label: "Less sugar", code: "LS" }],
              },
              { label: "Temp", choices: [{ label: "Hot" }] },
            ],
          },
        ])}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("LS")).toBeInTheDocument();
    expect(screen.queryByText("Less sugar")).not.toBeInTheDocument();
    // No code set for this one, so it prints in full rather than as a guess.
    expect(screen.getByText("Hot")).toBeInTheDocument();
  });

  it("advances preparing -> ready instantly, showing Undo rather than a confirm gate", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));

    // No confirmation dialog — the tap already happened. Recovery is Undo.
    expect(advanceOrder).toHaveBeenCalledWith("o1", "preparing");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Mark Picked Up" }),
    ).not.toBeInTheDocument();
  });

  it("undoes an advance back to the previous status", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    await user.click(await screen.findByRole("button", { name: /undo/i }));

    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "preparing",
      "ready",
      "not_required",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark Ready" }),
      ).toBeInTheDocument(),
    );
  });

  it("reveals the next advance label once the undo window elapses", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "ready" });
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    await screen.findByRole("button", { name: /undo/i });

    // Real-time wait past UNDO_MS (4s) — deliberately not faked: mixing fake
    // timers with userEvent's own internal delays and RTL's polling wait is
    // fragile enough to cost more confidence than it saves for one test.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Mark Picked Up" }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 6000);

  it("advances ready -> completed via the action", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "completed" });
    render(<OrderCard order={makeOrder({ status: "ready" })} />, {
      wrapper: TooltipProvider,
    });

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));

    expect(advanceOrder).toHaveBeenCalledWith("o1", "ready");
  });

  it("shows an auto-clear drain bar on Mark Picked Up when ready and auto-clear is on", () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({
          status: "ready",
          ready_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
        })}
        readyAutoClearMs={5 * 60_000} // 5 min
      />,
      { wrapper: TooltipProvider },
    );

    const bar = container.querySelector(".autoclear-bar");
    expect(bar).toBeInTheDocument();
    // ~4 min left (5 min window minus the 1 min already elapsed).
    const duration = parseInt((bar as HTMLElement).style.animationDuration, 10);
    expect(duration).toBeGreaterThan(3 * 60_000);
    expect(duration).toBeLessThanOrEqual(4 * 60_000);
  });

  it("hides the auto-clear drain bar when auto-clear is off", () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({
          status: "ready",
          ready_at: new Date().toISOString(),
        })}
        readyAutoClearMs={null}
      />,
      { wrapper: TooltipProvider },
    );

    expect(container.querySelector(".autoclear-bar")).not.toBeInTheDocument();
  });

  it("hides the auto-clear drain bar once the window has already elapsed", () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({
          status: "ready",
          ready_at: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
        })}
        readyAutoClearMs={5 * 60_000} // 5 min window, long past due
      />,
      { wrapper: TooltipProvider },
    );

    expect(container.querySelector(".autoclear-bar")).not.toBeInTheDocument();
  });

  it("hides the auto-clear drain bar for a non-ready status", () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({ status: "preparing" })}
        readyAutoClearMs={5 * 60_000}
      />,
      { wrapper: TooltipProvider },
    );

    expect(container.querySelector(".autoclear-bar")).not.toBeInTheDocument();
  });

  it("does not flash a Paid badge when completing an order that never required payment", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "completed" });
    render(
      <OrderCard
        order={makeOrder({ status: "ready", payment_status: "not_required" })}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));

    expect(screen.queryByText(/^Paid$/i)).not.toBeInTheDocument();
  });

  it("cancels via the confirm dialog", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });

    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: /cancel order/i }));
    // Dialog action (distinct from the menu item / "Keep order").
    await user.click(screen.getByRole("button", { name: "Cancel order" }));

    expect(cancelOrder).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Mark Ready" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows no action buttons for a completed order", () => {
    render(<OrderCard order={makeOrder({ status: "completed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.queryByRole("button", { name: /Mark/ }),
    ).not.toBeInTheDocument();
    expect(moreButton()).not.toBeInTheDocument();
  });

  it("renders the booth banner when a name is given", () => {
    render(<OrderCard order={makeOrder()} boothName="Kopi Cart" />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText("Kopi Cart")).toBeInTheDocument();
  });

  it("marks a walk-up beside the name, since there is no phone to notify", () => {
    render(<OrderCard order={makeOrder({ source: "walkup" })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText(/walk-up/i)).toBeInTheDocument();
  });

  it("does not print walk-up twice for a walk-up order with no name given", () => {
    render(
      <OrderCard
        order={makeOrder({ source: "walkup", customer_name: "Walk-up" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getAllByText(/walk-up/i)).toHaveLength(1);
    expect(screen.queryByText(/· walk-up/)).not.toBeInTheDocument();
  });

  it("shows no origin note for a QR order", () => {
    render(<OrderCard order={makeOrder({ source: "qr" })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.queryByText(/walk-up/i)).not.toBeInTheDocument();
  });
});

describe("OrderCard — batch select", () => {
  it("renders no selection checkbox when not selectable", () => {
    render(<OrderCard order={makeOrder({ status: "preparing" })} />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.queryByRole("checkbox", { name: /select order #0007/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a checked/unchecked selection checkbox and calls onToggleSelect", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <OrderCard
        order={makeOrder({ status: "preparing" })}
        selectable
        selected={false}
        onToggleSelect={onToggleSelect}
      />,
      { wrapper: TooltipProvider },
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /select order #0007/i,
    });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith("o1");
  });

  it("reflects a selected order as checked", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "preparing" })}
        selectable
        selected
        onToggleSelect={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("checkbox", { name: /select order #0007/i }),
    ).toBeChecked();
  });
});

describe("OrderCard payment", () => {
  it.each(["pending", "claimed"] as const)(
    "keeps a completed %s payment settleable without displaying Paid",
    async (paymentStatus) => {
      const user = userEvent.setup();
      render(
        <OrderCard
          order={makeOrder({
            status: "completed",
            payment_status: paymentStatus,
          })}
        />,
        { wrapper: TooltipProvider },
      );
      expect(screen.queryByText(/^Paid$/i)).not.toBeInTheDocument();
      const label =
        paymentStatus === "claimed"
          ? /confirm payment received/i
          : /mark as paid/i;
      await user.click(screen.getByRole("button", { name: label }));
      expect(confirmOrderPayment).toHaveBeenCalledWith("o1");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: label }),
        ).not.toBeInTheDocument(),
      );
    },
  );

  it("pickup and its undo preserve a real confirmation made during the undo window", async () => {
    const user = userEvent.setup();
    advanceOrder.mockResolvedValue({ success: true, status: "completed" });
    revertOrderAdvance.mockResolvedValue({ success: true, status: "ready" });
    render(
      <OrderCard
        order={makeOrder({ status: "ready", payment_status: "claimed" })}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));
    await screen.findByRole("button", { name: /undo/i });
    expect(screen.queryByText(/^Paid$/i)).not.toBeInTheDocument();
    expect(confirmOrderPayment).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /confirm payment received/i }),
      ).not.toBeInTheDocument(),
    );
    expect(confirmOrderPayment).toHaveBeenCalledWith("o1");
    await user.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark Picked Up" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", {
        name: /confirm payment received|mark as paid/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Says paid. Check the payment"),
    ).not.toBeInTheDocument();
    expect(confirmOrderPayment).toHaveBeenCalledTimes(1);
    expect(revertOrderAdvance).toHaveBeenCalledWith(
      "o1",
      "ready",
      "completed",
      "claimed",
    );
  });

  it("a failed Paykit confirmation leaves a completed order unpaid and retryable", async () => {
    const user = userEvent.setup();
    confirmOrderPayment.mockResolvedValue({
      success: false,
      error: "Failed to confirm payment",
    });
    render(
      <OrderCard
        order={makeOrder({ status: "completed", payment_status: "claimed" })}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(
      screen.getByRole("button", { name: /confirm payment received/i }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to confirm payment"),
    );
    expect(screen.queryByText(/^Paid$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm payment received/i }),
    ).toBeEnabled();
  });

  it("shows a Confirm payment button for a claimed order", () => {
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(
      screen.getByRole("button", { name: /confirm payment/i }),
    ).toBeInTheDocument();
  });

  it("confirms payment via the action", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ payment_status: "claimed" })} />, {
      wrapper: TooltipProvider,
    });
    await user.click(screen.getByRole("button", { name: /confirm payment/i }));
    expect(confirmOrderPayment).toHaveBeenCalledWith("o1");
  });

  it("says nothing about payment once it is confirmed", () => {
    render(<OrderCard order={makeOrder({ payment_status: "confirmed" })} />, {
      wrapper: TooltipProvider,
    });
    // Paid is the state where there is nothing left to do, so the ticket
    // stays quiet rather than spending a badge on it.
    expect(screen.queryByText(/paid/i)).not.toBeInTheDocument();
  });

  it("flags a payment that has not been made yet", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "pending" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("Not paid yet")).toBeInTheDocument();
  });

  it("shows only the most urgent thing when several apply", () => {
    render(
      <OrderCard
        order={makeOrder({
          status: "preparing",
          payment_status: "claimed",
          print_status: "failed",
        })}
        overtaken
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByText("Says paid. Check the payment"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Label did not print")).not.toBeInTheDocument();
    expect(
      screen.queryByText("A later order is already out"),
    ).not.toBeInTheDocument();
  });

  it("prints what is owed on the payment button", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "claimed" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", {
        name: /confirm payment received.*\$7\.00/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows no payment UI when payment is not required", () => {
    render(
      <OrderCard order={makeOrder({ payment_status: "not_required" })} />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /confirm payment/i }),
    ).not.toBeInTheDocument();
  });

  it("offers no cancel for a paid (confirmed) live order", async () => {
    const user = userEvent.setup();
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "confirmed" })}
      />,
      { wrapper: TooltipProvider },
    );
    // No refund rail — a paid order shows no cancel affordance, but stays live.
    expect(
      screen.getByRole("button", { name: "Mark Ready" }),
    ).toBeInTheDocument();
    await openMore(user);
    expect(menuItem(/cancel order/i)).not.toBeInTheDocument();
    expect(menuItem(/bump to front/i)).toBeInTheDocument();
  });

  it("still offers cancel for a non-paid live order", async () => {
    const user = userEvent.setup();
    render(
      <OrderCard
        order={makeOrder({ status: "preparing", payment_status: "pending" })}
      />,
      { wrapper: TooltipProvider },
    );
    await openMore(user);
    expect(menuItem(/cancel order/i)).toBeInTheDocument();
  });

  it("keeps bump in the more menu, off the face of a live, non-bumped ticket", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ priority_bumped_at: null })} />, {
      wrapper: TooltipProvider,
    });
    expect(menuItem(/bump to front/i)).not.toBeInTheDocument();
    await openMore(user);
    expect(menuItem(/bump to front/i)).toBeInTheDocument();
  });

  it("bumps from the menu with no confirm dialog and marks the ticket as bumped", async () => {
    const user = userEvent.setup();
    render(<OrderCard order={makeOrder({ priority_bumped_at: null })} />, {
      wrapper: TooltipProvider,
    });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: /bump to front/i }));
    expect(bumpOrder).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(
        screen.getByLabelText(/manually bumped to the front/i),
      ).toBeInTheDocument(),
    );
    // Once bumped there is nothing left to bump: the menu offers cancel only.
    await openMore(user);
    expect(menuItem(/bump to front/i)).not.toBeInTheDocument();
  });

  it("shows the bumped icon and no bump trigger for an order already bumped", () => {
    render(
      <OrderCard
        order={makeOrder({ priority_bumped_at: new Date(0).toISOString() })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Bump order #0007 to front/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/manually bumped to the front/i),
    ).toBeInTheDocument();
  });

  it("shows no bump trigger or bumped icon for a closed order", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "completed", priority_bumped_at: null })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Bump order #0007 to front/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/manually bumped to the front/i),
    ).not.toBeInTheDocument();
  });
});

describe("OrderCard — reconciled payment+start", () => {
  it("shows one merged button, not two, for a pending order awaiting payment confirm", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "pending", payment_status: "claimed" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: /mark paid.*start/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirm payment received/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start now/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the merged button for an unpaid walk-up order too", () => {
    render(
      <OrderCard
        order={makeOrder({
          status: "pending",
          payment_status: "pending",
          source: "walkup",
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: /mark paid.*start/i }),
    ).toBeInTheDocument();
  });

  it("shows the plain Start now button, not the merged one, once payment is already settled", () => {
    render(
      <OrderCard
        order={makeOrder({ status: "pending", payment_status: "not_required" })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: /start now/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark paid.*start/i }),
    ).not.toBeInTheDocument();
  });

  it("tapping the merged button calls confirmPaymentAndStart and shows an undo option", async () => {
    const user = userEvent.setup();
    confirmPaymentAndStart.mockResolvedValueOnce({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
    render(
      <OrderCard
        order={makeOrder({
          id: "order-1",
          status: "pending",
          payment_status: "claimed",
        })}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(screen.getByRole("button", { name: /mark paid.*start/i }));
    expect(confirmPaymentAndStart).toHaveBeenCalledWith("order-1");
    expect(
      await screen.findByRole("button", { name: /undo/i }),
    ).toBeInTheDocument();
  });

  it("undoes the merged action's status back to pending, but leaves payment confirmed", async () => {
    // paykit's own confirm already happened for real and can't be undone
    // (see revertPaymentAndStart's own doc comment) — undo only un-starts
    // the order, so it lands back on the plain "Start now" button, not the
    // merged one (payment no longer needs review).
    const user = userEvent.setup();
    confirmPaymentAndStart.mockResolvedValueOnce({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
    render(
      <OrderCard
        order={makeOrder({
          id: "order-1",
          status: "pending",
          payment_status: "claimed",
        })}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(screen.getByRole("button", { name: /mark paid.*start/i }));
    await user.click(await screen.findByRole("button", { name: /undo/i }));

    expect(revertPaymentAndStart).toHaveBeenCalledWith("order-1", "claimed");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^start now$/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /mark paid.*start/i }),
    ).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      "Payment stays confirmed. Refund via paykit if needed.",
    );
  });
});

describe("OrderCard print status", () => {
  it("says the label did not print when print_status is failed", () => {
    render(<OrderCard order={makeOrder({ print_status: "failed" })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText("Label did not print")).toBeInTheDocument();
  });

  it("shows no print-status UI when print_status is not_required", () => {
    render(<OrderCard order={makeOrder({ print_status: "not_required" })} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.queryByText(/did not print/i)).not.toBeInTheDocument();
  });

  it.each(["queued", "sent", "printed"] as const)(
    "shows no print-status UI when print_status is %s",
    (print_status) => {
      render(<OrderCard order={makeOrder({ print_status })} />, {
        wrapper: TooltipProvider,
      });
      expect(screen.queryByText(/did not print/i)).not.toBeInTheDocument();
    },
  );
});

describe("OrderCard — payment proof review", () => {
  it("shows a View payment proof trigger for a claimed order with an uploaded proof photo", () => {
    render(
      <OrderCard
        order={makeOrder({
          payment_status: "claimed",
          payment_proof_path: "vendor-1/order-1.png",
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: /view payment proof/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("proof-viewer")).not.toBeInTheDocument();
  });

  it("shows no trigger for a claimed order with no uploaded proof photo", () => {
    render(
      <OrderCard
        order={makeOrder({
          payment_status: "claimed",
          payment_proof_path: null,
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /view payment proof/i }),
    ).not.toBeInTheDocument();
  });

  it("shows no trigger once payment is confirmed, even with a proof photo on file", () => {
    render(
      <OrderCard
        order={makeOrder({
          payment_status: "confirmed",
          payment_proof_path: "vendor-1/order-1.png",
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.queryByRole("button", { name: /view payment proof/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the trigger for the merged mark-paid-and-start review too (a still-pending claimed order)", () => {
    render(
      <OrderCard
        order={makeOrder({
          status: "pending",
          payment_status: "claimed",
          payment_proof_path: "vendor-1/order-1.png",
        })}
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: /view payment proof/i }),
    ).toBeInTheDocument();
  });

  it("expands to render PaymentProofViewer with the order id and total once tapped, and collapses back on a second tap", async () => {
    const user = userEvent.setup();
    render(
      <OrderCard
        order={makeOrder({
          id: "order-9",
          payment_status: "claimed",
          payment_proof_path: "vendor-1/order-1.png",
          total_cents: 550,
        })}
      />,
      { wrapper: TooltipProvider },
    );

    await user.click(
      screen.getByRole("button", { name: /view payment proof/i }),
    );
    expect(await screen.findByTestId("proof-viewer")).toHaveTextContent(
      "order-9:550",
    );
    expect(
      screen.getByRole("button", { name: /hide payment proof/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /hide payment proof/i }),
    );
    expect(screen.queryByTestId("proof-viewer")).not.toBeInTheDocument();
  });
});

describe("OrderCard — pending arrival aging", () => {
  it("never shows the aging/overdue wash or footer colour for a pending order, however old", () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({
          status: "pending",
          created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        })}
      />,
      { wrapper: TooltipProvider },
    );
    // Pre-arrival: nothing is cooking/waiting yet, so the ticket-aging clock's
    // premise doesn't apply even though created_at is an hour old.
    expect(
      container.querySelector(".ticket-aging,.ticket-overdue,.ticket-alert"),
    ).toBeNull();
    const clock = screen.getByTitle("Time since the order arrived");
    expect(clock).toHaveAttribute("aria-label", "60 minutes since arrival");
    expect(clock.className).not.toMatch(
      /text-status-aging|text-status-cancelled/,
    );
    expect(clock).not.toHaveTextContent(/late/i);
  });

  it("names a late ticket in words, not only by its colour", () => {
    render(
      <OrderCard
        order={makeOrder({
          status: "preparing",
          created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        })}
      />,
      { wrapper: TooltipProvider },
    );
    const clock = screen.getByTitle("Time since the order arrived");
    expect(clock.className).toMatch(/text-status-cancelled/);
    expect(clock).toHaveTextContent(/late/i);
  });
});

describe("OrderCard — restore auto-completed", () => {
  it("shows Restore to ready only for a sweep-completed order", () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: /restore to ready/i }),
    ).toBeInTheDocument();
  });

  it("hides the button for a manually completed order", () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: false })}
        />
      </TooltipProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /restore to ready/i }),
    ).not.toBeInTheDocument();
  });

  it("calls restoreAutoCompleted and updates the badge on success", async () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /restore to ready/i }));
    expect(restoreAutoCompleted).toHaveBeenCalledWith("o1");
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
  });

  it("also offers cancel for a sweep-completed order (the sweep can beat a vendor's own cancel tap)", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    await openMore(user);
    expect(menuItem(/cancel order/i)).toBeInTheDocument();
  });

  it("hides Cancel for a sweep-completed order once payment is confirmed", () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({
            status: "completed",
            auto_completed: true,
            payment_status: "confirmed",
          })}
        />
      </TooltipProvider>,
    );
    expect(moreButton()).not.toBeInTheDocument();
  });

  it("cancels a sweep-completed order and shows the Cancelled badge", async () => {
    render(
      <TooltipProvider>
        <OrderCard
          order={makeOrder({ status: "completed", auto_completed: true })}
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: /cancel order/i }));
    await user.click(screen.getByRole("button", { name: /cancel order/i }));
    expect(cancelOrder).toHaveBeenCalledWith("o1");
    await waitFor(() =>
      expect(screen.getByText("Cancelled")).toBeInTheDocument(),
    );
  });
});

describe("OrderCard — hydration", () => {
  it("hydrates without a text mismatch when the clock moves between server and client render", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const created = Date.parse("2026-09-22T00:00:00Z");
    const order = makeOrder({ created_at: new Date(created).toISOString() });
    const tree = (
      <TooltipProvider>
        <OrderCard order={order} />
      </TooltipProvider>
    );

    // Server renders at +5 min; the browser hydrates a minute later. Before the
    // fix useNow() seeded Date.now() in render, so the two "Nm" labels differed
    // (React #418, the production dashboard console error).
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(created + 5 * 60_000);
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    // No clock on the server: the elapsed label waits for the client clock.
    expect(
      container.querySelector('[title="Time since the order arrived"]'),
    ).toBeNull();

    nowSpy.mockReturnValue(created + 6 * 60_000);
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, tree, { onRecoverableError });
    await act(async () => {});

    expect(onRecoverableError).not.toHaveBeenCalled();
    // After mount the effect sets the clock and the real elapsed label appears.
    expect(
      container.querySelector('[title="Time since the order arrived"]'),
    ).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/^6 minutes since arrival/),
    );

    act(() => root.unmount());
    container.remove();
    nowSpy.mockRestore();
  });
});

describe("OrderCard waiting time placement", () => {
  it("puts the waiting time in the ticket's bottom strip, after the action button", () => {
    render(<OrderCard order={makeOrder()} />, { wrapper: TooltipProvider });
    const age = screen.getByTitle("Time since the order arrived");
    const action = screen.getByRole("button", { name: /mark ready/i });
    // Document order: the button comes first, the time strip follows it.
    expect(
      action.compareDocumentPosition(age) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no waiting time on a collected order", () => {
    render(<OrderCard order={makeOrder({ status: "completed" })} showDate />, {
      wrapper: TooltipProvider,
    });
    expect(screen.queryByTitle("Time since the order arrived")).toBeNull();
  });
});
