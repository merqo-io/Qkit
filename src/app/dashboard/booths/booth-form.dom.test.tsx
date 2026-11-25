// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothForm } from "./booth-form";
import type { Entitlement } from "@/lib/plan";
import { boothFormSchema } from "@/lib/schemas";

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
  founder: false,
  eventPass: null,
  counterOps: false,
  statsSince: null,
};

const TOGGLE_LABEL = "Walk-up entry by default";
const NO_SETUP = { state: "none" } as const;
const PAYNOW_SETUP = { state: "paynow", name: "Cart" } as const;
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

const EDIT_BASE = {
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
  pickup_scan_enabled: false,
  paykit_booking_id: null,
  daily_cup_cap: null,
};

type Initial = NonNullable<Parameters<typeof BoothForm>[0]["initial"]>;

async function renderEdit(
  overrides: Partial<Initial> = {},
  options: {
    entitlement?: Entitlement;
    paymentSetup?: Parameters<typeof BoothForm>[0]["paymentSetup"];
    expand?: boolean;
  } = {},
) {
  const user = userEvent.setup();
  render(
    <BoothForm
      vendorId="v1"
      entitlement={options.entitlement ?? ENTITLEMENT}
      vendorSocialLinks={{}}
      paymentSetup={options.paymentSetup ?? NO_SETUP}
      initial={{ ...EDIT_BASE, ...overrides }}
    />,
  );
  if (options.expand !== false) {
    await user.click(screen.getByRole("button", { name: "More settings" }));
  }
  return user;
}

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
  it("submits walkup_default: false", async () => {
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
      expect.objectContaining({ walkup_default: false }),
      [],
    );
  });

  it("toggling it on submits walkup_default: true", async () => {
    const user = await renderEdit();
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: true }),
      [],
    );
  });

  it("is pre-set in event mode and still submitted while the create form hides it", async () => {
    const user = userEvent.setup();
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        eventMode
      />,
    );
    expect(
      screen.queryByRole("switch", { name: TOGGLE_LABEL }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ walkup_default: true }),
      [],
    );
  });

  it("reflects a persisted true value when editing an existing booth", async () => {
    await renderEdit({ walkup_default: true });
    expect(screen.getByRole("switch", { name: TOGGLE_LABEL })).toBeChecked();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("persists an edit turning it off", async () => {
    saveBooth.mockResolvedValue({ success: true, boothId: BOOTH_ID });
    const user = await renderEdit({ walkup_default: true });
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

  it("hands the Payment section what paykit holds", async () => {
    await renderEdit({}, { paymentSetup: PAYNOW_SETUP });

    expect(paymentButton()).toHaveAttribute("data-setup", "paynow");
    expect(paymentButton()).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["left off", false],
    ["switched on", true],
  ])("submits the switch %s, and no payment detail", async (_, on) => {
    const user = await renderEdit({}, { paymentSetup: PAYNOW_SETUP });
    if (on) await user.click(paymentButton());
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ takes_payment: on }),
      [],
    );
    expect(saveBooth.mock.calls[0][0]).not.toHaveProperty("payment");
  });

  it("opens an existing booth on its stored setting", async () => {
    await renderEdit({ takes_payment: true }, { paymentSetup: PAYNOW_SETUP });

    expect(paymentButton()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("BoothForm paykit booking id", () => {
  it("is hidden while walk-up default is off, and appears once toggled on", async () => {
    const user = await renderEdit();
    expect(
      screen.queryByLabelText("Paykit booking ID"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    expect(screen.getByLabelText("Paykit booking ID")).toBeInTheDocument();
  });

  it("submits the typed booking id alongside the rest of the form", async () => {
    const user = await renderEdit();
    await user.click(screen.getByRole("switch", { name: TOGGLE_LABEL }));
    await user.type(screen.getByLabelText("Paykit booking ID"), "book-42");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ paykit_booking_id: "book-42" }),
      [],
    );
  });

  it("prefills from an existing booth and shows its fetched status", async () => {
    await renderEdit({
      walkup_default: true,
      paykit_booking_id: "book-42",
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
    });
    expect(screen.getByLabelText("Paykit booking ID")).toHaveValue("book-42");
    expect(screen.getByText("Fully paid")).toBeInTheDocument();
  });
});

describe("BoothForm menu section", () => {
  it("shows no menu section on the create form", () => {
    renderNewBooth({ ...ENTITLEMENT, stockCaps: true });
    expect(
      screen.queryByRole("heading", { name: "Menu" }),
    ).not.toBeInTheDocument();
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

  it("links to the menu-manager page with the item count, for an existing booth", async () => {
    await renderEdit({ menuItemCount: 4 });
    const link = screen.getByRole("link", { name: /4 items/ });
    expect(link).toHaveAttribute("href", `/dashboard/booths/${BOOTH_ID}/menu`);
  });
});

describe("BoothForm per-order item limit", () => {
  const LIMIT_LABEL = "Max items per order";

  it("submits null when left blank, meaning no limit", async () => {
    const user = await renderEdit();
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ max_items_per_order: null }),
      [],
    );
  });

  it("submits the number the vendor typed, on a plan without stock caps too", async () => {
    const user = await renderEdit();
    await user.type(screen.getByLabelText(LIMIT_LABEL), "4");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ max_items_per_order: 4 }),
      [],
    );
  });

  it("locks the booth's daily total on a plan without stock caps", async () => {
    await renderEdit();
    expect(screen.queryByLabelText("Daily item limit")).not.toBeInTheDocument();
    expect(screen.getByText("Daily item limit")).toBeInTheDocument();
  });
});

