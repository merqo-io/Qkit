import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, allowed, users, rpc } = vi.hoisted(() => ({
  auth: vi.fn(),
  allowed: vi.fn(),
  users: vi.fn(),
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
  provisionBearerOk: auth,
  listAllAuthUsers: users,
}));
import { POST } from "@/app/api/merqo/entitlement/route";

const payload = {
  email: "vendor@example.com",
  kit: "qkit",
  tier: "starter",
  founder: false,
  stats_window: "24h",
  event_pass: null,
  valid_until: null,
  issued_at: "2026-11-03T00:00:00Z",
};

const request = (body: unknown, raw?: string) =>
  new Request("https://qkit.example/api/merqo/entitlement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue(true);
  allowed.mockResolvedValue(true);
  users.mockResolvedValue({
    data: { users: [{ id: "vendor-id", email: "Vendor@example.com" }] },
    error: null,
  });
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/merqo/entitlement", () => {
  it("rejects a missing or wrong bearer before any read", async () => {
    auth.mockReturnValue(false);
    expect((await POST(request(payload))).status).toBe(401);
    expect(users).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rate limits", async () => {
    allowed.mockResolvedValue(false);
    expect((await POST(request(payload))).status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON", async () => {
    expect((await POST(request(null, "{nope"))).status).toBe(400);
  });

  it.each([
    ["a missing field", { ...payload, founder: undefined }],
    ["a bad timestamp", { ...payload, issued_at: "yesterday" }],
    ["an unknown tier", { ...payload, tier: "gold" }],
    ["paid for qkit", { ...payload, tier: "paid" }],
  ])("400s on %s", async (_label, body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400s on a payload for another kit", async () => {
    const res = await POST(
      request({ ...payload, kit: "loopkit", tier: "paid" }),
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("404s unknown_vendor for an email with no account", async () => {
    users.mockResolvedValue({ data: { users: [] }, error: null });
    const res = await POST(request(payload));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "unknown_vendor" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("503s when the directory lookup fails", async () => {
    users.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await POST(request(payload))).status).toBe(503);
  });

  it("stores the push through the atomic SQL function and answers ok", async () => {
    const res = await POST(
      request({
        ...payload,
        tier: "qkit",
        founder: true,
        stats_window: "90d",
        event_pass: {
          starts_at: "2026-11-05T00:00:00Z",
          ends_at: "2026-11-06T00:00:00Z",
        },
        valid_until: "2026-12-01T00:00:00Z",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("apply_vendor_entitlement", {
      p_vendor: "vendor-id",
      p_tier: "qkit",
      p_founder: true,
      p_stats_window: "90d",
      p_event_pass_starts_at: "2026-11-05T00:00:00Z",
      p_event_pass_ends_at: "2026-11-06T00:00:00Z",
      p_valid_until: "2026-12-01T00:00:00Z",
      p_issued_at: "2026-11-03T00:00:00Z",
    });
  });

  it("answers 200 ok when the SQL function ignores a stale push", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(request(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("500s when the write fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(request(payload))).status).toBe(500);
  });
});
