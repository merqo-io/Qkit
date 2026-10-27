const { notifyPrintkitMock } = vi.hoisted(() => ({
  notifyPrintkitMock: vi.fn(),
}));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyPrintkit: notifyPrintkitMock,
}));
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const {
  bearerOkMock,
  rateLimitMock,
  orderMaybeSingle,
  boothMaybeSingle,
  readEqMock,
  updateMock,
  updateFilters,
  updateResult,
  getCheckoutByOrderRefMock,
  finalizePaidOrderMock,
  writePaidMirrorMock,
} = vi.hoisted(() => {
  const updateFilters: unknown[][] = [];
  const updateResult = {
    value: { error: null as { message: string } | null },
  };
  const updateMock = vi.fn((..._patch: unknown[]) => {
    const node = {
      eq: (...args: unknown[]) => {
        updateFilters.push(["eq", ...args]);
        return node;
      },
      neq: (...args: unknown[]) => {
        updateFilters.push(["neq", ...args]);
        return node;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(updateResult.value).then(resolve),
    };
    return node;
  });
  return {
    bearerOkMock: vi.fn(),
    rateLimitMock: vi.fn(),
    orderMaybeSingle: vi.fn(),
    boothMaybeSingle: vi.fn(),
    readEqMock: vi.fn(),
    updateMock,
    updateFilters,
    updateResult,
    getCheckoutByOrderRefMock: vi.fn(),
    finalizePaidOrderMock: vi.fn(),
    writePaidMirrorMock: vi.fn(),
  };
});

vi.mock("@/lib/qkit-paykit-auth", () => ({
  paykitCallbackBearerOk: bearerOkMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: () => "203.0.113.5",
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        const read = (maybeSingle: () => unknown) => ({
          select: () => ({
            eq: (...args: unknown[]) => {
              readEqMock(table, ...args);
              return { maybeSingle };
            },
          }),
        });
        return table === "booths"
          ? read(boothMaybeSingle)
          : { ...read(orderMaybeSingle), update: updateMock };
      },
    }),
}));
vi.mock("@/lib/paykit/client", () => ({
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));
vi.mock("@/app/order/[boothId]/[orderNumber]/finalize-paid-order", () => ({
  finalizePaidOrder: finalizePaidOrderMock,
  writePaidMirror: writePaidMirrorMock,
}));

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TX_ID = "22222222-2222-4222-8222-222222222222";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    booth_id: BOOTH_ID,
    status: "pending",
    order_number: null,
    payment_status: "pending",
    total_cents: 800,
    ...overrides,
  };
}

function paykitHolds(
  status: "pending" | "claimed" | "confirmed",
  overrides: Record<string, unknown> = {},
) {
  getCheckoutByOrderRefMock.mockResolvedValue({
    ok: true,
    data: {
      transactionId: TX_ID,
      status,
      amountCents: 800,
      orderRef: ORDER_ID,
      claimedAt: status === "pending" ? null : "2026-08-11T00:00:00Z",
      confirmedAt: status === "confirmed" ? "2026-08-11T00:00:05Z" : null,
      vendorId: "v1",
      ...overrides,
    },
  });
}

