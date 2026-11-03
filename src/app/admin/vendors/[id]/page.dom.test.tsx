// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { gate, fixtures, from, predicates, profile, resolve } = vi.hoisted(
  () => ({
    gate: vi.fn(),
    fixtures: {} as Record<string, unknown>,
    from: vi.fn(),
    predicates: vi.fn(),
    profile: vi.fn(),
    resolve: vi.fn(),
  }),
);
vi.mock("@/lib/admin/access", () => ({ requireAdmin: gate }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
  createServiceClient: async () => ({ schema: () => ({ from }) }),
}));
vi.mock("@/lib/merqo/vendor-profile", () => ({
  getOrCreateVendorProfile: profile,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../../resolve-message-button", () => ({
  ResolveMessageButton: (props: unknown) => {
    resolve(props);
    return null;
  },
}));
import VendorPage from "./page";

const renderPage = () =>
  VendorPage({ params: Promise.resolve({ id: "vendor-a" }) });
const created_at = "2026-01-01T00:00:00Z";
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({ id: "admin" });
  profile.mockResolvedValue({ stall_name: "Coffee stall" });
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  fixtures.vendors = { id: "vendor-a", created_at };
  from.mockImplementation((table: string) => {
    const result = {
      data:
        fixtures[table] ??
        (table === "vendors" || table === "vendor_entitlements" ? null : []),
      error: null,
    };
    const chain = {
      select: () => chain,
      order: () => chain,
      range: (from: number, to: number) =>
        Promise.resolve({
          ...result,
          data: Array.isArray(result.data)
            ? result.data.slice(from, to + 1)
            : result.data,
        }),
      eq: (column: string, value: unknown) => {
        predicates(table, column, value);
        return chain;
      },
      in: (column: string, value: unknown) => {
        predicates(table, column, value);
        return chain;
      },
      maybeSingle: async () => result,
      then: <T,>(resolveResult: (value: typeof result) => T) =>
        Promise.resolve(result).then(resolveResult),
    };
    return chain;
  });
});

describe("admin vendor detail", () => {
  it("gates access before reading vendor data", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(renderPage()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("returns not found without creating a profile for an unknown vendor", async () => {
    fixtures.vendors = null;
    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
    expect(profile).not.toHaveBeenCalled();
  });
  it("renders a new vendor without fetching unrelated orders", async () => {
    render(await renderPage());
    expect(
      screen.getByRole("heading", { name: "Coffee stall" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No messages from this vendor."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(from).not.toHaveBeenCalledWith("orders");
    expect(predicates).toHaveBeenCalledWith("vendors", "id", "vendor-a");
    expect(predicates).toHaveBeenCalledWith("booths", "vendor_id", "vendor-a");
    expect(predicates).toHaveBeenCalledWith(
      "vendor_entitlements",
      "vendor_id",
      "vendor-a",
    );
    expect(predicates).toHaveBeenCalledWith(
      "support_messages",
      "user_id",
      "vendor-a",
    );
    expect(predicates).toHaveBeenCalledWith(
      "support_messages",
      "kit_slug",
      "qkit",
    );
  });
  it("excludes cancelled revenue and scopes orders to the vendor's booths", async () => {
    fixtures.vendor_entitlements = {
      tier: "qkit",
      founder: true,
      stats_window: "90d",
      event_pass_starts_at: null,
      event_pass_ends_at: null,
      valid_until: null,
    };
    fixtures.booths = [
      { id: "b", is_active: false, created_at: "2026-02-02T00:00:00Z" },
      { id: "a", is_active: true, created_at },
      { id: "c", is_active: true, created_at: "2026-03-03T00:00:00Z" },
    ];
    fixtures.orders = [
      {
        booth_id: "a",
        status: "completed",
        total_cents: 100,
        created_at: "2026-03-03T00:00:00Z",
      },
      { booth_id: "b", status: "completed", total_cents: 200, created_at },
      {
        booth_id: "c",
        status: "completed",
        total_cents: 300,
        created_at: new Date().toISOString(),
      },
      { booth_id: "a", status: "cancelled", total_cents: 9000, created_at },
    ];
    render(await renderPage());
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("0d ago")).toBeInTheDocument();
    expect(screen.getByText("qkit (founder)")).toBeInTheDocument();
    expect(predicates).toHaveBeenCalledWith("orders", "booth_id", [
      "b",
      "a",
      "c",
    ]);
  });
  it("shows active passes and resolves only open messages", async () => {
    const expires_at = new Date(Date.now() + 36 * 3600000).toISOString();
    fixtures.vendor_entitlements = {
      tier: "free",
      founder: false,
      stats_window: "24h",
      event_pass_starts_at: created_at,
      event_pass_ends_at: expires_at,
      valid_until: null,
    };
    fixtures.support_messages = [
      {
        id: "open",
        category: "payment",
        status: "open",
        body: "Payment help",
        created_at,
      },
      {
        id: "closed",
        category: "custom",
        status: "resolved",
        body: "Old request",
        created_at,
      },
    ];
    render(await renderPage());
    expect(screen.getByText(/Free · pass 36h/)).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ id: "open" });
  });
  it("handles a booth with no available orders and resolved-only support", async () => {
    fixtures.booths = [{ id: "a", is_active: false, created_at }];
    fixtures.support_messages = [
      {
        id: "closed",
        category: "other",
        status: "resolved",
        body: "Done",
        created_at,
      },
    ];
    render(await renderPage());
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(resolve).not.toHaveBeenCalled();
  });
});

it("uses the authorized service path when lazily provisioning vendor names", async () => {
  await renderPage();
  expect(profile).toHaveBeenCalledWith(
    expect.objectContaining({ schema: expect.any(Function) }),
    "vendor-a",
    null,
  );
});
