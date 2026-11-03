// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  requireAdmin,
  fixtures,
  from,
  predicates,
  names,
  audit,
  banner,
  stuck,
  ranges,
  failures,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  fixtures: {} as Record<string, unknown>,
  from: vi.fn(),
  predicates: vi.fn(),
  names: vi.fn(),
  audit: vi.fn(),
  banner: vi.fn(),
  stuck: vi.fn(),
  ranges: vi.fn(),
  failures: {} as Record<string, number>,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
  createServiceClient: async () => ({ schema: () => ({ from }) }),
}));
vi.mock("@/lib/admin/vendor-names", () => ({ vendorStallNames: names }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./banner-form", () => ({
  BannerForm: (props: unknown) => {
    banner(props);
    return null;
  },
}));
vi.mock("./audit-log", () => ({
  AdminAuditLog: (props: unknown) => {
    audit(props);
    return null;
  },
}));
vi.mock("./stuck-orders-section", () => ({
  StuckOrdersSection: (props: unknown) => {
    stuck(props);
    return null;
  },
}));
import AdminPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  names.mockResolvedValue(new Map([["vendor-a", "Coffee stall"]]));
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  for (const key of Object.keys(failures)) delete failures[key];
  from.mockImplementation((table: string) => {
    const result = { data: fixtures[table] ?? null, error: null };
    let orderIds: string[] | undefined;
    const chain = {
      select: () => chain,
      order: () => chain,
      range: async (from: number, to: number) => {
        ranges(table, from, to);
        if (failures[table] === from)
          return { data: null, error: { message: "Unavailable" } };
        const rows = (fixtures[table] ?? []) as Record<string, unknown>[];
        const scoped = orderIds
          ? rows.filter((row) => orderIds?.includes(row.order_id as string))
          : rows;
        return { data: scoped.slice(from, to + 1), error: null };
      },
      limit: () => chain,
      eq: (column: string, value: unknown) => {
        predicates(table, column, value);
        return chain;
      },
      in: (column: string, value: unknown) => {
        predicates(table, column, value);
        if (column === "order_id") orderIds = value as string[];
        return chain;
      },
      maybeSingle: async () => result,
      then: <T,>(resolve: (value: typeof result) => T) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});

describe("admin overview", () => {
  it("does not read privileged data before the admin gate succeeds", async () => {
    requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(AdminPage()).rejects.toThrow("NOT_FOUND");
    expect(from).not.toHaveBeenCalled();
  });
  it("renders a safe empty overview with default settings", async () => {
    render(await AdminPage());
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Help requests/)).not.toBeInTheDocument();
    expect(audit).toHaveBeenCalledWith({ entries: [] });
    expect(from).not.toHaveBeenCalledWith("order_status_events");
  });
  it("reports vendor GMV without cancelled orders", async () => {
    const current = new Date().toISOString();
    fixtures.vendors = [
      { id: "vendor-a", created_at: current },
      { id: "vendor-b", created_at: "2000-01-01T00:00:00Z" },
    ];
    fixtures.vendor_entitlements = [
      {
        vendor_id: "vendor-a",
        tier: "qkit",
        founder: false,
        stats_window: "90d",
        event_pass_starts_at: null,
        event_pass_ends_at: null,
        valid_until: null,
      },
    ];
    fixtures.booths = [
      {
        id: "booth-a",
        name: "Coffee stall",
        vendor_id: "vendor-a",
        is_active: true,
      },
    ];
    fixtures.orders = [
      {
        id: "order-a",
        booth_id: "booth-a",
        status: "completed",
        total_cents: 600,
        created_at: current,
      },
      {
        id: "order-b",
        booth_id: "booth-a",
        status: "cancelled",
        total_cents: 2000,
        created_at: current,
      },
    ];
    fixtures.events = [
      { type: "landing_cta", created_at: current },
      { type: "upgrade_cta", created_at: current },
    ];
    fixtures.admin_audit = [
      {
        id: "audit-1",
        admin_id: "admin",
        action: "set_plan",
        target_id: "vendor-a",
        detail: { to: "pro" },
        created_at: current,
      },
      {
        id: "audit-2",
        admin_id: "admin",
        action: "other",
        target_id: null,
        detail: null,
        created_at: current,
      },
    ];
    render(await AdminPage());
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    expect(audit).toHaveBeenCalledWith({
      entries: [
        expect.objectContaining({ detail: "to: pro" }),
        expect.objectContaining({ detail: null }),
      ],
    });
    expect(from).not.toHaveBeenCalledWith("order_status_events");
  });
  it("scopes the shared support inbox to qkit and lists open help requests", async () => {
    const created_at = new Date().toISOString();
    fixtures.support_messages = [
      {
        id: "message-a",
        user_id: "vendor-a",
        category: "payment",
        body: "Please help with checkout",
        created_at,
      },
      {
        id: "message-b",
        user_id: "missing-vendor",
        category: "unlisted-category",
        body: "Another request",
        created_at,
      },
    ];
    render(await AdminPage());
    expect(predicates).toHaveBeenCalledWith(
      "support_messages",
      "kit_slug",
      "qkit",
    );
    expect(predicates).toHaveBeenCalledWith(
      "support_messages",
      "status",
      "open",
    );
    expect(screen.getByText("Please help with checkout")).toBeInTheDocument();
    expect(screen.getByText("unlisted-category")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Coffee stall" })).toHaveAttribute(
      "href",
      "/admin/vendors/vendor-a",
    );
  });
  it("loads history only for nonterminal orders and uses configured settings", async () => {
    fixtures.orders = [
      {
        id: "active-order",
        booth_id: "booth-a",
        status: "pending",
        total_cents: 100,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    fixtures.order_status_events = [
      {
        order_id: "active-order",
        to_status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    fixtures.platform_settings = {
      banner_enabled: true,
      banner_message: "Maintenance tonight",
    };
    render(await AdminPage());
    expect(predicates).toHaveBeenCalledWith("order_status_events", "order_id", [
      "active-order",
    ]);
    expect(banner).toHaveBeenCalledWith({
      initial: fixtures.platform_settings,
    });
    expect(stuck).toHaveBeenCalledWith(
      expect.objectContaining({
        stuckOrders: expect.arrayContaining([
          expect.objectContaining({ id: "active-order" }),
        ]),
      }),
    );
  });
});
it("includes fleet rows beyond the first API page", async () => {
  fixtures.vendors = Array.from({ length: 1001 }, (_, index) => ({
    id: `vendor-${index}`,
    created_at: "2026-01-01T00:00:00Z",
  }));
  fixtures.orders = [];
  fixtures.booths = [];
  render(await AdminPage());
  expect(names).toHaveBeenCalledWith(
    expect.anything(),
    expect.arrayContaining(["vendor-1000"]),
  );
});

it("does not render partial fleet totals after a later page fails", async () => {
  fixtures.orders = Array.from({ length: 1000 }, (_, index) => ({
    id: `order-${index}`,
    booth_id: "booth-a",
    status: "completed",
    total_cents: 100,
    created_at: "2026-01-01T00:00:00Z",
  }));
  failures.orders = 1000;
  await expect(AdminPage()).rejects.toThrow(
    "Could not load complete query results",
  );
  expect(names).not.toHaveBeenCalled();
});

it("uses recent status history beyond the first page instead of falsely flagging a stuck order", async () => {
  fixtures.orders = [
    {
      id: "active-order",
      booth_id: "booth-a",
      status: "preparing",
      total_cents: 100,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  fixtures.order_status_events = [
    ...Array.from({ length: 1000 }, () => ({
      order_id: "active-order",
      to_status: "confirmed",
      created_at: "2026-01-01T00:00:00Z",
    })),
    {
      order_id: "active-order",
      to_status: "preparing",
      created_at: new Date().toISOString(),
    },
  ];
  render(await AdminPage());
  expect(ranges).toHaveBeenCalledWith("order_status_events", 1000, 1999);
  expect(stuck).toHaveBeenCalledWith(
    expect.objectContaining({ stuckOrders: [] }),
  );
});

it("bounds history query IDs and includes orders from subsequent batches", async () => {
  fixtures.orders = Array.from({ length: 101 }, (_, index) => ({
    id: `order-${index}`,
    booth_id: "booth-a",
    status: "preparing",
    total_cents: 100,
    created_at: "2026-01-01T00:00:00Z",
  }));
  fixtures.order_status_events = Array.from({ length: 101 }, (_, index) => ({
    order_id: `order-${index}`,
    to_status: "preparing",
    created_at: new Date().toISOString(),
  }));
  render(await AdminPage());
  const batches = predicates.mock.calls.filter(
    ([table, column]) =>
      table === "order_status_events" && column === "order_id",
  );
  expect(batches.every(([, , ids]) => ids.length <= 100)).toBe(true);
  expect(batches.some(([, , ids]) => ids.includes("order-100"))).toBe(true);
  expect(stuck).toHaveBeenCalledWith(
    expect.objectContaining({ stuckOrders: [] }),
  );
});

it("surfaces an incomplete history query instead of showing false stuck-order alarms", async () => {
  fixtures.orders = [
    {
      id: "active-order",
      booth_id: "booth-a",
      status: "preparing",
      total_cents: 100,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  failures.order_status_events = 0;
  await expect(AdminPage()).rejects.toThrow(
    "Could not load complete query results",
  );
  expect(stuck).not.toHaveBeenCalled();
});
