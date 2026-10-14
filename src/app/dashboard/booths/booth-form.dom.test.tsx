// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothForm } from "./booth-form";
import type { Entitlement } from "@/lib/plan";

const { saveBooth, deleteBooth } = vi.hoisted(() => ({
  saveBooth: vi.fn(),
  deleteBooth: vi.fn(),
}));
vi.mock("./actions", () => ({ saveBooth, deleteBooth }));

// Every subcomponent below has its own dom test file — stub them out here so
// this file is isolated to booth-form's own state wiring (in particular the
// walk-up-default toggle), not their internals.
vi.mock("./working-hours-editor", () => ({ WorkingHoursEditor: () => null }));
// Stands in for the Payment section's switch: shows what the form handed it
// and flips the value when pressed.
vi.mock("./payment-section", () => ({
  PaymentSection: ({
    setup,
    value,
    onChange,
  }: {
    setup: { state: string };
    value: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <button
      type="button"
      data-setup={setup.state}
      aria-pressed={value}
      onClick={() => onChange(!value)}
    >
      takes payment
    </button>
  ),
}));
vi.mock("./social-links-section", () => ({ SocialLinksSection: () => null }));
vi.mock("./close-booth-control", () => ({ CloseBoothControl: () => null }));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ImageUploader: () => null,
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

const ENTITLEMENT: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
};

const TOGGLE_LABEL = "Default to walk-up order entry";
const NO_SETUP = { state: "none" } as const;
const PAYNOW_SETUP = { state: "paynow", name: "Cart" } as const;
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  saveBooth.mockResolvedValue({ success: true, boothId: "b1" });
});

describe("BoothForm walk-up-default toggle", () => {
  it("reports uncertain save failures without clearing inputs or deleting uploaded objects", async () => {
    saveBooth.mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Could not save the booth. Refresh to check its status before retrying.",
      ),
    );
    expect(screen.getByLabelText("Booth name")).toHaveValue("Ice Cream Cart");
    expect(screen.getByRole("button", { name: /save booth/i })).toBeEnabled();
    expect(routerReplace).not.toHaveBeenCalled();
  });
  it("starts off for a plain new booth and submits walkup_default: false", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    const toggle = screen.getByRole("switch", { name: TOGGLE_LABEL });
    expect(toggle).not.toBeChecked();

    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: false }),
      [],
    );
  });

  it("toggling it on submits walkup_default: true", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: true }),
      [],
    );
  });

  it("starts pre-checked (and shows a Recommended badge) in event mode", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        eventMode
      />,
    );
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL })).toBeChecked();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("reflects a persisted true value when editing an existing booth", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 0,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: true,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: null,
        }}
      />,
    );
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL })).toBeChecked();
    // No Recommended badge outside the dedicated event-mode create flow.
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("persists an edit turning it off", async () => {
    saveBooth.mockResolvedValue({ success: true, boothId: BOOTH_ID });
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 0,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: true,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: null,
        }}
      />,
    );
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ boothId: BOOTH_ID, walkup_default: false }),
      [],
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("BoothForm payment switch", () => {
  function paymentButton() {
    return screen.getByRole("button", { name: "takes payment" });
  }

  it("hands the Payment section what paykit holds and opens a new booth off", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={PAYNOW_SETUP}
      />,
    );

    expect(paymentButton()).toHaveAttribute("data-setup", "paynow");
    expect(paymentButton()).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["left off", false],
    ["switched on", true],
  ])("submits the switch %s, and no payment detail", async (_, on) => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={PAYNOW_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    if (on) await user.click(paymentButton());
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ takes_payment: on }),
      [],
    );
    expect(saveBooth.mock.calls[0][0]).not.toHaveProperty("payment");
  });

  it("opens an existing booth on its stored setting", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={PAYNOW_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 0,
          takes_payment: true,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: false,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: null,
        }}
      />,
    );

    expect(paymentButton()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("BoothForm paykit booking id", () => {
  it("is hidden while walk-up default is off, and appears once toggled on", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    expect(
      screen.queryByLabelText("Paykit booking ID"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    expect(screen.getByLabelText("Paykit booking ID")).toBeInTheDocument();
  });

  it("submits the typed booking id alongside the rest of the form", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.type(screen.getByLabelText("Paykit booking ID"), "book-42");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ paykit_booking_id: "book-42" }),
      [],
    );
  });

  it("prefills from an existing booth and shows its fetched status", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 0,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: true,
          print_enabled: false,
          paykit_booking_id: "book-42",
          daily_cup_cap: null,
          bookingStatus: {
            bookingId: "book-42",
            status: "fully_paid",
            eventDate: "2026-09-01",
            depositAmountCents: 20000,
            balanceAmountCents: 30000,
            totalAmountCents: 50000,
            depositConfirmed: true,
            balanceConfirmed: true,
          },
        }}
      />,
    );
    expect(screen.getByLabelText("Paykit booking ID")).toHaveValue("book-42");
    expect(screen.getByText("Fully paid")).toBeInTheDocument();
  });
});