describe("BoothForm daily limit on a plan without stock caps", () => {
  it("shows a limit that is already set, and keeps it on save", async () => {
    const user = await renderEdit({ daily_cup_cap: 200 });
    expect(screen.getByText("Set to 200")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: 200 }),
      [],
    );
  });

  it("lets the vendor remove it", async () => {
    const user = await renderEdit({ daily_cup_cap: 200 });
    await user.click(screen.getByRole("button", { name: "Remove limit" }));
    expect(screen.queryByText("Set to 200")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: null }),
      [],
    );
  });
});

describe("BoothForm daily cup cap", () => {
  const CAP_LABEL = "Daily item limit";
  const ENTITLEMENT_WITH_CAPS: Entitlement = {
    ...ENTITLEMENT,
    stockCaps: true,
  };

  it("submits null when left blank, meaning no limit", async () => {
    const user = await renderEdit({}, { entitlement: ENTITLEMENT_WITH_CAPS });
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: null }),
      [],
    );
  });

  it("submits the number the vendor typed", async () => {
    const user = await renderEdit({}, { entitlement: ENTITLEMENT_WITH_CAPS });
    await user.type(screen.getByLabelText(CAP_LABEL), "200");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ daily_cup_cap: 200 }),
      [],
    );
  });

  it("prefills a booth's saved cap when editing", async () => {
    await renderEdit(
      { daily_cup_cap: 200 },
      { entitlement: ENTITLEMENT_WITH_CAPS },
    );
    expect(screen.getByLabelText(CAP_LABEL)).toHaveValue(200);
    expect(
      within(sectionTitled("Limits")).getByRole("button", {
        name: "Start new service",
      }),
    ).toBeInTheDocument();
  });

  it("offers no new service for a booth with no saved limit", async () => {
    await renderEdit({}, { entitlement: ENTITLEMENT_WITH_CAPS });
    expect(
      screen.queryByRole("button", { name: "Start new service" }),
    ).not.toBeInTheDocument();
  });
});

function renderNewBooth(entitlement: Entitlement = ENTITLEMENT) {
  return render(
    <BoothForm
      vendorId="v1"
      entitlement={entitlement}
      vendorSocialLinks={{}}
      paymentSetup={NO_SETUP}
    />,
  );
}

