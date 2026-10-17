// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalkupOrderDialog } from "./walkup-order-dialog";
import { toast } from "sonner";

const { getWalkupMenu, placeWalkupOrder, confirmOrderPayment } = vi.hoisted(
  () => ({
    getWalkupMenu: vi.fn(),
    placeWalkupOrder: vi.fn(),
    confirmOrderPayment: vi.fn(),
  }),
);

vi.mock("./walkup-menu-actions", () => ({ getWalkupMenu }));
vi.mock("./walkup-actions", () => ({ placeWalkupOrder }));
vi.mock("./order-actions", () => ({ confirmOrderPayment }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const BOOTHS = [{ id: "b1", name: "Kopi Corner" }];

beforeEach(() => {
  vi.clearAllMocks();
  getWalkupMenu.mockResolvedValue({
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
  placeWalkupOrder.mockResolvedValue({
    success: true,
    orderNumber: "0009",
    accessToken: "tok",
    payment: null,
  });
  confirmOrderPayment.mockResolvedValue({ success: true });
});

const PAID_MENU = {
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
  expectsPayment: true,
  paymentKind: "paynow",
};

const UNPAID_ORDER = {
  success: true,
  orderNumber: "0009",
  accessToken: "tok",
  payment: {
    orderId: "order-1",
    amountCents: 350,
    checkout: { type: "qr", transactionId: "tx-1", payload: "PAYNOW-PAYLOAD" },
  },
};

async function placeUnpaidOrder(onOpenChange = vi.fn()) {
  getWalkupMenu.mockResolvedValue(PAID_MENU);
  placeWalkupOrder.mockResolvedValue(UNPAID_ORDER);
  const user = userEvent.setup();
  render(
    <WalkupOrderDialog
      open={true}
      onOpenChange={onOpenChange}
      booths={BOOTHS}
      initialBoothId="b1"
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Add" }));
  await user.click(screen.getByRole("button", { name: /add order · 1 item/i }));
  await screen.findByRole("button", { name: "Payment received" });
  return { user, onOpenChange };
}

describe("WalkupOrderDialog", () => {
  it("recovers the submit button after a rejected action", async () => {
    placeWalkupOrder.mockRejectedValueOnce(new Error("Network unavailable"));
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog open={true} onOpenChange={vi.fn()} booths={BOOTHS} />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      ).toBeEnabled(),
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it("ignores a menu response from an earlier dialog opening", async () => {
    let resolveOld!: (value: unknown) => void;
    getWalkupMenu.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const props = { onOpenChange: vi.fn(), booths: BOOTHS };
    const { rerender } = render(<WalkupOrderDialog {...props} open={true} />);
    rerender(<WalkupOrderDialog {...props} open={false} />);
    rerender(<WalkupOrderDialog {...props} open={true} />);
    await screen.findByText("Kopi");
    await act(async () =>
      resolveOld({
        menuItems: [],
        remaining: {},
        expectsPayment: false,
        paymentKind: null,
      }),
    );
    expect(screen.getByText("Kopi")).toBeInTheDocument();
  });

  it("surfaces a failed menu request instead of remaining in loading state", async () => {
    getWalkupMenu.mockRejectedValueOnce(new Error("Network unavailable"));
    render(
      <WalkupOrderDialog open={true} onOpenChange={vi.fn()} booths={BOOTHS} />,
    );
    await waitFor(() =>
      expect(screen.queryByText("Loading menu…")).not.toBeInTheDocument(),
    );
    expect(toast.error).toHaveBeenCalled();
  });
  it("loads the booth's menu once opened", async () => {
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    expect(getWalkupMenu).toHaveBeenCalledWith("b1");
    expect(await screen.findByText("Kopi")).toBeInTheDocument();
  });

  it("adds a plain item and submits a walk-up order", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );

    await waitFor(() => expect(placeWalkupOrder).toHaveBeenCalled());
    const [boothId, input, paid] = placeWalkupOrder.mock.calls[0];
    expect(boothId).toBe("b1");
    expect(input.customerName).toBe("Walk-up");
    expect(input.items).toEqual([
      { menuItemId: "m1", name: "Kopi", price_cents: 350, quantity: 1 },
    ]);
    expect(paid).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no payment control before the order is placed", async () => {
    getWalkupMenu.mockResolvedValue(PAID_MENU);
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(
      screen.queryByRole("switch", { name: "Payment collected" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/payment comes next/i)).toBeInTheDocument();
  });

  it("says nothing about payment for a free order at a booth that takes payment", async () => {
    const free = { ...PAID_MENU.menuItems[0]!, price_cents: 0 };
    getWalkupMenu.mockResolvedValue({ ...PAID_MENU, menuItems: [free] });
    placeWalkupOrder.mockResolvedValue({
      ...UNPAID_ORDER,
      payment: { ...UNPAID_ORDER.payment, amountCents: 0 },
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(screen.queryByText(/payment comes next/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Payment received" }),
    ).not.toBeInTheDocument();
  });

  it("tells the board which order it placed, and when", async () => {
    const onPlacing = vi.fn();
    const onPlaced = vi.fn();
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
        onPlacing={onPlacing}
        onPlaced={onPlaced}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );
    await waitFor(() => expect(onPlaced).toHaveBeenCalledWith("b1", "0009"));
    expect(onPlacing).toHaveBeenCalledTimes(1);
  });

  it("says nothing about payment at a booth that takes none", async () => {
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await screen.findByText("Kopi");
    expect(screen.queryByText(/payment/i)).not.toBeInTheDocument();
  });

  it("shows the amount and the payment QR once an unpaid order is placed", async () => {
    const { onOpenChange } = await placeUnpaidOrder();

    expect(placeWalkupOrder.mock.calls[0][2]).toBe(false);
    expect(
      screen.getByRole("heading", { name: "Collect payment for order #0009" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$3.50")).toBeInTheDocument();
    expect(
      screen.getByText(/amount is already filled in/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("confirms the payment and closes on Payment received", async () => {
    const { user, onOpenChange } = await placeUnpaidOrder();

    await user.click(screen.getByRole("button", { name: "Payment received" }));

    await waitFor(() =>
      expect(confirmOrderPayment).toHaveBeenCalledWith("order-1"),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Order #0009 paid");
  });

  it("stays on the payment step when the confirm fails", async () => {
    confirmOrderPayment.mockResolvedValue({
      success: false,
      error: "Failed to confirm payment",
    });
    const { user, onOpenChange } = await placeUnpaidOrder();

    await user.click(screen.getByRole("button", { name: "Payment received" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to confirm payment"),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Payment received" }),
    ).toBeEnabled();
  });

  it("closes without confirming on Collect later", async () => {
    const { user, onOpenChange } = await placeUnpaidOrder();

    await user.click(screen.getByRole("button", { name: "Collect later" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("still lets staff confirm when the payment QR could not load", async () => {
    getWalkupMenu.mockResolvedValue(PAID_MENU);
    placeWalkupOrder.mockResolvedValue({
      ...UNPAID_ORDER,
      payment: { ...UNPAID_ORDER.payment, checkout: null },
    });
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );

    expect(
      await screen.findByText(/payment qr could not load/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Payment received" }),
    ).toBeEnabled();
  });

  it("names the order by the number on its ticket", async () => {
    getWalkupMenu.mockResolvedValue(PAID_MENU);
    placeWalkupOrder.mockResolvedValue({
      ...UNPAID_ORDER,
      orderNumber: "0847",
    });
    const displayNumber = vi.fn(() => "003");
    const user = userEvent.setup();
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
        displayNumber={displayNumber}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /add order · 1 item/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Collect payment for order #003",
      }),
    ).toBeInTheDocument();
    expect(displayNumber).toHaveBeenCalledWith("b1", "0847");
    expect(toast.success).toHaveBeenCalledWith("Order #003 added to the board");

    await user.click(screen.getByRole("button", { name: "Payment received" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Order #003 paid"),
    );
  });

  describe("at an event booth", () => {
    const EVENT_BOOTHS = [
      { id: "b1", name: "Event Stall", walkup_default: true },
    ];

    it("clears for the next customer instead of closing", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <WalkupOrderDialog
          open={true}
          onOpenChange={onOpenChange}
          booths={EVENT_BOOTHS}
          initialBoothId="b1"
        />,
      );
      await user.click(await screen.findByRole("button", { name: "Add" }));
      await user.click(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      );

      expect(
        await screen.findByRole("button", { name: /add items to order/i }),
      ).toBeDisabled();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        "Order #0009 added to the board",
      );
      // Stock is re-read behind the cleared form.
      await waitFor(() => expect(getWalkupMenu).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("Loading menu…")).not.toBeInTheDocument();
    });

    it("shows the refreshed stock for the next customer", async () => {
      getWalkupMenu
        .mockResolvedValueOnce({
          menuItems: PAID_MENU.menuItems,
          remaining: { m1: 2 },
          expectsPayment: false,
          paymentKind: null,
        })
        .mockResolvedValueOnce({
          menuItems: PAID_MENU.menuItems,
          remaining: { m1: 1 },
          expectsPayment: false,
          paymentKind: null,
        });
      const user = userEvent.setup();
      render(
        <WalkupOrderDialog
          open={true}
          onOpenChange={vi.fn()}
          booths={EVENT_BOOTHS}
          initialBoothId="b1"
        />,
      );
      expect(await screen.findByText("2 left")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add" }));
      await user.click(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      );

      expect(await screen.findByText("1 left")).toBeInTheDocument();
    });

    it("returns to order entry after Payment received", async () => {
      getWalkupMenu.mockResolvedValue(PAID_MENU);
      placeWalkupOrder.mockResolvedValue(UNPAID_ORDER);
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <WalkupOrderDialog
          open={true}
          onOpenChange={onOpenChange}
          booths={EVENT_BOOTHS}
          initialBoothId="b1"
        />,
      );
      await user.click(await screen.findByRole("button", { name: "Add" }));
      await user.click(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Payment received" }),
      );

      expect(
        await screen.findByRole("heading", { name: "New walk-up order" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /add items to order/i }),
      ).toBeDisabled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("returns to order entry on Collect later", async () => {
      getWalkupMenu.mockResolvedValue(PAID_MENU);
      placeWalkupOrder.mockResolvedValue(UNPAID_ORDER);
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <WalkupOrderDialog
          open={true}
          onOpenChange={onOpenChange}
          booths={EVENT_BOOTHS}
          initialBoothId="b1"
        />,
      );
      await user.click(await screen.findByRole("button", { name: "Add" }));
      await user.click(
        screen.getByRole("button", { name: /add order · 1 item/i }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Collect later" }),
      );

      expect(
        await screen.findByRole("heading", { name: "New walk-up order" }),
      ).toBeInTheDocument();
      expect(confirmOrderPayment).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  it("shows a no-booths state instead of fetching a menu", () => {
    render(
      <WalkupOrderDialog open={true} onOpenChange={vi.fn()} booths={[]} />,
    );
    expect(
      screen.getByText(/no open booths to take a walk-up order for/i),
    ).toBeInTheDocument();
    expect(getWalkupMenu).not.toHaveBeenCalled();
  });

  it("disables submit with an empty cart", async () => {
    render(
      <WalkupOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        booths={BOOTHS}
        initialBoothId="b1"
      />,
    );
    await screen.findByText("Kopi");
    expect(
      screen.getByRole("button", { name: /add items to order/i }),
    ).toBeDisabled();
  });
});
