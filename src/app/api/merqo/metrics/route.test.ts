import { beforeEach, expect, it, vi } from "vitest";

const { bearerOk, rateLimit, createServiceClient, fixtures, failPage } =
  vi.hoisted(() => ({
    bearerOk: vi.fn(),
    rateLimit: vi.fn(),
    createServiceClient: vi.fn(),
    fixtures: {} as Record<string, unknown[]>,
    failPage: { table: "", from: -1 },
  }));
vi.mock("@/lib/merqo/auth", () => ({ bearerOk }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "ip",
  rateLimit,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient,
}));
import { GET } from "./route";

beforeEach(() => {
  bearerOk.mockReset().mockReturnValue(true);
  rateLimit.mockReset().mockResolvedValue(true);
  createServiceClient.mockReset().mockResolvedValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: async () => ({ count: 0, error: null }),
        order: () => query,
        range: async (from: number, to: number) => ({
          data:
            failPage.table === table && failPage.from === from
              ? null
              : (fixtures[table] ?? []).slice(from, Math.min(to + 1, from + 2)),
          error:
            failPage.table === table && failPage.from === from
              ? { message: "connection reset" }
              : null,
        }),
      };
      return query;
    },
  });
  failPage.table = "";
  failPage.from = -1;
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  fixtures.vendors = [{ id: "v", created_at: new Date().toISOString() }];
  fixtures.booths = [{ id: "b", vendor_id: "v" }];
  fixtures.orders = Array.from({ length: 3 }, () => ({
    booth_id: "b",
    status: "completed",
    total_cents: 100,
    created_at: new Date().toISOString(),
  }));
  fixtures.payments = [];
});

it("rejects unauthorized callers before rate-limit or metrics database work", async () => {
  bearerOk.mockReturnValue(false);
  const request = new Request("https://qkit.test/api/merqo/metrics");
  const response = await GET(request);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Unauthorized" });
  expect(bearerOk).toHaveBeenCalledWith(request);
  expect(rateLimit).not.toHaveBeenCalled();
  expect(createServiceClient).not.toHaveBeenCalled();
});

it("rejects a limited caller before constructing the metrics read client", async () => {
  rateLimit.mockResolvedValue(false);
  const response = await GET(
    new Request("https://qkit.test/api/merqo/metrics"),
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "Too many requests" });
  expect(rateLimit).toHaveBeenCalledWith("merqo-metrics:ip", 30, 60);
  expect(createServiceClient).not.toHaveBeenCalled();
});

it("reports all orders when the server returns fewer rows than requested", async () => {
  const response = await GET(
    new Request("https://qkit.test/api/merqo/metrics"),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.orders_7d).toBe(3);
  expect(body.gmv_cents_30d).toBe(300);
});

it("returns unavailable rather than a partial summary if a later page fails", async () => {
  failPage.table = "orders";
  failPage.from = 2;
  const response = await GET(
    new Request("https://qkit.test/api/merqo/metrics"),
  );
  expect(response.status).toBe(503);
});
