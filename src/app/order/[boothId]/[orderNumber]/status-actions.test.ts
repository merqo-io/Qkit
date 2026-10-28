import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
} from "./status-actions";

const { readEqMock } = vi.hoisted(() => ({ readEqMock: vi.fn() }));

// Chainable stub: every builder method returns itself; the chain is
// awaitable directly (multi-row reads here never call a terminal
// .maybeSingle()/.single()) and .maybeSingle() also resolves the same
// result for the single-row lookups.
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  let afterId: string | null = null;
  const self = () => obj;
  obj.select = self;
  obj.eq = (...args: unknown[]) => {
    readEqMock(...args);
    return obj;
  };
  obj.in = self;
  obj.or = self;
  obj.order = self;
  obj.gt = (_column: string, id: string) => {
    afterId = id;
    return obj;
  };
  obj.limit = (limit: number) => {
    if (limit !== 1000) return obj;
    if (!Array.isArray(result.data)) return Promise.resolve(result);
    const rows = result.data
      .map((row, index) => ({
        ...row,
        id: row.id ?? `fixture-${String(index).padStart(6, "0")}`,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return Promise.resolve({
      ...result,
      data: rows
        .filter((row) => afterId === null || row.id > afterId)
        .slice(0, 2),
    });
  };
  obj.range = (from: number, to: number) =>
    Promise.resolve({
      ...result,
      data: Array.isArray(result.data)
        ? result.data.slice(from, Math.min(to + 1, from + 2))
        : result.data,
    });
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

const { createServiceClientMock, fromMock, rateLimitMockRef } = vi.hoisted(
  () => {
    const fromMock = vi.fn();
    return {
      // Arrival tests also need an update builder.
      createServiceClientMock: vi.fn(
        (): Promise<{ from: (...args: unknown[]) => unknown }> =>
          Promise.resolve({ from: fromMock }),
      ),
      fromMock,
      rateLimitMockRef: vi.fn(),
    };
  },
);

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
// confirmArrival is rate-limited like unclaimPayment (payment-actions.ts) — a
// single shared mock ref since a module path can only be mocked once per file.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMockRef(...args),
  clientIp: () => "1.2.3.4",
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  readEqMock.mockClear();
  fromMock.mockReset().mockReturnValue(chain({ data: null, error: null }));
  rateLimitMockRef.mockReset().mockResolvedValue(true);
});

describe("getOrderStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getOrderStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns the status for a matching token", async () => {
    fromMock.mockReturnValue(chain({ data: { status: "ready" }, error: null }));
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("ready");
    expect(readEqMock.mock.calls).toEqual([
      ["booth_id", BOOTH],
      ["order_number", ORDER],
      ["access_token", TOKEN],
    ]);
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getOrderStatus failed", "boom");
    errorSpy.mockRestore();
  });

  it("returns null and never reads the order when rate-limited (token-holder polling amplification)", async () => {
    rateLimitMockRef.mockResolvedValue(false);
    fromMock.mockReturnValue(chain({ data: { status: "ready" }, error: null }));
    const res = await getOrderStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rateLimitMockRef).toHaveBeenCalledWith(
      `order-status:${TOKEN}`,
      30,
      60,
    );
  });
});

