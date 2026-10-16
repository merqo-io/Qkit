// @vitest-environment jsdom
// page.tsx is awaited and rendered directly (dashboard/layout.dom.test.tsx's
// approach); nested async/side-effecting children are stubbed so this stays
// focused on TelegramConnect gating and the redirect guard.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OrderStatus } from "@/lib/types";
import OrderStatusPage from "./page";
import { shortDateTime } from "@/lib/tz";

const { notFoundMock, redirectMock, headersMock } = vi.hoisted(() => ({
  // Both throw to abort rendering — mirrors the real next/navigation
  // behavior so a test hitting either branch doesn't fall through into the
  // rest of the function body, same as it never would in production.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  // Real, allowlisted host by default; individual tests override to probe
  // resolveOrigin's host-allowlist behavior.
  headersMock: vi.fn(() =>
    Promise.resolve(new Headers({ host: "booth.merqo.io" })),
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./order-status-poller", () => ({ OrderStatusPoller: () => null }));
vi.mock("./earn-link", () => ({ EarnLink: () => null }));
vi.mock("./telegram-connect", () => ({
  TelegramConnect: () => <div data-testid="telegram-connect" />,
}));
vi.mock("@/lib/merqo/vendor-profile", () => ({
  getOrCreateVendorProfile: vi.fn().mockResolvedValue(null),
}));
// Exposes the exact URL passed to react-qr-code as a DOM attribute, so tests
// can assert what resolveOrigin actually embedded rather than just presence.
vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="pickup-qr" data-value={value} />
  ),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "00000000-0000-4000-8000-000000000002";
const VENDOR_ID = "00000000-0000-4000-8000-000000000003";
const ORDER_NUMBER = "1";

// Fresh by default: an order older than STALE_ORDER_VIEW_HOURS renders the
// "older order" notice instead of the live affordances (see resolveStaleView
// in page.tsx), which is its own describe block below.
function makeOrder(status: OrderStatus, createdAt = new Date().toISOString()) {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    booth_id: BOOTH_ID,
    order_number: ORDER_NUMBER,
    access_token: TOKEN,
    status,
    payment_status: "not_required",
    customer_name: "Alex",
    items: [],
    total_cents: 0,
    created_at: createdAt,
  };
}

const booth = {
  name: "Kopi Corner",
  vendor_id: VENDOR_ID,
  social_links: null,
};

// Minimal valid boardSettingsSchema shape (see @/lib/schemas), required
// fields filled in.
const VALID_BOARD_SETTINGS = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  undo_seconds: 4,
  daily_order_number_reset: false,
  show_wait_estimate: true,
  default_prep_minutes: null,
  ready_auto_clear_min: null,
};

const { maybeSingle, boothSingle, vendorMaybeSingle } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  boothSingle: vi.fn(),
  vendorMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "orders")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ eq: () => ({ maybeSingle }) }),
              }),
            }),
          };
        if (table === "booths")
          return {
            select: () => ({ eq: () => ({ single: boothSingle }) }),
          };
        if (table === "vendors")
          return {
            select: () => ({ eq: () => ({ maybeSingle: vendorMaybeSingle }) }),
          };
        throw new Error(`unexpected table ${table}`);
      },
    }),
}));

beforeEach(() => {
  maybeSingle.mockReset();
  boothSingle.mockReset().mockResolvedValue({ data: booth });
  // No board_settings row -> boardSettingsSchema fails -> resolveOrderDisplay
  // degrades to the real order_number, no second query.
  vendorMaybeSingle.mockReset().mockResolvedValue({ data: null });
  notFoundMock.mockClear();
  redirectMock.mockClear();
  headersMock
    .mockReset()
    .mockResolvedValue(new Headers({ host: "booth.merqo.io" }));
});

