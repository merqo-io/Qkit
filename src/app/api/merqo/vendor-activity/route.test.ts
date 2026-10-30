import { describe, it, expect, vi, beforeEach } from "vitest";
import { vendorActivityPayloadSchema } from "@merqo/ui/contracts";

const bearerOkMock = vi.fn();

vi.mock("@/lib/merqo/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/merqo/auth")>(
      "@/lib/merqo/auth",
    );
  return {
    ...actual,
    bearerOk: (...args: unknown[]) => bearerOkMock(...args),
  };
});

// A supabase-js query builder is thenable — every filter method returns the
// same chainable object, and `await`ing it (directly, or via Promise.all)
// resolves it. This mirrors that shape closely enough for route-level tests
// without pulling in a real Supabase client.
function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.gte = self;
  obj.order = self;
  obj.range = (from: number, to: number) =>
    chainable({
      ...result,
      data: Array.isArray(result.data)
        ? result.data.slice(from, Math.min(to + 1, from + 2))
        : result.data,
    });
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (
    onFulfilled: (v: typeof result) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return obj;
}

type Fixtures = {
  users?: { id: string; email: string | null }[];
  vendor?: { id: string; plan: "free" | "pro"; created_at: string } | null;
  booths?: {
    id: string;
    vendor_id: string;
    created_at: string;
    is_active: boolean;
  }[];
  licenses?: { vendor_id: string; valid_from: string; expires_at: string }[];
  messages?: { id: string; status: string }[];
  orders?: {
    booth_id: string;
    status: string;
    total_cents: number;
    created_at: string;
  }[];
  opsEvents?: { kind: string; ref: string; code: string; created_at: string }[];
  errorTable?:
    | "vendors"
    | "booths"
    | "licenses"
    | "support_messages"
    | "orders"
    | "ops_events";
  rateLimited?: boolean;
};

function makeSupabase(fx: Fixtures) {
  const err = { message: "boom" };
  const dataByTable: Record<string, unknown> = {
    vendors: fx.vendor ?? null,
    booths: fx.booths ?? [],
    licenses: fx.licenses ?? [],
    support_messages: fx.messages ?? [],
    orders: fx.orders ?? [],
    ops_events: fx.opsEvents ?? [],
  };
  const supabase = {
    auth: {
      admin: {
        listUsers: () =>
          Promise.resolve({
            data: { users: fx.users ?? [] },
            error: null,
          }),
      },
    },
    schema: () => supabase,
    rpc: () => Promise.resolve({ data: !fx.rateLimited, error: null }),
    from: (table: string) => {
      if (!(table in dataByTable)) throw new Error(`unexpected table ${table}`);
      const errorHere = fx.errorTable === table;
      return chainable({
        data: errorHere ? null : dataByTable[table],
        error: errorHere ? err : null,
      });
    },
  };
  return supabase;
}

let fixtures: Fixtures = {};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve(makeSupabase(fixtures)),
}));

import { GET } from "./route";

function requestWith(email: string) {
  return new Request(
    `https://qkit.test/api/merqo/vendor-activity?email=${encodeURIComponent(email)}`,
    { headers: { authorization: "Bearer secret" } },
  );
}

describe("GET /api/merqo/vendor-activity", () => {
  beforeEach(() => {
    bearerOkMock.mockReset();
    fixtures = {};
  });
  it("includes orders beyond a server cap smaller than the requested page", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      booths: [
        {
          id: "b1",
          vendor_id: "u1",
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      orders: Array.from({ length: 3 }, () => ({
        booth_id: "b1",
        status: "completed",
        total_cents: 100,
        created_at: new Date().toISOString(),
      })),
    };
    const response = await GET(requestWith("vendor@example.com"));
    expect(response.status).toBe(200);
    expect((await response.json()).metrics).toEqual(
      expect.arrayContaining([
        { label: "Orders (30d)", value: "3" },
        { label: "Revenue (30d)", value: "$3.00" },
      ]),
    );
  });
  it("returns 401 when the bearer secret doesn't verify", async () => {
    bearerOkMock.mockReturnValue(false);

    const res = await GET(requestWith("vendor@example.com"));

    expect(res.status).toBe(401);
  });

  it("returns 429 when the rate limiter rejects the call", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = { rateLimited: true };

    const res = await GET(requestWith("vendor@example.com"));

    expect(res.status).toBe(429);
  });

  it("returns 400 when email is missing or invalid", async () => {
    bearerOkMock.mockReturnValue(true);

    const res = await GET(requestWith("not-an-email"));

    expect(res.status).toBe(400);
  });

  it("returns 404 when no auth user matches the email", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = { users: [] };

    const res = await GET(requestWith("nobody@example.com"));

    expect(res.status).toBe(404);
  });

  it("returns 404 when the auth user exists but has no vendors row", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: null,
    };

    const res = await GET(requestWith("vendor@example.com"));

    expect(res.status).toBe(404);
  });

  it("returns 200 with computed activity for a known vendor", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      booths: [
        {
          id: "b1",
          vendor_id: "u1",
          created_at: "2026-01-02T00:00:00Z",
          is_active: true,
        },
      ],
      orders: [
        {
          booth_id: "b1",
          status: "completed",
          total_cents: 1500,
          created_at: new Date().toISOString(),
        },
      ],
      messages: [],
    };

    const res = await GET(requestWith("VENDOR@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.active).toBe(true);
    expect(body.plan).toBe("free");
    expect(body.metrics).toEqual(
      expect.arrayContaining([
        { label: "Orders (30d)", value: "1" },
        { label: "Revenue (30d)", value: "$15.00" },
      ]),
    );
    expect(body.lastActivityAt).not.toBeNull();
  });

  it("an open support message surfaces as status attention", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      booths: [],
      orders: [],
      messages: [{ id: "m1", status: "open" }],
    };

    const res = await GET(requestWith("vendor@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("attention");
  });

  it("returns 503 when a downstream read fails", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      errorTable: "booths",
    };

    const res = await GET(requestWith("vendor@example.com"));

    expect(res.status).toBe(503);
  });
  it("returns incidents and recent that parse with the contract schema", async () => {
    bearerOkMock.mockReturnValue(true);
    const at = new Date().toISOString();
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      opsEvents: [
        {
          kind: "webhook_rejected",
          ref: "o1",
          code: "signature_invalid",
          created_at: at,
        },
        {
          kind: "action_error",
          ref: "o2",
          code: "advanceOrder",
          created_at: at,
        },
        { kind: "action_error", ref: "o3", code: "bumpOrder", created_at: at },
      ],
    };

    const res = await GET(requestWith("vendor@example.com"));
    const body = vendorActivityPayloadSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.incidents).toEqual([
      { kind: "action_error", count: 2, lastAt: at },
      { kind: "webhook_rejected", count: 1, lastAt: at },
    ]);
    expect(body.recent).toHaveLength(3);
    expect(body.recent?.[0]).toEqual({
      kind: "webhook_rejected",
      ref: "o1",
      code: "signature_invalid",
      at,
    });
  });

  it("omits incidents when the ops_events read fails", async () => {
    bearerOkMock.mockReturnValue(true);
    fixtures = {
      users: [{ id: "u1", email: "vendor@example.com" }],
      vendor: { id: "u1", plan: "free", created_at: "2026-01-01T00:00:00Z" },
      errorTable: "ops_events",
    };

    const res = await GET(requestWith("vendor@example.com"));
    const body = vendorActivityPayloadSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.incidents).toBeUndefined();
    expect(body.recent).toBeUndefined();
  });
});
