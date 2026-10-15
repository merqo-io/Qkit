// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { webcrypto } from "node:crypto";
import { OrderForm } from "./order-form";
import type { MenuItem, SelectedOption } from "@/lib/types";

const { placeOrder, addRecentOrder, push, holdCart, readAvailability } =
  vi.hoisted(() => ({
    placeOrder: vi.fn(),
    addRecentOrder: vi.fn(),
    push: vi.fn(),
    holdCart: vi.fn(),
    readAvailability: vi.fn(),
  }));

vi.mock("@/app/o/[code]/actions", () => ({ placeOrder }));
vi.mock("@/app/o/[code]/hold-actions", () => ({ holdCart, readAvailability }));
vi.mock("@/lib/recent-orders", () => ({ addRecentOrder }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Stub the customization sheet: when open, expose one button that adds the
// item with a fixed option so the option path is exercised without radix.
vi.mock("@/components/order/item-customizer", () => ({
  ItemCustomizer: ({
    item,
    onAdd,
  }: {
    item: MenuItem | null;
    onClose: () => void;
    onAdd: (i: MenuItem, o: SelectedOption[]) => void;
  }) =>
    item ? (
      <button
        type="button"
        onClick={() => onAdd(item, [{ group: "Temp", choice: "Iced" }])}
      >
        stub-confirm
      </button>
    ) : null,
}));

const KOPI: MenuItem = {
  id: "kopi",
  name: "Kopi",
  description: "",
  price_cents: 350,
  available: true,
};
const KOPI_WITH_ALLERGENS: MenuItem = {
  ...KOPI,
  id: "kopi-allergens",
  allergens: ["caffeine", "dairy"],
};
const TEH: MenuItem = {
  id: "teh",
  name: "Teh",
  description: "",
  price_cents: 300,
  available: true,
  option_groups: [
    {
      id: "t",
      label: "Temp",
      choices: [{ id: "i", label: "Iced", price_delta_cents: 100 }],
    },
  ],
};

function renderForm(closed = false, menuItems: MenuItem[] = [KOPI, TEH]) {
  return render(
    <OrderForm
      code="code123"
      boothId="b1"
      menuItems={menuItems}
      closed={closed}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
  window.sessionStorage.clear(); // no stale reorder seed leaking between tests
  // Default: the hold call could not be made, so the form keeps showing the
  // stock it was rendered with.
  holdCart.mockResolvedValue(null);
  readAvailability.mockResolvedValue(null);
  placeOrder.mockResolvedValue({
    success: true,
    orderNumber: "0042",
    boothId: "b1",
    accessToken: "tok42",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OrderForm cart", () => {
  it("adds a plain item and totals it", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Continue · 1 item · \$3\.50/,
      }),
    ).toBeEnabled();
  });

  it("keeps the cart summary collapsed until tapped", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    const toggle = screen.getByRole("button", { name: /Your order/ });
    const summary = toggle.closest("section")!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(summary).queryByText("Kopi")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(summary).getByText("Kopi")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(summary).queryByText("Kopi")).not.toBeInTheDocument();
  });

  it("increments and decrements, removing at zero", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByText("Your order")); // expand the collapsed summary
    await user.click(screen.getByRole("button", { name: "Increase Kopi" }));

    // 2 × $3.50 = $7.00 in the submit bar.
    expect(
      screen.getByRole("button", {
        name: /Continue · 2 items · \$7\.00/,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Decrease Kopi" }));
    await user.click(screen.getByRole("button", { name: "Decrease Kopi" }));

    // Cart empty → summary gone, submit disabled with the empty label.
    expect(screen.queryByText("Your order")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add items to order" }),
    ).toBeDisabled();
  });

  it("adds a customized item with its option line", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    // The cart summary starts collapsed — expand it to see line items.
    await user.click(screen.getByText("Your order"));
    const cart = screen.getByText("Your order").closest("section")!;
    expect(within(cart).getByText("Teh")).toBeInTheDocument();
    expect(within(cart).getByText("Iced")).toBeInTheDocument();
  });

  it("shows on the menu card that an item with options is in the basket", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByText(/in your order/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    expect(screen.getByText("2 in your order")).toBeInTheDocument();
  });

  it("folds a priced choice's delta into the cart line and submit total", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    // Teh is $3.00 base + $1.00 for the priced "Iced" choice = $4.00 — both
    // the cart line price and the order total reflect it (expand to see them).
    await user.click(screen.getByText("Your order"));
    const cart = screen.getByText("Your order").closest("section")!;
    expect(within(cart).getAllByText("$4.00")).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: /Continue · 1 item · \$4\.00/,
      }),
    ).toBeEnabled();
  });

  it("opens the checkout sheet from the sticky trigger, not a direct submit", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Who's this for?" }),
    ).toBeInTheDocument();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("puts focus in the name field when the sheet opens with a mouse", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Your name")).toHaveFocus(),
    );
  });

  it("leaves the keyboard down when the sheet opens on a touch screen", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(within(dialog).getByLabelText("Your name")).not.toHaveFocus();
  });

  it("lists what's being ordered inside the checkout sheet", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" })); // Kopi
    await user.click(screen.getByRole("button", { name: "Customize" })); // Teh
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Kopi")).toBeInTheDocument();
    expect(within(dialog).getByText("Teh")).toBeInTheDocument();
    expect(within(dialog).getByText("Iced")).toBeInTheDocument();
  });

  it("submits the order, remembers it, and navigates to the status page", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        {
          customerName: "Ada",
          customerPhone: "",
          items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
        },
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
    expect(addRecentOrder).toHaveBeenCalledWith({
      boothId: "b1",
      orderNumber: "0042",
      customerName: "Ada",
      token: "tok42",
      items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
    });
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });

  it("redirects to the payment page, saving the order without a number, when order_number is null", async () => {
    placeOrder.mockResolvedValueOnce({
      success: true,
      orderNumber: null,
      boothId: "b1",
      accessToken: "tok42",
    });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        {
          customerName: "Ada",
          customerPhone: "",
          items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
        },
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
    expect(addRecentOrder).toHaveBeenCalledWith({
      boothId: "b1",
      customerName: "Ada",
      token: "tok42",
      items: [expect.objectContaining({ menuItemId: "kopi", quantity: 1 })],
    });
    expect(push).toHaveBeenCalledWith("/order/b1/pay?t=tok42");
  });

  it("seeds the cart from a reorder handoff on mount", async () => {
    window.sessionStorage.setItem(
      "qkit:reorder:b1",
      JSON.stringify({
        lines: [{ menuItemId: "kopi", quantity: 2 }],
        customerName: "Bo",
      }),
    );
    const user = userEvent.setup();
    renderForm();

    // Cart prefilled (2 × $3.50), name filled, seed consumed (read-once).
    expect(await screen.findByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Continue · 2 items · \$7\.00/,
      }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem("qkit:reorder:b1")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Your name")).toHaveValue("Bo");
  });

  it("shows a placeholder when the booth has no menu yet", () => {
    render(<OrderForm code="code123" boothId="b1" menuItems={[]} />);
    expect(screen.getByText("Menu coming soon")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add items to order" }),
    ).not.toBeInTheDocument();
  });

  it("restores a persisted cart on mount without clobbering it", async () => {
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([{ menuItemId: "kopi", quantity: 2 }]),
    );
    renderForm();

    // Restored (2 × $3.50), and the first empty render did NOT wipe storage.
    expect(await screen.findByText("Your order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Continue · 2 items · \$7\.00/,
      }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem("qkit:cart:b1")).not.toBeNull();
    expect(window.sessionStorage.getItem("qkit:cart:b1")).not.toBe("[]");
  });

  it("drops a fully-sold-out persisted cart silently (no toast)", async () => {
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([{ menuItemId: "kopi", quantity: 2 }]),
    );
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        remaining={{ kopi: 0 }}
      />,
    );
    // Nothing restored, cleared silently — a refresh shouldn't nag the customer.
    await waitFor(() =>
      expect(window.sessionStorage.getItem("qkit:cart:b1")).toBeNull(),
    );
    expect(screen.queryByText("Your order")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("warns when only some persisted items sold out", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      "qkit:cart:b1",
      JSON.stringify([
        { menuItemId: "kopi", quantity: 1 },
        { menuItemId: "teh", quantity: 1 },
      ]),
    );
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        remaining={{ kopi: 0 }}
      />,
    );
    // Teh survives, Kopi is gone → one honest heads-up.
    await user.click(await screen.findByText("Your order"));
    const cart = screen.getByText("Your order").closest("section")!;
    expect(within(cart).getByText("Teh")).toBeInTheDocument();
    expect(within(cart).queryByText("Kopi")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("1 item sold out and was removed");
  });

  it("persists the cart on change and clears it after placing the order", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(window.sessionStorage.getItem("qkit:cart:b1")).toContain("kopi");

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(window.sessionStorage.getItem("qkit:cart:b1")).toBeNull(),
    );
  });

  it("surfaces a server error and does not navigate", async () => {
    placeOrder.mockResolvedValue({ success: false, error: "Booth not found" });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Booth not found",
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("retries once on a transient failure, reusing the same idempotency key", async () => {
    placeOrder
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({
        success: true,
        orderNumber: "0042",
        boothId: "b1",
        accessToken: "tok42",
      });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    const [firstCallCode, , firstIdem] = placeOrder.mock.calls[0];
    const [secondCallCode, , secondIdem] = placeOrder.mock.calls[1];
    expect(firstCallCode).toBe("code123");
    expect(secondCallCode).toBe("code123");
    expect(secondIdem).toBe(firstIdem); // stable across the retry
    expect(placeOrder).toHaveBeenNthCalledWith(
      2,
      "code123",
      expect.objectContaining({ customerName: "Ada" }),
      secondIdem,
    );
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });
  it("replays the same key on manual retry after two ambiguous network failures", async () => {
    placeOrder
      .mockRejectedValueOnce(new Error("lost response"))
      .mockRejectedValueOnce(new Error("lost retry response"))
      .mockResolvedValueOnce({
        success: true,
        orderNumber: "0042",
        boothId: "b1",
        accessToken: "tok42",
      });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        /couldn't reach the stall.*safe to try again/i,
      ),
    );
    const name = within(dialog).getByLabelText("Your name");
    await user.clear(name);
    await user.type(name, "Grace");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Retry your previous order before changing its details.",
      ),
    );
    expect(placeOrder).toHaveBeenCalledTimes(2);
    await user.clear(name);
    await user.type(name, "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42"),
    );
    expect(placeOrder).toHaveBeenCalledTimes(3);
    expect(new Set(placeOrder.mock.calls.map((call) => call[2])).size).toBe(1);
  });
  it("recovers the same request key after remount without storing customer details", async () => {
    placeOrder
      .mockRejectedValueOnce(new Error("Lost response"))
      .mockRejectedValueOnce(new Error("Lost retry"));
    const user = userEvent.setup();
    const mounted = renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
    const firstKey = placeOrder.mock.calls[0][2];
    const stored = window.sessionStorage.getItem("qkit:pending-order:b1")!;
    expect(JSON.parse(stored)).toEqual({
      key: firstKey,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(stored).not.toContain("Ada");
    expect(stored).not.toContain("kopi");
    mounted.unmount();
    renderForm();
    expect(toast.error).toHaveBeenCalledWith(
      "A previous order is awaiting confirmation. Re-enter the same details to recover it.",
    );
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42"),
    );
    expect(placeOrder.mock.calls[2][2]).toBe(firstKey);
    expect(window.sessionStorage.getItem("qkit:pending-order:b1")).toBeNull();
  });
  it("blocks a corrupt restored attempt instead of minting a second order key", async () => {
    window.sessionStorage.setItem("qkit:pending-order:b1", "{broken");
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not safely restore this order. Check with the vendor before ordering again.",
      ),
    );
    expect(placeOrder).not.toHaveBeenCalled();
  });
  it.each(["setItem", "getItem"] as const)(
    "allows an initial order and reuses its in-memory key when storage %s is blocked",
    async (method) => {
      placeOrder
        .mockRejectedValueOnce(new Error("Lost response"))
        .mockRejectedValueOnce(new Error("Lost retry"));
      const storage = vi
        .spyOn(Storage.prototype, method)
        .mockImplementation(() => {
          throw new DOMException("Blocked", "SecurityError");
        });
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("button", { name: "Add" }));
      await user.click(screen.getByRole("button", { name: /Continue/ }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText("Your name"), "Ada");
      await user.click(
        within(dialog).getByRole("button", { name: /Place order/ }),
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "This order can only be recovered on this page. Keep it open until confirmation.",
        ),
      );
      await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
      expect(push).not.toHaveBeenCalled();
      await user.click(
        within(dialog).getByRole("button", { name: /Place order/ }),
      );
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42"),
      );
      expect(placeOrder).toHaveBeenCalledTimes(3);
      expect(new Set(placeOrder.mock.calls.map((call) => call[2])).size).toBe(
        1,
      );
      storage.mockRestore();
    },
  );

  it("renders the phone field as optional and submits successfully when left blank", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");

    const phoneField = within(dialog).getByLabelText("Phone number (optional)");
    expect(phoneField).toBeInTheDocument();
    expect(phoneField).toHaveValue("");

    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({ customerName: "Ada", customerPhone: "" }),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
    expect(push).toHaveBeenCalledWith("/order/b1/0042?t=tok42");
  });

  it("tells the customer why their details are collected, with a privacy link, before the submit button", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText(
        /We use your name, and your phone number if you give one, to identify your order and send you order updates\./,
      ),
    ).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: "Privacy Policy" });
    expect(link).toHaveAttribute("href", "/legal/privacy");
    const submit = within(dialog).getByRole("button", { name: /Place order/ });
    expect(
      link.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("passes the phone value through to placeOrder when filled", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.type(
      within(dialog).getByLabelText("Phone number (optional)"),
      "+6591234567",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({
          customerName: "Ada",
          customerPhone: "+6591234567",
        }),
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      ),
    );
  });

  it("blocks submit and shows an error when the name is left blank", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(within(dialog).getByLabelText("Your name")).toHaveFocus(),
    );
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("disables ordering when the booth is closed", () => {
    renderForm(true);
    expect(screen.getByRole("button", { name: "Booth closed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});

describe("OrderForm allergen badges", () => {
  it("shows an icon badge for each of the item's allergens, tappable while browsing closed", () => {
    renderForm(true, [KOPI_WITH_ALLERGENS]);
    expect(
      screen.getByRole("button", { name: "Contains caffeine" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contains dairy" }),
    ).toBeInTheDocument();
  });

  it("shows nothing for an item with no allergens", () => {
    renderForm(false, [KOPI]);
    expect(
      screen.queryByRole("button", { name: /^Contains /i }),
    ).not.toBeInTheDocument();
  });

  it("reveals the allergen name on tap", async () => {
    const user = userEvent.setup();
    renderForm(false, [KOPI_WITH_ALLERGENS]);
    await user.click(screen.getByRole("button", { name: "Contains dairy" }));
    expect(await screen.findByText("Dairy")).toBeInTheDocument();
  });
});

describe("OrderForm category sections", () => {
  it("renders a flat Menu list with no category chrome when the booth has no categories", () => {
    renderForm();
    expect(screen.getByText("Menu")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("groups items under their category headings with a jump nav", () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[
          { ...KOPI, category: "drinks" },
          { ...TEH, category: "mains" },
        ]}
        menuCategories={[
          { id: "drinks", label: "Drinks" },
          { id: "mains", label: "Mains" },
        ]}
      />,
    );
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Drinks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mains" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("shows a single-category booth as flat, no jump nav, matching the no-category case", () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[{ ...KOPI, category: "drinks" }]}
        menuCategories={[{ id: "drinks", label: "Drinks" }]}
      />,
    );
    expect(screen.getByText("Menu")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("puts an item with an unmatched/stale category id under Other, last", () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[
          { ...KOPI, category: "drinks" },
          { ...TEH, category: "removed-category" },
        ]}
        menuCategories={[{ id: "drinks", label: "Drinks" }]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Drinks", "Other"]);
  });

  it("shows a thumbnail on a section's nav link from its first item's image", () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[
          { ...KOPI, category: "drinks", image_url: "/kopi.jpg" },
          { ...TEH, category: "mains" },
        ]}
        menuCategories={[
          { id: "drinks", label: "Drinks" },
          { id: "mains", label: "Mains" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation");
    const thumb = nav.querySelector("img");
    expect(thumb).toHaveAttribute("src", expect.stringContaining("kopi.jpg"));
  });

  it("shows no thumbnail on a section's nav link when none of its items have an image", () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[
          { ...KOPI, category: "drinks" },
          { ...TEH, category: "mains" },
        ]}
        menuCategories={[
          { id: "drinks", label: "Drinks" },
          { id: "mains", label: "Mains" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation").querySelector("img")).toBeNull();
  });
});

describe("OrderForm booth limits and basket holds", () => {
  const UUID = /^[0-9a-f-]{36}$/;

  it("says the per-order limit and refuses an add past it", async () => {
    const user = userEvent.setup();
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        maxPerOrder={1}
      />,
    );
    expect(
      screen.getByText("Up to 1 item per order at this stall."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add one Kopi" }));

    expect(toast.error).toHaveBeenCalledWith(
      "This stall takes up to 1 item per order.",
    );
    // An order limit alone is not stock, so there is nothing to hold.
    expect(holdCart).not.toHaveBeenCalled();
  });

  it("refuses an add past what the booth has left today, across items", async () => {
    const user = userEvent.setup();
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI, TEH]}
        left={1}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));

    expect(toast.error).toHaveBeenCalledWith(
      "This stall has only 1 item left today.",
    );
  });

  it("keeps an existing cart when anonymous holds consume all unsold stock", async () => {
    const user = userEvent.setup();
    holdCart.mockResolvedValue({
      remaining: { kopi: 0 },
      held: { kopi: 2 },
      left: 0,
      leftHeld: 2,
      maxPerOrder: null,
    });
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI]}
        remaining={{ kopi: 2 }}
        left={2}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add one Kopi" }));

    await waitFor(
      () =>
        expect(holdCart).toHaveBeenCalledWith(
          "b1",
          expect.stringMatching(UUID),
          [{ menuItemId: "kopi", quantity: 2 }],
        ),
      { timeout: 3000 },
    );
    expect(
      await screen.findByText(
        "Also in other baskets. Stock is checked when you order.",
      ),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /Continue · 2 items · \$7\.00/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );
    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({
          items: [expect.objectContaining({ menuItemId: "kopi", quantity: 2 })],
        }),
        expect.stringMatching(UUID),
        expect.stringMatching(UUID),
      ),
    );
  });

  it("allows customization when anonymous holds cover all unsold item stock", async () => {
    const user = userEvent.setup();
    holdCart.mockResolvedValue({
      remaining: { teh: 0 },
      held: { teh: 2 },
      left: null,
      leftHeld: 0,
      maxPerOrder: null,
    });
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[TEH]}
        remaining={{ teh: 2 }}
      />,
    );
    expect(
      await screen.findByText(
        "Also in other baskets. Stock is checked when you order.",
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Customize" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "stub-confirm" }));
    expect(
      screen.getByRole("button", { name: /Continue · 1 item · \$4\.00/ }),
    ).toBeEnabled();
  });

  it("trims a cart when an item actually sells, rather than being held", async () => {
    const user = userEvent.setup();
    holdCart.mockResolvedValue({
      remaining: { kopi: 1 },
      held: {},
      left: null,
      leftHeld: 0,
      maxPerOrder: null,
    });
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI]}
        remaining={{ kopi: 2 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add one Kopi" }));
    await waitFor(
      () =>
        expect(toast.error).toHaveBeenCalledWith(
          "1 item no longer available, removed from your order",
        ),
      { timeout: 3000 },
    );
    expect(screen.getByText("1 left")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue · 1 item · \$3\.50/ }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add one Kopi" }));
    expect(toast.error).toHaveBeenCalledWith("Only 1 left");
  });

  it("disables an item whose actual stock is exhausted", async () => {
    holdCart.mockResolvedValue({
      remaining: { kopi: 0 },
      held: {},
      left: null,
      leftHeld: 0,
      maxPerOrder: null,
    });
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI]}
        remaining={{ kopi: 2 }}
      />,
    );
    expect(
      await screen.findByRole(
        "button",
        { name: "Sold out" },
        { timeout: 3000 },
      ),
    ).toBeDisabled();
  });

  it("removes an existing cart when the actual daily stock is exhausted", async () => {
    const user = userEvent.setup();
    holdCart.mockResolvedValue({
      remaining: {},
      held: {},
      left: 0,
      leftHeld: 0,
      maxPerOrder: null,
    });
    render(
      <OrderForm code="code123" boothId="b1" menuItems={[KOPI]} left={2} />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(
      () =>
        expect(toast.error).toHaveBeenCalledWith(
          "1 item no longer available, removed from your order",
        ),
      { timeout: 3000 },
    );
    expect(
      screen.getByRole("button", { name: "Add items to order" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(toast.error).toHaveBeenCalledWith("This stall has sold out.");
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("sends the hold's session with the order so placing it releases the hold", async () => {
    const user = userEvent.setup();
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI]}
        remaining={{ kopi: 5 }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(holdCart).toHaveBeenCalled(), { timeout: 3000 });
    const session = holdCart.mock.calls[0][1];

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your name"), "Ada");
    await user.click(
      within(dialog).getByRole("button", { name: /Place order/ }),
    );

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        "code123",
        expect.objectContaining({ customerName: "Ada" }),
        expect.stringMatching(UUID),
        session,
      ),
    );
  });

  it("does not hold for a booth that is closed", async () => {
    render(
      <OrderForm
        code="code123"
        boothId="b1"
        menuItems={[KOPI]}
        remaining={{ kopi: 5 }}
        closed
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(holdCart).not.toHaveBeenCalled();
  });
});

describe("OrderForm stock notice", () => {
  it.each([1, 3, 10])(
    "says how many items are left today when stock is low: %s",
    (left) => {
      render(
        <OrderForm
          code="code123"
          boothId="b1"
          menuItems={[KOPI]}
          left={left}
        />,
      );
      expect(
        screen.getByText(
          `Only ${left} ${left === 1 ? "item" : "items"} left today`,
        ),
      ).toBeInTheDocument();
      // A one-off event never reopens tomorrow, so the notice promises nothing.
      expect(
        screen.getByText("Once they're gone, this stall stops taking orders."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/tomorrow/)).not.toBeInTheDocument();
    },
  );

  it.each([11, 40, 500])(
    "says nothing about stock while plenty is left: %s",
    (left) => {
      render(
        <OrderForm
          code="code123"
          boothId="b1"
          menuItems={[KOPI]}
          left={left}
        />,
      );
      expect(screen.queryByText(/left today/)).not.toBeInTheDocument();
    },
  );

  it("includes unsold held items in the daily stock count", async () => {
    holdCart.mockResolvedValue({
      remaining: {},
      held: {},
      left: 1,
      leftHeld: 2,
      maxPerOrder: null,
    });
    render(
      <OrderForm code="code123" boothId="b1" menuItems={[KOPI]} left={3} />,
    );
    expect(
      await screen.findByText(
        "Other baskets also contain these items. Stock is checked when you order.",
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Only 3 items left today")).toBeInTheDocument();
    expect(screen.queryByText("Only 1 item left today")).toBeNull();
  });

  it("allows daily stock held in other baskets without exceeding the order limit", async () => {
    const user = userEvent.setup();
    holdCart.mockResolvedValue({
      remaining: {},
      held: {},
      left: 0,
      leftHeld: 3,
      maxPerOrder: 1,
    });
    render(
      <OrderForm code="code123" boothId="b1" menuItems={[KOPI]} left={3} />,
    );
    expect(
      await screen.findByText(
        "Other baskets also contain these items. Stock is checked when you order.",
        {},
        {
          timeout: 3000,
        },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Only 3 items left today")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add one Kopi" }));
    expect(toast.error).toHaveBeenCalledWith(
      "This stall takes up to 1 item per order.",
    );
    expect(
      screen.getByRole("button", { name: /Continue · 1 item · \$3\.50/ }),
    ).toBeEnabled();
  });
});
