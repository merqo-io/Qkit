import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, allowed, users, from, filter, result } = vi.hoisted(() => ({
  auth: vi.fn(),
  allowed: vi.fn(),
  users: vi.fn(),
  from: vi.fn(),
  filter: vi.fn(),
  result: { data: null as unknown, error: null as null | { message: string } },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ from }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: allowed,
  clientIp: () => "test-ip",
}));
vi.mock("@/lib/merqo/auth", async (original) => ({
  ...(await original<typeof import("@/lib/merqo/auth")>()),
  bearerOk: auth,
  listAllAuthUsers: users,
}));
import { GET } from "@/app/api/merqo/vendor-status/route";
const request = (email = "vendor@example.com") =>
  new Request(
    `https://qkit.example/api/merqo/vendor-status?email=${encodeURIComponent(email)}`,
  );
const entitlementRow = {
  tier: "qkit",
  founder: false,
  stats_window: "90d",
  event_pass_starts_at: null,
  event_pass_ends_at: null,
  valid_until: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue(true);
  allowed.mockResolvedValue(true);
  users.mockResolvedValue({
    data: { users: [{ id: "vendor-id", email: "Vendor@example.com" }] },
    error: null,
  });
  result.data = { id: "vendor-id" };
  result.error = null;
  from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        filter(column, value);
        return {
          maybeSingle: async () =>
            table === "vendor_entitlements"
              ? { data: entitlementRow, error: null }
              : result,
        };
      },
    }),
  }));
});
describe("Merqo vendor status", () => {
  it("rejects unauthorized reads", async () => {
    auth.mockReturnValue(false);
    expect((await GET(request())).status).toBe(401);
    expect(users).not.toHaveBeenCalled();
  });
  it.each(["", "invalid"])("rejects invalid email %s", async (email) => {
    expect((await GET(request(email))).status).toBe(400);
    expect(users).not.toHaveBeenCalled();
  });
  it("rate limits directory enumeration", async () => {
    allowed.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(429);
    expect(users).not.toHaveBeenCalled();
  });
  it("queries only the matched vendor instead of a capped fleet list", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: true, plan: "qkit" });
    expect(filter).toHaveBeenCalledWith("id", "vendor-id");
    expect(filter).toHaveBeenCalledWith("vendor_id", "vendor-id");
  });
  it("does not query vendors for an absent auth account", async () => {
    users.mockResolvedValue({
      data: { users: [{ id: "other", email: null }] },
      error: null,
    });
    expect(await (await GET(request())).json()).toEqual({
      active: false,
      plan: null,
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("reports an auth account without qkit membership as inactive", async () => {
    result.data = null;
    expect(await (await GET(request())).json()).toEqual({
      active: false,
      plan: null,
    });
  });
  it("fails closed when directory lookup fails", async () => {
    users.mockResolvedValue({
      data: null,
      error: { message: "Directory unavailable" },
    });
    expect((await GET(request())).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });
  it("does not turn a failed vendor query into false absence", async () => {
    result.error = { message: "Database unavailable" };
    expect((await GET(request())).status).toBe(503);
  });
});