describe("BoothForm menu section", () => {
  it("shows a hint instead of a link for a brand-new, unsaved booth", () => {
    // With stock caps, so the only link the form could carry is the menu one
    // (a plan without them shows an upgrade link on the daily total).
    render(
      <BoothForm
        vendorId="v1"
        entitlement={{ ...ENTITLEMENT, stockCaps: true }}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    expect(
      screen.getByText("Save this booth to start building its menu."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("redirects straight to the menu page after creating a new booth", async () => {
    saveBooth.mockResolvedValue({ success: true, boothId: "b-new" });
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/dashboard/booths/b-new/menu?new=1",
      ),
    );
  });

  it("redirects to the booth list after saving an existing booth", async () => {
    saveBooth.mockResolvedValue({ success: true, boothId: BOOTH_ID });
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 3,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: false,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: null,
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/dashboard/booths"),
    );
  });

  it("links to the menu-manager page with the item count, for an existing booth", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 4,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: false,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: null,
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /4 items/ });
    expect(link).toHaveAttribute("href", `/dashboard/booths/${BOOTH_ID}/menu`);
  });
});

describe("BoothForm per-order item limit", () => {
  const LIMIT_LABEL = "Most items in one order";

  it("submits null when left blank, meaning no limit", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ max_items_per_order: null }),
      [],
    );
  });

  it("submits the number the vendor typed, on a plan without stock caps too", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.type(screen.getByLabelText(LIMIT_LABEL), "4");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ max_items_per_order: 4 }),
      [],
    );
  });

  it("locks the booth's daily total on a plan without stock caps", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    expect(
      screen.queryByLabelText("Stop after this many items each day"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Stop after this many items each day"),
    ).toBeInTheDocument();
  });
});

describe("BoothForm daily limit on a plan without stock caps", () => {
  const initial = {
    boothId: BOOTH_ID,
    name: "Ice Cream Cart",
    image_url: null,
    is_active: true,
    hours: null,
    menuItemCount: 0,
    takes_payment: false,
    social_links: null,
    requires_arrival_confirm: false,
    walkup_default: false,
    print_enabled: false,
    paykit_booking_id: null,
    daily_cup_cap: 200,
  };

  it("shows a limit that is already set, and keeps it on save", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={initial}
      />,
    );
    expect(screen.getByText(/Set to 200\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: 200 }),
      [],
    );
  });

  it("lets the vendor remove it", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={initial}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove limit" }));
    expect(screen.queryByText(/Set to 200\./)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: null }),
      [],
    );
  });
});

describe("BoothForm daily cup cap", () => {
  const CAP_LABEL = "Stop after this many items each day";
  const ENTITLEMENT_WITH_CAPS: Entitlement = {
    ...ENTITLEMENT,
    stockCaps: true,
  };

  it("submits null when left blank, meaning no limit", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT_WITH_CAPS}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: null }),
      [],
    );
  });

  it("submits the number the vendor typed", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT_WITH_CAPS}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
      />,
    );
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.type(screen.getByLabelText(CAP_LABEL), "200");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: 200 }),
      [],
    );
  });

  it("prefills a booth's saved cap when editing", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT_WITH_CAPS}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        initial={{
          boothId: BOOTH_ID,
          name: "Ice Cream Cart",
          image_url: null,
          is_active: true,
          hours: null,
          menuItemCount: 0,
          takes_payment: false,
          social_links: null,
          requires_arrival_confirm: false,
          walkup_default: false,
          print_enabled: false,
          paykit_booking_id: null,
          daily_cup_cap: 200,
        }}
      />,
    );
    expect(screen.getByLabelText(CAP_LABEL)).toHaveValue(200);
  });
});
