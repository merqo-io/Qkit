// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { VendorListItem } from "../vendor-list";
const { gate, fixtures, from, filters, names, list } = vi.hoisted(() => ({
  gate: vi.fn(),
  fixtures: {} as Record<string, unknown>,
  from: vi.fn(),
  filters: vi.fn(),
  names: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: gate }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
  createServiceClient: async () => ({ schema: () => ({ from }) }),
}));
vi.mock("@/lib/admin/vendor-names", () => ({ vendorStallNames: names }));
vi.mock("../vendor-list", () => ({
  VendorList: (props: { vendors: VendorListItem[] }) => {
    list(props);
    return null;
  },
}));
import VendorsPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({ id: "admin" });
  names.mockResolvedValue(new Map([["a", "Coffee"]]));
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  from.mockImplementation((table: string) => {
    const result = { data: fixtures[table] ?? null };
    const chain = {
      select: () => chain,
      order: () => chain,
      range: async (from: number, to: number) => ({
        data: ((fixtures[table] ?? []) as unknown[]).slice(from, to + 1),
        error: null,
      }),
      eq: (column: string, value: string) => {
        filters(table, column, value);
        return chain;
      },
      then: <T,>(resolve: (value: typeof result) => T) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
const ago = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString();
describe("admin vendor directory", () => {
  it("requires admin authority before queries", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(VendorsPage()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("handles an empty directory and scopes open support to qkit", async () => {
    render(await VendorsPage());
    expect(
      screen.getByRole("heading", { name: "Vendors" }),
    ).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ vendors: [] });
    expect(filters).toHaveBeenCalledWith(
      "support_messages",
      "kit_slug",
      "qkit",
    );
    expect(filters).toHaveBeenCalledWith("support_messages", "status", "open");
  });
  it("prioritizes open support and retains pass, order and name data", async () => {
    fixtures.vendors = [
      { id: "a", created_at: ago(1) },
      { id: "b", created_at: ago(10) },
      { id: "c", created_at: ago(20) },
    ];
    fixtures.booths = [{ id: "booth", vendor_id: "a", created_at: ago(1) }];
    fixtures.orders = [
      { booth_id: "booth", status: "completed", created_at: ago(0) },
    ];
    fixtures.vendor_entitlements = [
      {
        vendor_id: "a",
        tier: "qkit",
        founder: false,
        stats_window: "90d",
        event_pass_starts_at: null,
        event_pass_ends_at: null,
        valid_until: null,
      },
      {
        vendor_id: "b",
        tier: "free",
        founder: false,
        stats_window: "24h",
        event_pass_starts_at: ago(1),
        event_pass_ends_at: ago(-1),
        valid_until: null,
      },
    ];
    fixtures.support_messages = [{ user_id: "c" }];
    render(await VendorsPage());
    const items = list.mock.calls[0][0].vendors as VendorListItem[];
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "c",
        status: "attention",
        name: "Unknown vendor",
      }),
    );
    expect(items.find((v) => v.id === "a")).toEqual(
      expect.objectContaining({
        name: "Coffee",
        tier: "qkit",
        orders7d: 1,
        boothCount: 1,
      }),
    );
    expect(items.find((v) => v.id === "b")?.passHoursLeft).toBe(24);
  });
  it("sorts equally urgent vendors by newest signup", async () => {
    fixtures.vendors = [
      { id: "old", created_at: ago(2) },
      { id: "new", created_at: ago(1) },
    ];
    render(await VendorsPage());
    expect(
      (list.mock.calls[0][0].vendors as VendorListItem[]).map((v) => v.id),
    ).toEqual(["new", "old"]);
  });
});