async function renderPage(status: OrderStatus, createdAt?: string) {
  maybeSingle.mockResolvedValue({
    data: makeOrder(status, createdAt),
    error: null,
  });
  const jsx = await OrderStatusPage({
    params: Promise.resolve({ boothId: BOOTH_ID, orderNumber: ORDER_NUMBER }),
    searchParams: Promise.resolve({ t: TOKEN }),
  });
  return render(jsx);
}

describe("OrderStatusPage — TelegramConnect gating", () => {
  it.each<OrderStatus>(["pending", "confirmed", "preparing"])(
    "renders TelegramConnect while status is %s",
    async (status) => {
      await renderPage(status);
      expect(screen.getByTestId("telegram-connect")).toBeInTheDocument();
    },
  );

  it.each<OrderStatus>(["ready", "completed", "cancelled"])(
    "does not render TelegramConnect once status is %s",
    async (status) => {
      await renderPage(status);
      expect(screen.queryByTestId("telegram-connect")).not.toBeInTheDocument();
    },
  );
});

describe("OrderStatusPage — paying in person", () => {
  const NOTE = "Pay at the counter when you collect.";

  async function renderPriced(paymentStatus: string, status: OrderStatus) {
    maybeSingle.mockResolvedValue({
      data: {
        ...makeOrder(status),
        payment_status: paymentStatus,
        total_cents: 350,
      },
      error: null,
    });
    const jsx = await OrderStatusPage({
      params: Promise.resolve({ boothId: BOOTH_ID, orderNumber: ORDER_NUMBER }),
      searchParams: Promise.resolve({ t: TOKEN }),
    });
    return render(jsx);
  }

  it("tells the customer to pay at the counter for a priced order the booth takes no payment for", async () => {
    await renderPriced("not_required", "preparing");
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("says nothing on a free order", async () => {
    await renderPage("preparing");
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("says nothing once the order is collected", async () => {
    await renderPriced("not_required", "completed");
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("says nothing when the order was paid through qkit", async () => {
    await renderPriced("confirmed", "preparing");
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

describe("OrderStatusPage — reopened older order", () => {
  // A repeat customer's browser restores an earlier visit's status URL, which
  // otherwise renders as a live order: a big number the stall is not calling,
  // and a status that will never change (Kessie's AAR, order 65).
  const LAST_MONTH = "2026-08-16T00:00:00Z";

  it("stamps a reopened order as past, with the date it was placed", async () => {
    await renderPage("preparing", LAST_MONTH);
    expect(screen.getByText("Past order")).toBeInTheDocument();
    expect(screen.getByText("This is not today's order")).toBeInTheDocument();
    // The date in full, so staff handed this screen can see it is not
    // today's, and a customer cannot present it as a current order.
    expect(screen.getByText(shortDateTime(LAST_MONTH))).toBeInTheDocument();
  });

  it("strikes the number through, so it cannot pass for a live one", async () => {
    await renderPage("preparing", LAST_MONTH);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "line-through",
    );
  });

  it("stamps a collected order as collected, with when", async () => {
    await renderPage("completed");
    expect(screen.getByText("Collected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "line-through",
    );
  });

  it("leaves a live order's number plain", async () => {
    await renderPage("preparing");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass(
      "line-through",
    );
    expect(screen.queryByText("Past order")).not.toBeInTheDocument();
  });

  it("hides the Telegram connect offer, which could not reach them anyway", async () => {
    await renderPage("preparing", LAST_MONTH);
    expect(screen.queryByTestId("telegram-connect")).not.toBeInTheDocument();
  });

  it("says nothing about an order placed minutes ago", async () => {
    await renderPage("preparing");
    expect(
      screen.queryByText("This is an older order"),
    ).not.toBeInTheDocument();
  });
});

describe("OrderStatusPage — pending-payment redirect guard", () => {
  it("redirects to /pay when payment_status is still pending", async () => {
    maybeSingle.mockResolvedValue({
      data: { ...makeOrder("pending"), payment_status: "pending" },
      error: null,
    });

    await expect(
      OrderStatusPage({
        params: Promise.resolve({
          boothId: BOOTH_ID,
          orderNumber: ORDER_NUMBER,
        }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(
      `/order/${BOOTH_ID}/pay?t=${TOKEN}`,
    );
  });

  it("does not redirect once payment_status is past pending", async () => {
    await renderPage("preparing");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("OrderStatusPage — pickup QR", () => {
  it("shows a pickup QR when ready and the booth has self-checkout pickup on", async () => {
    boothSingle.mockResolvedValue({
      data: { ...booth, pickup_scan_enabled: true },
    });
    await renderPage("ready");
    expect(
      screen.getByText(/show this at the pickup counter/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pickup-qr")).toHaveAttribute(
      "data-value",
      `https://booth.merqo.io/order/${BOOTH_ID}/${ORDER_NUMBER}?t=${TOKEN}`,
    );
  });

  it("shows no pickup QR when the booth has it off", async () => {
    boothSingle.mockResolvedValue({
      data: { ...booth, pickup_scan_enabled: false },
    });
    await renderPage("ready");
    expect(
      screen.queryByText(/show this at the pickup counter/i),
    ).not.toBeInTheDocument();
  });

  it("ignores the retired vendor-wide board_settings key", async () => {
    vendorMaybeSingle.mockResolvedValue({
      data: {
        board_settings: { ...VALID_BOARD_SETTINGS, pickup_scan_enabled: true },
      },
    });
    await renderPage("ready");
    expect(
      screen.queryByText(/show this at the pickup counter/i),
    ).not.toBeInTheDocument();
  });

  it("shows no pickup QR when not ready even if the booth has it on", async () => {
    boothSingle.mockResolvedValue({
      data: { ...booth, pickup_scan_enabled: true },
    });
    await renderPage("preparing");
    expect(
      screen.queryByText(/show this at the pickup counter/i),
    ).not.toBeInTheDocument();
  });
});

describe("OrderStatusPage — pickup QR origin allowlist", () => {
  beforeEach(() => {
    boothSingle.mockResolvedValue({
      data: { ...booth, pickup_scan_enabled: true },
    });
  });

  it("trusts a plain vercel.app host", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "qkit-sg.vercel.app" }));
    await renderPage("ready");
    expect(screen.getByTestId("pickup-qr")).toHaveAttribute(
      "data-value",
      `https://qkit-sg.vercel.app/order/${BOOTH_ID}/${ORDER_NUMBER}?t=${TOKEN}`,
    );
  });

  it("falls back to the placeholder origin for an untrusted host, never embedding it", async () => {
    headersMock.mockResolvedValue(new Headers({ host: "evil.example.com" }));
    await renderPage("ready");
    expect(screen.getByTestId("pickup-qr")).toHaveAttribute(
      "data-value",
      `https://qkit.example/order/${BOOTH_ID}/${ORDER_NUMBER}?t=${TOKEN}`,
    );
  });

  it("ignores a spoofed x-forwarded-host when the real host is untrusted", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: "evil.example.com",
        "x-forwarded-host": "also-evil.example.com",
      }),
    );
    await renderPage("ready");
    expect(screen.getByTestId("pickup-qr")).toHaveAttribute(
      "data-value",
      `https://qkit.example/order/${BOOTH_ID}/${ORDER_NUMBER}?t=${TOKEN}`,
    );
  });

  it("falls back to an allowlisted x-forwarded-host when the real host isn't allowlisted", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: "internal-lb.local",
        "x-forwarded-host": "booth.merqo.io",
      }),
    );
    await renderPage("ready");
    expect(screen.getByTestId("pickup-qr")).toHaveAttribute(
      "data-value",
      `https://booth.merqo.io/order/${BOOTH_ID}/${ORDER_NUMBER}?t=${TOKEN}`,
    );
  });
});