function post(body: unknown, raw = false) {
  return POST(
    new Request("https://qkit.test/api/paykit/payment-status", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

function callback(status: string = "claimed") {
  return post({ order_ref: ORDER_ID, transaction_id: TX_ID, status });
}

function expectNothingApplied() {
  expect(finalizePaidOrderMock).not.toHaveBeenCalled();
  expect(writePaidMirrorMock).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  notifyPrintkitMock.mockReset().mockResolvedValue(undefined);
  bearerOkMock.mockReset().mockReturnValue(true);
  rateLimitMock.mockReset().mockResolvedValue(true);
  orderMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: order(), error: null });
  boothMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1" }, error: null });
  readEqMock.mockReset();
  updateMock.mockClear();
  updateFilters.length = 0;
  updateResult.value = { error: null };
  getCheckoutByOrderRefMock.mockReset();
  paykitHolds("claimed");
  finalizePaidOrderMock
    .mockReset()
    .mockResolvedValue({ ok: true, orderNumber: "0007" });
  writePaidMirrorMock.mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/paykit/payment-status: the gate", () => {
  it("401s without the callback secret, before reading anything", async () => {
    bearerOkMock.mockReturnValue(false);
    const res = await callback();
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("429s when the limiter refuses, before reading the order or calling paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await callback();
    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(
      "paykit-payment-status:203.0.113.5",
      120,
      60,
    );
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("400s for a body that is not JSON", async () => {
    const res = await post("{not json", true);
    expect(res.status).toBe(400);
    expect(orderMaybeSingle).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["not a uuid", { order_ref: "A-001" }],
    ["a number", { order_ref: 7 }],
    ["filter punctuation", { order_ref: `${ORDER_ID}),status.eq.pending` }],
  ])("400s when order_ref is %s", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("accepts a body that carries only order_ref", async () => {
    const res = await post({ order_ref: ORDER_ID });
    expect(res.status).toBe(200);
  });

  it("404s for an order qkit does not have, without calling paykit", async () => {
    orderMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await callback();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("503s when the order read fails, without leaking the database error", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await callback();
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toMatch(/connection reset/);
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("503s when the booth read fails", async () => {
    boothMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await callback();
    expect(res.status).toBe(503);
    expectNothingApplied();
  });

  it("404s when the order's booth has no vendor", async () => {
    boothMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await callback();
    expect(res.status).toBe(404);
    expectNothingApplied();
  });
});

describe("POST /api/paykit/payment-status: reading the status back", () => {
  it("looks the order up by its own id and reads the booth of that order", async () => {
    await callback();
    expect(readEqMock).toHaveBeenCalledWith("orders", "id", ORDER_ID);
    expect(readEqMock).toHaveBeenCalledWith("booths", "id", BOOTH_ID);
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ORDER_ID);
  });

  it.each([
    ["times out", null],
    ["answers 503", 503],
    ["answers 401", 401],
    ["answers 429", 429],
  ])("changes nothing and 503s when paykit %s", async (_, status) => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status,
      error: "Upstream unavailable",
    });
    const res = await callback("confirmed");
    expect(res.status).toBe(503);
    expectNothingApplied();
  });

  it("changes nothing and 409s when paykit has no transaction for the order", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
    });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
  });

  it("changes nothing and 409s when the transaction belongs to another vendor", async () => {
    paykitHolds("confirmed", { vendorId: "someone-else" });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("changes nothing and 409s when the transaction's amount differs from the order's total", async () => {
    paykitHolds("confirmed", { amountCents: 900 });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
  });

  it("applies what paykit holds, not what the body says: a forged 'confirmed' on a pending payment confirms nothing", async () => {
    paykitHolds("pending");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(finalizePaidOrderMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("applies what paykit holds, not what the body says: a stale 'pending' does not undo a confirmed payment", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({
        order_number: "0007",
        status: "preparing",
        payment_status: "confirmed",
      }),
      error: null,
    });
    paykitHolds("confirmed");
    const res = await callback("pending");
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).toHaveBeenCalledWith(
      expect.anything(),
      ORDER_ID,
      { status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" },
    );
  });
});

describe("POST /api/paykit/payment-status: applying the status", () => {
  it("finalizes an unnumbered order paykit holds as claimed", async () => {
    const res = await callback("claimed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(finalizePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(finalizePaidOrderMock).toHaveBeenCalledWith(
      { id: ORDER_ID, boothId: BOOTH_ID },
      { status: "claimed", confirmedAt: null },
    );
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("finalizes an unnumbered order paykit holds as confirmed, with paykit's confirmed_at", async () => {
    paykitHolds("confirmed");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(finalizePaidOrderMock).toHaveBeenCalledWith(
      { id: ORDER_ID, boothId: BOOTH_ID },
      { status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" },
    );
  });

  it("503s when the order cannot be finalized", async () => {
    finalizePaidOrderMock.mockResolvedValue({ ok: false });
    const res = await callback("claimed");
    expect(res.status).toBe(503);
  });

  it.each(["claimed", "confirmed"] as const)(
    "updates the mirror and only prints a confirmed numbered order (%s)",
    async (status) => {
      orderMaybeSingle.mockResolvedValue({
        data: order({ order_number: "0007", status: "preparing" }),
        error: null,
      });
      paykitHolds(status);
      const res = await callback(status);
      expect(res.status).toBe(200);
      expect(finalizePaidOrderMock).not.toHaveBeenCalled();
      expect(writePaidMirrorMock).toHaveBeenCalledTimes(1);
      expect(notifyPrintkitMock).toHaveBeenCalledTimes(
        status === "confirmed" ? 1 : 0,
      );
      if (status === "confirmed")
        expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH_ID, "0007");
      expect(writePaidMirrorMock).toHaveBeenCalledWith(
        expect.anything(),
        ORDER_ID,
        {
          status,
          confirmedAt: status === "confirmed" ? "2026-08-11T00:00:05Z" : null,
        },
      );
    },
  );

  it("returns a claimed mirror to pending when paykit holds pending", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "claimed" }),
      error: null,
    });
    paykitHolds("pending");
    const res = await callback("pending");
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ payment_status: "pending" });
    expect(updateFilters).toEqual([
      ["eq", "id", ORDER_ID],
      ["eq", "payment_status", "claimed"],
      ["neq", "status", "cancelled"],
    ]);
    expect(finalizePaidOrderMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("503s when the return to pending fails to write", async () => {
    paykitHolds("pending");
    updateResult.value = { error: { message: "boom" } };
    const res = await callback("pending");
    expect(res.status).toBe(503);
  });

  it("a repeated callback is answered the same way and finalizes nothing twice once the order has its number", async () => {
    const first = await callback("claimed");
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "claimed" }),
      error: null,
    });
    const second = await callback("claimed");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(finalizePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(writePaidMirrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/paykit/payment-status: orders it must leave alone", () => {
  it.each(["pending", "claimed", "confirmed"] as const)(
    "never changes a cancelled order (paykit holds %s), and logs it",
    async (status) => {
      orderMaybeSingle.mockResolvedValue({
        data: order({ status: "cancelled" }),
        error: null,
      });
      paykitHolds(status);
      const res = await callback(status);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: "cancelled" });
      expectNothingApplied();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancelled"),
        ORDER_ID,
        status,
      );
    },
  );

  it("never changes an order that does not take payment", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "not_required" }),
      error: null,
    });
    paykitHolds("confirmed");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "not_required" });
    expectNothingApplied();
  });
});
