import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

import { GET } from "@/app/api/merqo/metrics/route";

// thenable query-builder stub: methods return this; awaiting resolves { data, error, count }
function result(rows: unknown[], count?: number) {
  const r: Record<string, unknown> = {};
  let page = rows;
  const chain = () => r;
  Object.assign(r, {
    select: chain,
    eq: chain,
    in: chain,
    gte: chain,
    order: chain,
    range: (from: number, to: number) => {
      page = rows.slice(from, to + 1);
      return r;
    },
    then: (
      res: (v: { data: unknown[]; error: null; count: number | null }) => void,
    ) => res({ data: page, error: null, count: count ?? null }),
  });
  return r;
}

describe("GET /api/merqo/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MERQO_METRICS_SECRET", "test-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  const req = (auth?: string) =>
    new Request("http://localhost/api/merqo/metrics", {
      headers: auth ? { Authorization: auth } : {},
    });

  it("401 when the bearer is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("401 when the bearer is wrong", async () => {
    const res = await GET(req("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("401 when the server secret is unset", async () => {
    vi.stubEnv("MERQO_METRICS_SECRET", "");
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(401);
  });

  it("200 returns the contract shape on a valid bearer", async () => {
    const tables: Record<string, unknown[]> = {
      vendors: [{ id: "v1", created_at: new Date().toISOString() }],
      booths: [{ id: "b1", vendor_id: "v1" }],
      orders: [
        {
          booth_id: "b1",
          status: "paid",
          total_cents: 1000,
          created_at: new Date().toISOString(),
        },
      ],
      payments: [{ amount_cents: 900, created_at: new Date().toISOString() }],
      vendor_entitlements: [
        {
          vendor_id: "v1",
          tier: "qkit",
          founder: true,
          stats_window: "90d",
          event_pass_starts_at: null,
          event_pass_ends_at: null,
          valid_until: null,
        },
      ],
    };
    fromMock.mockImplementation((table: string) => result(tables[table] ?? []));

    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toBe("qkit");
    expect(typeof body.generated_at).toBe("string");
    for (const k of [
      "revenue_cents_30d",
      "revenue_cents_all",
      "gmv_cents_30d",
      "active_vendors",
      "orders_7d",
      "orders_prev_7d",
      "signups_7d",
      "pro_vendors",
      "total_vendors",
      "pending_upgrade_requests",
    ]) {
      expect(typeof body[k]).toBe("number");
    }
    expect(body.funnel).toEqual(
      expect.objectContaining({
        signed_up: expect.any(Number),
        with_booth: expect.any(Number),
        with_order: expect.any(Number),
        pro: expect.any(Number),
      }),
    );
    expect(body.pending_upgrade_requests).toBe(0);
    expect(body.pro_vendors).toBe(1);
  });

  it("503 when a table read errors", async () => {
    // The route issues all five reads before checking errors, so every .from()
    // must return a valid thenable; make them all resolve to an error.
    const errorResult = () => {
      const r: Record<string, unknown> = {};
      const chain = () => r;
      Object.assign(r, {
        select: chain,
        eq: chain,
        order: chain,
        range: chain,
        then: (
          res: (v: {
            data: null;
            error: { message: string };
            count: null;
          }) => void,
        ) => res({ data: null, error: { message: "boom" }, count: null }),
      });
      return r;
    };
    fromMock.mockReturnValue(errorResult());
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Upstream unavailable" });
  });
});