function sectionTitled(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section around ${title}`);
  return section;
}

describe("BoothForm layout", () => {
  it("puts both item limits in their own Limits card, out of Order flow", async () => {
    await renderEdit({}, { entitlement: { ...ENTITLEMENT, stockCaps: true } });
    const limits = sectionTitled("Limits");
    expect(
      within(limits).getByLabelText("Daily item limit"),
    ).toBeInTheDocument();
    expect(
      within(limits).getByLabelText("Max items per order"),
    ).toBeInTheDocument();

    const flow = sectionTitled("Order flow");
    expect(within(flow).queryByText(/item limit|items per order/i)).toBeNull();
    expect(
      within(flow).getByRole("switch", { name: "Hold prep until arrival" }),
    ).toBeInTheDocument();
    expect(
      within(flow).getByRole("switch", { name: TOGGLE_LABEL }),
    ).toBeInTheDocument();
  });

  it("keeps each row's explanation behind a tap-to-open hint", async () => {
    const user = await renderEdit();
    expect(screen.queryByText(/like ice cream/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "About holding prep until arrival" }),
    );
    expect(await screen.findByText(/like ice cream/i)).toBeInTheDocument();
  });
});

describe("BoothForm short create form", () => {
  const HIDDEN_HEADINGS = [
    "Order flow",
    "Limits",
    "Menu",
    "Payment",
    "Printing",
    "Pickup",
    "Social links",
  ];

  it("renders only Name & photo and Hours & availability, with one Save", () => {
    renderNewBooth({ ...ENTITLEMENT, stockCaps: true });
    expect(
      screen.getByRole("heading", { name: "Name & photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hours & availability" }),
    ).toBeInTheDocument();
    for (const name of HIDDEN_HEADINGS) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "More settings" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /save booth/i })).toHaveLength(
      1,
    );
  });

  it("submits the same defaults for the fields it no longer shows", async () => {
    const user = userEvent.setup();
    renderNewBooth({ ...ENTITLEMENT, stockCaps: true });
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      {
        boothId: undefined,
        menu_categories: [],
        name: "Ice Cream Cart",
        image_url: null,
        is_active: true,
        hours: null,
        takes_payment: false,
        social_links: null,
        requires_arrival_confirm: false,
        walkup_default: false,
        print_enabled: false,
        pickup_scan_enabled: false,
        paykit_booking_id: null,
        daily_cup_cap: null,
        max_items_per_order: null,
      },
      [],
    );
  });
});

describe("BoothForm More settings on edit", () => {
  it("keeps the rest collapsed behind a labelled, expandable control", async () => {
    const user = await renderEdit({}, { expand: false });
    const toggle = screen.getByRole("button", { name: "More settings" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("heading", { name: "Name & photo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Payment" }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const name of [
      "Order flow",
      "Menu",
      "Payment",
      "Printing",
      "Pickup",
      "Social links",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("opens and scrolls to Payment when the page is reached with #payment", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.location.hash = "#payment";
    try {
      await renderEdit({}, { expand: false });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "More settings" }),
        ).toHaveAttribute("aria-expanded", "true"),
      );
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      expect(scroll.mock.contexts[0]).toHaveProperty("id", "payment");
    } finally {
      window.location.hash = "";
    }
  });

  it("opens and scrolls to Payment on a later hashchange to #payment", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      await renderEdit({}, { expand: false });
      expect(
        screen.getByRole("button", { name: "More settings" }),
      ).toHaveAttribute("aria-expanded", "false");
      window.location.hash = "#payment";
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "More settings" }),
        ).toHaveAttribute("aria-expanded", "true"),
      );
      await waitFor(() => expect(scroll).toHaveBeenCalled());
    } finally {
      window.location.hash = "";
    }
  });

  it("keeps values changed inside it when collapsed again before saving", async () => {
    const user = await renderEdit({}, { paymentSetup: PAYNOW_SETUP });
    await user.click(screen.getByRole("button", { name: "takes payment" }));
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ takes_payment: true }),
      [],
    );
  });

  it("opens when the save is rejected for a field inside it", async () => {
    const user = await renderEdit({}, { expand: false });
    await user.click(screen.getByRole("button", { name: "More settings" }));
    await user.type(screen.getByLabelText("Max items per order"), "0");
    await user.click(screen.getByRole("button", { name: "More settings" }));
    expect(
      screen.getByRole("button", { name: "More settings" }),
    ).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "More settings" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});

describe("BoothForm self-checkout pickup", () => {
  const SWITCH = "Self-checkout pickup";

  it("has its own Pickup card and starts off", async () => {
    const user = await renderEdit();
    const counter = sectionTitled("Pickup");
    expect(
      within(sectionTitled("Printing")).queryByRole("switch", { name: SWITCH }),
    ).not.toBeInTheDocument();
    const toggle = within(counter).getByRole("switch", { name: SWITCH });
    expect(toggle).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ pickup_scan_enabled: false }),
      [],
    );
  });

  it("opens on the booth's saved value and saves a change", async () => {
    const user = await renderEdit({ pickup_scan_enabled: true });
    const toggle = screen.getByRole("switch", { name: SWITCH });
    expect(toggle).toBeChecked();

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ pickup_scan_enabled: false }),
      [],
    );
  });

  it("shows the kiosk link and copy button only with the switch on", async () => {
    const user = await renderEdit();
    expect(
      screen.queryByRole("link", { name: /open kiosk/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: SWITCH }));
    expect(screen.getByRole("link", { name: /open kiosk/i })).toHaveAttribute(
      "href",
      `/order/${BOOTH_ID}/pickup`,
    );
    expect(
      screen.getByRole("button", { name: /copy link/i }),
    ).toBeInTheDocument();
  });
});

describe("BoothForm section hints", () => {
  const CREATE_HINTS = [
    ["About name and photo", /banner photo show at the top/i],
    ["About hours", /only while the booth is open/i],
  ] as const;

  it("opens each hint to its text in create mode", async () => {
    const user = userEvent.setup();
    renderNewBooth();
    for (const [label, text] of CREATE_HINTS) {
      await user.click(screen.getByRole("button", { name: label }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      await user.keyboard("{Escape}");
    }
  });

  it("opens each hint, including pickup, in edit mode", async () => {
    const user = await renderEdit();
    for (const [label, text] of [
      ...CREATE_HINTS,
      ["About self-checkout pickup", /pickup shelf/i],
    ] as const) {
      await user.click(screen.getByRole("button", { name: label }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      await user.keyboard("{Escape}");
    }
  });
});

describe("BoothForm More settings opening rules", () => {
  const moreToggle = () =>
    screen.getByRole("button", { name: "More settings" });

  it("opens for a native-invalid control inside the collapsed panel", async () => {
    await renderEdit({}, { expand: false });
    const hidden = document
      .getElementById(moreToggle().getAttribute("aria-controls") ?? "")
      ?.querySelector("input");
    if (!hidden) throw new Error("no input in the panel");
    fireEvent.invalid(hidden);
    expect(moreToggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("stays closed for an empty name", async () => {
    await renderEdit({}, { expand: false });
    fireEvent.invalid(screen.getByLabelText("Booth name"));
    expect(moreToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("stays closed for an invalid top-block control other than the name", async () => {
    await renderEdit({}, { expand: false });
    const control = sectionTitled("Hours & availability").querySelector(
      "input, button",
    );
    if (!control) throw new Error("no hours control");
    fireEvent.invalid(control);
    expect(moreToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("stays closed for a form-level validation error with no field path", async () => {
    const user = await renderEdit({}, { expand: false });
    const spy = vi.spyOn(boothFormSchema, "safeParse").mockReturnValueOnce({
      success: false,
      error: { issues: [{ code: "custom", path: [], message: "Bad form" }] },
    } as unknown as ReturnType<typeof boothFormSchema.safeParse>);
    await user.click(screen.getByRole("button", { name: /save booth/i }));
    expect(saveBooth).not.toHaveBeenCalled();
    expect(moreToggle()).toHaveAttribute("aria-expanded", "false");
    spy.mockRestore();
  });
});

describe("BoothForm event-mode create note", () => {
  const NOTE = /walk-up entry is on for this event booth/i;

  it("shows in event mode", () => {
    render(
      <BoothForm
        vendorId="v1"
        entitlement={ENTITLEMENT}
        vendorSocialLinks={{}}
        paymentSetup={NO_SETUP}
        eventMode
      />,
    );
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("is absent in the normal create mode", () => {
    renderNewBooth();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
