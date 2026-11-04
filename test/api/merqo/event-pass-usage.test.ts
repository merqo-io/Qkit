import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, allowed, rpc } = vi.hoisted(() => ({
  auth: vi.fn(),
  allowed: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ rpc }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: allowed,
  clientIp: () => "test-ip",
}));
vi.mock("@/lib/merqo/auth", async (original) => ({
  ...(await original<typeof import("@/lib/merqo/auth")>()),
  bearerOk: auth,
}));
import { GET } from "@/app/api/merqo/event-pass-usage/route";

const VENDOR = "9b2f3c1e-1d2a-4b5c-8d7e-0a1b2c3d4e5f";
const STARTS = "2030-01-01T00:00:00Z";
const ENDS = "2030-01-03T00:00:00+08:00";

const request = (params: Record<string, string> = {}) => {
  const query = new URLSearchParams({
    vendor_id: VENDOR,
    starts_at: STARTS,
    ends_at: ENDS,
    ...params,
  });
  return new Request(
    `https://qkit.example/api/merqo/event-pass-usage?${query.toString()}`,
  );
};

describe("GET /api/merqo/event-pass-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockReturnValue(true);
    allowed.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: 42, error: null });
  });

  it("401 without a valid bearer and never reads", async () => {
    auth.mockReturnValue(false);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    allowed.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-uuid vendor_id", { vendor_id: "nope" }],
    ["a non-ISO starts_at", { starts_at: "yesterday" }],
    ["an ISO starts_at without offset", { starts_at: "2030-01-01T00:00:00" }],
    ["a non-ISO ends_at", { ends_at: "2030-13-45" }],
    ["starts_at equal to ends_at", { ends_at: STARTS }],
    ["starts_at after ends_at", { starts_at: "2031-01-01T00:00:00Z" }],
    ["a missing vendor_id", { vendor_id: "" }],
    ["a missing starts_at", { starts_at: "" }],
    ["a missing ends_at", { ends_at: "" }],
  ])("400 for %s", async (_label, override) => {
    const res = await GET(request(override));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("200 with the cup count and the rpc arguments", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      vendor_id: VENDOR,
      starts_at: STARTS,
      ends_at: ENDS,
      cups: 42,
    });
    expect(rpc).toHaveBeenCalledWith("vendor_cups_between", {
      p_vendor_id: VENDOR,
      p_from: STARTS,
      p_to: ENDS,
    });
  });

  it("500 with a generic error when the rpc fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom internals" } });
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Upstream unavailable" });
  });
});