describe("getWaitEstimate", () => {
  it("counts all orders ahead beyond a two-row API cap", async () => {
    const target = {
      id: "target",
      status: "preparing",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [1, 2, 3].map((n) => ({
      ...target,
      id: String(n),
      created_at: `2026-06-12T10:0${n}:00Z`,
    }));
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: [...active, target], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }));
    expect(await getWaitEstimate(BOOTH, ORDER, TOKEN)).toEqual({
      seconds: null,
      ordersAhead: 3,
    });
  });

  it("returns no estimate rather than a partial position after a late page failure", async () => {
    const target = {
      id: "target",
      status: "preparing",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const query = chain({ data: [], error: null });
    query.limit = vi
      .fn()
      .mockResolvedValueOnce({ data: [target], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(query);
    expect(await getWaitEstimate(BOOTH, ORDER, TOKEN)).toBeNull();
  });

  it("returns null for an invalid token without creating a client", async () => {
    const res = await getWaitEstimate(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns null and never reads any order when rate-limited", async () => {
    rateLimitMockRef.mockResolvedValue(false);
    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rateLimitMockRef).toHaveBeenCalledWith(
      `wait-estimate:${TOKEN}`,
      30,
      60,
    );
  });

  it("computes an estimate from active orders ahead and recent wait history", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    const recent = Array.from({ length: 10 }, () => ({
      status: "completed",
      created_at: "2026-06-12T04:00:00Z",
      ready_at: "2026-06-12T04:02:00Z", // 120s wait each
      total_cents: 0,
      items: [],
    }));
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: recent, error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: 120, ordersAhead: 1 }); // 1 ahead * 120s avg
  });

  it("returns ordersAhead but a null seconds estimate below the minimum recent-order sample size", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: null, ordersAhead: 1 });
  });

  it("falls back to the vendor's default_prep_minutes below the sample size", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: { vendor_id: "v1" }, error: null }))
      .mockReturnValueOnce(
        chain({
          data: {
            board_settings: {
              aging_min: 5,
              overdue_min: 10,
              sound_id: "chime",
              desktop_notify: false,
              undo_seconds: 4,
              daily_order_number_reset: false,
              show_wait_estimate: true,
              default_prep_minutes: 8,
              ready_auto_clear_min: 3,
            },
          },
          error: null,
        }),
      );

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: 480, ordersAhead: 1 }); // 1 ahead * 8min
  });

  it("returns a null seconds estimate when show_wait_estimate is off, even with plenty of real data", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [
      target,
      {
        id: "a",
        status: "preparing",
        created_at: "2026-06-12T10:00:00Z",
        priority_bumped_at: null,
      },
    ];
    const recent = Array.from({ length: 10 }, () => ({
      status: "completed",
      created_at: "2026-06-12T04:00:00Z",
      ready_at: "2026-06-12T04:02:00Z",
      total_cents: 0,
      items: [],
    }));
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }))
      .mockReturnValueOnce(chain({ data: recent, error: null }))
      .mockReturnValueOnce(chain({ data: { vendor_id: "v1" }, error: null }))
      .mockReturnValueOnce(
        chain({
          data: {
            board_settings: {
              aging_min: 5,
              overdue_min: 10,
              sound_id: "chime",
              desktop_notify: false,
              undo_seconds: 4,
              daily_order_number_reset: false,
              show_wait_estimate: false,
              default_prep_minutes: null,
              ready_auto_clear_min: 3,
            },
          },
          error: null,
        }),
      );

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: null, ordersAhead: 1 });
  });

  it("ignores an unconfigured default_prep_minutes (no vendor row found)", async () => {
    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    fromMock
      .mockReturnValueOnce(chain({ data: target, error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ seconds: null, ordersAhead: 0 });
  });

  it("excludes a pending-payment QR order from the active orders count", async () => {
    const orSpy = vi.fn();
    function chainWithOrSpy(result: { data: unknown; error: unknown }) {
      const obj = chain(result);
      const self = () => obj;
      obj.select = self;
      obj.eq = self;
      obj.in = self;
      obj.or = (arg: string) => {
        orSpy(arg);
        return obj;
      };
      obj.order = self;
      obj.maybeSingle = () => Promise.resolve(result);
      obj.then = (resolve: (v: typeof result) => void) =>
        Promise.resolve(result).then(resolve);
      return obj;
    }

    const target = {
      id: "t",
      status: "pending",
      created_at: "2026-06-12T10:05:00Z",
      priority_bumped_at: null,
    };
    const active = [target];
    const recent = Array.from({ length: 10 }, () => ({
      status: "completed",
      created_at: "2026-06-12T04:00:00Z",
      ready_at: "2026-06-12T04:02:00Z",
      total_cents: 0,
      items: [],
    }));
    fromMock
      .mockReturnValueOnce(chainWithOrSpy({ data: target, error: null }))
      .mockReturnValueOnce(chainWithOrSpy({ data: active, error: null }))
      .mockReturnValueOnce(chainWithOrSpy({ data: recent, error: null }));

    const res = await getWaitEstimate(BOOTH, ORDER, TOKEN);
    expect(orSpy).toHaveBeenCalledWith(
      "payment_status.neq.pending,source.neq.qr",
    );
    expect(res?.ordersAhead).toBe(0);
  });
});

