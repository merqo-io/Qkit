// @vitest-environment jsdom
//
// Follows the pattern established in src/app/order/[boothId]/[orderNumber]/
// page.dom.test.tsx: page.tsx is a plain async Server Component with no
// RSC-specific machinery, so it can be awaited directly and its returned
// element tree rendered like any other component. BoothForm is stubbed out
// (it has its own dom test file) so this stays focused on the page's own
// `?mode=event` wiring: the eventMode prop it passes down and the extra
// intro copy + "buy an event pass" link it renders.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import NewBoothPage from "./page";
import type { Entitlement } from "@/lib/plan";

const {
  requireEntitledVendor,
  canAddBooth,
  redirect,
  headCount,
  vendorPaymentSetup,
} = vi.hoisted(() => ({
  requireEntitledVendor: vi.fn(),
  canAddBooth: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  headCount: vi.fn(),
  vendorPaymentSetup: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({ requireEntitledVendor }));
vi.mock("@/lib/plan", () => ({ canAddBooth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({ eq: () => headCount() }),
      }),
    }),
}));
vi.mock("@/lib/paykit/payment-setup", () => ({ vendorPaymentSetup }));
vi.mock("../booth-form", () => ({
  BoothForm: ({
    eventMode,
    paymentSetup,
    initial,
  }: {
    eventMode?: boolean;
    paymentSetup: { state: string };
    initial?: unknown;
  }) => (
    <div
      data-testid="booth-form"
      data-event-mode={String(!!eventMode)}
      data-payment-setup={paymentSetup.state}
      data-has-initial={String(initial !== undefined)}
    />
  ),
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

beforeEach(() => {
  vi.clearAllMocks();
  requireEntitledVendor.mockResolvedValue({
    vendor: { id: "v1", social_links: {} },
    entitlement: ENTITLEMENT,
  });
  canAddBooth.mockReturnValue(true);
  headCount.mockResolvedValue({ count: 0 });
  vendorPaymentSetup.mockResolvedValue({ state: "none" });
});

describe("NewBoothPage", () => {
  it("renders the plain new-booth heading and passes eventMode: false by default", async () => {
    const jsx = await NewBoothPage({
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    expect(screen.getByText("New booth")).toBeInTheDocument();
    expect(screen.getByTestId("booth-form")).toHaveAttribute(
      "data-event-mode",
      "false",
    );
    expect(screen.queryByText(/buy an event pass/i)).not.toBeInTheDocument();
  });

  it("renders the event-mode intro and passes eventMode: true for ?mode=event", async () => {
    const jsx = await NewBoothPage({
      searchParams: Promise.resolve({ mode: "event" }),
    });
    render(jsx);

    expect(screen.getByText("Set up for an event")).toBeInTheDocument();
    expect(screen.getByTestId("booth-form")).toHaveAttribute(
      "data-event-mode",
      "true",
    );
    const passLink = screen.getByRole("link", { name: /buy an event pass/i });
    expect(passLink).toHaveAttribute("href", "/dashboard/plan");
  });

  it("hands the form what the vendor has on file in paykit, and no stored setting", async () => {
    vendorPaymentSetup.mockResolvedValue({ state: "paynow", name: "Cart" });
    const jsx = await NewBoothPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(vendorPaymentSetup).toHaveBeenCalledWith("v1");
    const form = screen.getByTestId("booth-form");
    expect(form).toHaveAttribute("data-payment-setup", "paynow");
    expect(form).toHaveAttribute("data-has-initial", "false");
  });

  it("still redirects to /dashboard/plan when the plan gate blocks a new booth, event mode or not", async () => {
    canAddBooth.mockReturnValue(false);
    await expect(
      NewBoothPage({ searchParams: Promise.resolve({ mode: "event" }) }),
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/plan");
  });
});