// confirmArrival's write chain (update -> 4x eq -> select) doesn't fit the
// read-only chain() helper above, so this block layers its own from()
// implementation onto the shared createServiceClientMock via
// mockImplementation in its own beforeEach — the file-level beforeEach above
// still runs first each test (outer beforeEach before inner), and this
// describe is the last one in the file so it never leaks into the
// getOrderStatus/getWaitEstimate tests above. Mirrors payment-actions.test.ts's
// unclaimPayment mock shape exactly.
describe("confirmArrival", () => {
  const writeSelect2 = vi.fn();
  const reread2 = vi.fn();
  const boothRead2 = vi.fn();
  const writeEqMock = vi.fn();
  const update2 = vi.fn(() => {
    const node = {
      eq: (...args: unknown[]) => {
        writeEqMock(...args);
        return node;
      },
      select: writeSelect2,
    };
    return node;
  });
  const select2 = () => ({
    eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: reread2 }) }) }),
  });

  beforeEach(() => {
    createServiceClientMock.mockImplementation(() =>
      Promise.resolve({
        from: (...args: unknown[]) =>
          args[0] === "booths"
            ? { select: () => ({ eq: () => ({ maybeSingle: boothRead2 }) }) }
            : { update: update2, select: select2 },
      }),
    );
    update2.mockClear();
    writeEqMock.mockClear();
    writeSelect2
      .mockReset()
      .mockResolvedValue({ data: [{ id: "o1" }], error: null });
    reread2.mockReset().mockResolvedValue({ data: null });
    boothRead2
      .mockReset()
      .mockResolvedValue({ data: { requires_arrival_confirm: true } });
  });

  it("records arrival without starting a printing order", async () => {
    boothRead2.mockResolvedValue({
      data: { requires_arrival_confirm: true, print_enabled: true },
    });
    expect(await confirmArrival(BOOTH, ORDER, TOKEN)).toEqual({
      success: true,
    });
    expect(update2).toHaveBeenCalledWith({ status: "confirmed" });
  });

  it("starts a pending order (update runs, returns success)", async () => {
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(update2).toHaveBeenCalledWith({ status: "preparing" });
    expect(writeEqMock.mock.calls).toEqual([
      ["booth_id", BOOTH],
      ["order_number", ORDER],
      ["access_token", TOKEN],
      ["status", "pending"],
    ]);
  });

  it("blocks when rate-limited and does not touch the DB", async () => {
    rateLimitMockRef.mockResolvedValue(false);
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts. Wait a moment.",
    });
    expect(update2).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await confirmArrival("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(update2).not.toHaveBeenCalled();
  });

  it("reports a failure when the update errors", async () => {
    writeSelect2.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });

  it("stays idempotent on a double-tap (0 rows, already preparing)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "preparing" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });

  it("reports a refresh when the order is not actually pending (0 rows)", async () => {
    writeSelect2.mockResolvedValue({ data: [], error: null });
    reread2.mockResolvedValue({ data: { status: "cancelled" } });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
  });

  it("refuses on a booth that doesn't require arrival confirmation (no self-accept)", async () => {
    boothRead2.mockResolvedValue({
      data: { requires_arrival_confirm: false },
    });
    const res = await confirmArrival(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not start your order. Try again.",
    });
    expect(update2).not.toHaveBeenCalled();
  });
});
