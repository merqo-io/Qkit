import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  unclaimPayment,
  getPaymentStatus,
  loadPreClaimContext,
} from "./payment-actions";

// Mock the service client. Each table read goes through a depth-flexible
// eq-chain ending in maybeSingle() -- real callers in this file vary in how
// many .eq() calls precede the terminal read (loadCheckoutContext's 3-eq
// order lookup vs. loadPreClaimContext's 2-eq one), and the mock
// doesn't care how many, only what it resolves to:
//   orders:  select().eq()[.eq()...].maybeSingle()
//            update().eq()[.eq()|.neq()|.in()|.or()...].select() -- every
//            mirror write ends in .select("id").
//   booths:  select().eq().maybeSingle()
//   rpc:     rpc("assign_order_number", { p_order_id })
const {
  createServiceClientMock,
  ordersMaybeSingle,
  readEqMock,
  writeEqMock,
  boothsMaybeSingle,
  update,
  writeSelect,
  storageFromMock,
  rpcMock,
  rateLimitMock,
  clientIpMock,
} = vi.hoisted(() => {
  const ordersMaybeSingle = vi.fn();
  const readEqMock = vi.fn();
  const writeEqMock = vi.fn();
  const boothsMaybeSingle = vi.fn();
  const writeSelect = vi.fn();
  const storageFromMock = vi.fn();
  const rpcMock = vi.fn();

  function readChain(maybeSingleFn: () => unknown) {
    const node = {
      eq: (...args: unknown[]) => {
        readEqMock(...args);
        return node;
      },
      maybeSingle: maybeSingleFn,
    };
    return node;
  }
  const ordersSelect = () => readChain(ordersMaybeSingle);
  const boothsSelect = () => readChain(boothsMaybeSingle);

  const update = vi.fn(() => {
    const node = {
      eq: (...args: unknown[]) => {
        writeEqMock(...args);
        return node;
      },
      neq: () => node,
      in: () => node,
      or: () => node,
      select: writeSelect,
    };
    return node;
  });

  const from = (table: string) =>
    table === "booths"
      ? { select: boothsSelect }
      : { select: ordersSelect, update };
  return {
    createServiceClientMock: vi.fn(() =>
      Promise.resolve({
        from,
        storage: {
          from: (...args: unknown[]) => {
            storageFromMock(...args);
            return { upload: storageFromMock };
          },
        },
        rpc: rpcMock,
      }),
    ),
    ordersMaybeSingle,
    readEqMock,
    writeEqMock,
    boothsMaybeSingle,
    update,
    writeSelect,
    storageFromMock,
    rpcMock,
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(() => "1.2.3.4"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: clientIpMock,
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const { createCheckoutMock, unclaimCheckoutMock, getCheckoutByOrderRefMock } =
  vi.hoisted(() => ({
    createCheckoutMock: vi.fn(),
    unclaimCheckoutMock: vi.fn(),
    getCheckoutByOrderRefMock: vi.fn(),
  }));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  unclaimCheckout: unclaimCheckoutMock,
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));

const { notifyVendorTelegramMock, notifyPrintkitMock } = vi.hoisted(() => ({
  notifyVendorTelegramMock: vi.fn(),
  notifyPrintkitMock: vi.fn(),
}));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyVendorTelegram: notifyVendorTelegramMock,
  notifyPrintkit: notifyPrintkitMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "A17";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  update.mockClear();
  readEqMock.mockClear();
  writeEqMock.mockClear();
  ordersMaybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "o1",
      total_cents: 800,
      payment_status: "pending",
      status: "preparing",
      customer_name: "Ann",
    },
  });
  boothsMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1", print_enabled: false } });
  // Default: the guarded mirror UPDATE matched its row.
  writeSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  storageFromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: "0007", error: null });
  rateLimitMock.mockReset().mockResolvedValue(true);
  clientIpMock.mockClear();
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx1", payload: "0002" },
  });
  getCheckoutByOrderRefMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "pending",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: null,
      confirmedAt: null,
      vendorId: "v1",
    },
  });
  unclaimCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "pending",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: null,
      confirmedAt: null,
    },
  });
  notifyVendorTelegramMock.mockReset().mockResolvedValue(undefined);
  notifyPrintkitMock.mockReset().mockResolvedValue(undefined);
});

const ORIGIN = "https://qkit.merqo.io";
const RETURN_URL = `${ORIGIN}/order/${BOOTH}/pay?t=${TOKEN}`;

function pendingOrder(extra: Record<string, unknown> = {}) {
  return {
    data: {
      id: "order-1",
      total_cents: 550,
      payment_status: "pending",
      status: "pending",
      order_number: null,
      created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      ...extra,
    },
  };
}

function checkoutAnswer(status: string, payUrl: string | null) {
  return {
    ok: true,
    data: {
      type: "qr",
      transactionId: "tx-1",
      payload: "p",
      status,
      payUrl,
    },
  };
}

describe("loadPreClaimContext", () => {
  beforeEach(() => {
    ordersMaybeSingle.mockResolvedValue(pendingOrder());
    boothsMaybeSingle.mockResolvedValue({
      data: { vendor_id: "vendor-1", name: "Kopi Cart" },
    });
  });

  it("asks paykit for a pay page that returns here and answers its address", async () => {
    const placed = new Date(Date.now() - 5 * 60_000).toISOString();
    ordersMaybeSingle.mockResolvedValue(pendingOrder({ created_at: placed }));
    createCheckoutMock.mockResolvedValueOnce(
      checkoutAnswer("pending", "https://paykit.example/pay/tx-1?k=abc"),
    );

    const result = await loadPreClaimContext(BOOTH, TOKEN, ORIGIN);

    expect(readEqMock).toHaveBeenCalledWith("booth_id", BOOTH);
    expect(readEqMock).toHaveBeenCalledWith("access_token", TOKEN);
    expect(result).toEqual({
      state: "pay",
      payUrl: "https://paykit.example/pay/tx-1?k=abc",
    });
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      amountCents: 550,
      orderRef: "order-1",
      expiresAt: new Date(Date.parse(placed) + 30 * 60_000).toISOString(),
      returnUrl: RETURN_URL,
      title: "Kopi Cart",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("gives paykit the same expiry on a later reload, taken from created_at", async () => {
    const placed = "2026-10-14T01:15:00.000Z";
    ordersMaybeSingle.mockResolvedValue(pendingOrder({ created_at: placed }));
    createCheckoutMock.mockResolvedValue(
      checkoutAnswer("pending", "https://paykit.example/pay/tx-1?k=abc"),
    );
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-14T01:16:00Z"));
      await loadPreClaimContext(BOOTH, TOKEN, ORIGIN);
      vi.setSystemTime(new Date("2026-10-14T01:40:00Z"));
      await loadPreClaimContext(BOOTH, TOKEN, ORIGIN);
    } finally {
      vi.useRealTimers();
    }
    const sent = createCheckoutMock.mock.calls.map((c) => c[0].expiresAt);
    expect(sent).toEqual([
      "2026-10-14T01:45:00.000Z",
      "2026-10-14T01:45:00.000Z",
    ]);
  });

  it("cuts a long booth name to what paykit allows as a title", async () => {
    boothsMaybeSingle.mockResolvedValueOnce({
      data: { vendor_id: "vendor-1", name: "K".repeat(300) },
    });
    createCheckoutMock.mockResolvedValueOnce(
      checkoutAnswer("pending", "https://paykit.example/pay/tx-1?k=abc"),
    );
    await loadPreClaimContext(BOOTH, TOKEN, ORIGIN);
    expect(createCheckoutMock.mock.calls[0][0].title).toHaveLength(120);
  });

  it("is unavailable when paykit gives no pay page", async () => {
    createCheckoutMock.mockResolvedValueOnce(checkoutAnswer("pending", null));
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "unavailable",
    });
  });

  it("is unavailable when paykit cannot be reached", async () => {
    createCheckoutMock.mockResolvedValueOnce({
      ok: false,
      status: null,
      error: "fetch failed",
    });
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "unavailable",
    });
  });

  it("is unavailable when paykit refuses the return address", async () => {
    createCheckoutMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "return_url is not allowed for this kit",
    });
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "unavailable",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each(["claimed", "confirmed"])(
    "numbers the order when the customer returns with the payment %s on paykit",
    async (status) => {
      createCheckoutMock.mockResolvedValueOnce(
        checkoutAnswer(status, "https://paykit.example/pay/tx-1?k=abc"),
      );

      expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
        state: "placed",
        orderNumber: "0007",
      });
      expect(rpcMock).toHaveBeenCalledWith("assign_order_number", {
        p_order_id: "order-1",
      });
      expect(notifyVendorTelegramMock).toHaveBeenCalledWith(BOOTH, "0007");
      expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH, "0007");
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: status }),
      );
    },
  );

  it("sends no second vendor alert when the paykit callback finalized the order first", async () => {
    rateLimitMock.mockImplementation((key: string) =>
      Promise.resolve(!key.startsWith("paid-order-alert:")),
    );
    createCheckoutMock.mockResolvedValueOnce(
      checkoutAnswer("claimed", "https://paykit.example/pay/tx-1?k=abc"),
    );
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "placed",
      orderNumber: "0007",
    });
    expect(notifyVendorTelegramMock).not.toHaveBeenCalled();
    expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH, "0007");
  });

  it("is unavailable, and changes nothing, when numbering fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    createCheckoutMock.mockResolvedValueOnce(
      checkoutAnswer("claimed", "https://paykit.example/pay/tx-1?k=abc"),
    );
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "unavailable",
    });
    expect(update).not.toHaveBeenCalled();
    expect(notifyVendorTelegramMock).not.toHaveBeenCalled();
    expect(notifyPrintkitMock).not.toHaveBeenCalled();
  });

  it("finishes an order that is claimed but still has no number", async () => {
    ordersMaybeSingle.mockResolvedValueOnce(
      pendingOrder({ payment_status: "claimed" }),
    );
    createCheckoutMock.mockResolvedValueOnce(checkoutAnswer("claimed", null));
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "placed",
      orderNumber: "0007",
    });
  });

  it("returns null for an invalid booth or token", async () => {
    expect(await loadPreClaimContext("not-a-uuid", TOKEN, ORIGIN)).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null and never calls paykit when rate-limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith(
      `pre-claim-context:${BOOTH}:${TOKEN}`,
      20,
      60,
    );
  });

  it("returns null when no order matches the booth/token", async () => {
    ordersMaybeSingle.mockResolvedValueOnce({ data: null });
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it.each(["claimed", "confirmed", "not_required"])(
    "returns the numbered route for a %s order without calling paykit",
    async (paymentStatus) => {
      ordersMaybeSingle.mockResolvedValueOnce(
        pendingOrder({ payment_status: paymentStatus, order_number: "0007" }),
      );
      expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
        state: "placed",
        orderNumber: "0007",
      });
      expect(createCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it("returns null for an order that needs no payment and has no number", async () => {
    ordersMaybeSingle.mockResolvedValueOnce(
      pendingOrder({ payment_status: "not_required" }),
    );
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns a cancelled state before creating a checkout", async () => {
    ordersMaybeSingle.mockResolvedValueOnce(
      pendingOrder({ status: "cancelled" }),
    );
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "cancelled",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns null when the booth/vendor lookup finds nothing", async () => {
    boothsMaybeSingle.mockResolvedValueOnce({ data: null });
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toBeNull();
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns an expired state for an order unpaid past the window, minting no pay link", async () => {
    ordersMaybeSingle.mockResolvedValueOnce(
      pendingOrder({
        created_at: new Date(Date.now() - 40 * 24 * 60 * 60_000).toISOString(),
      }),
    );
    expect(await loadPreClaimContext(BOOTH, TOKEN, ORIGIN)).toEqual({
      state: "expired",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});

describe("unclaimPayment", () => {
  beforeEach(() => {
    ordersMaybeSingle.mockReset().mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "claimed",
        status: "preparing",
      },
    });
  });

  it("reverts a claimed order via paykit and mirrors the status locally", async () => {
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(readEqMock).toHaveBeenCalledWith("booth_id", BOOTH);
    expect(readEqMock).toHaveBeenCalledWith("order_number", ORDER);
    expect(readEqMock).toHaveBeenCalledWith("access_token", TOKEN);
    expect(writeEqMock.mock.calls).toEqual([
      ["booth_id", BOOTH],
      ["order_number", ORDER],
      ["access_token", TOKEN],
      ["payment_status", "claimed"],
    ]);
    expect(res).toEqual({ success: true });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith("o1");
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(unclaimCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({ payment_status: "pending" });
  });

  it("does not mirror pending when a concurrent claim won in Paykit", async () => {
    unclaimCheckoutMock.mockResolvedValue({
      ok: true,
      data: { status: "claimed" },
    });
    expect(await unclaimPayment(BOOTH, ORDER, TOKEN)).toEqual({
      success: false,
      error: "Could not undo. Try again.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks when rate-limited and never calls paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Too many attempts. Wait a moment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth id before creating the client", async () => {
    const res = await unclaimPayment("not-a-uuid", ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns 'Invalid order' when the order/booth lookup finds nothing", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: false, error: "Invalid order" });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("stays idempotent when already back to pending, without calling paykit", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "pending",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("refuses to undo a payment the stall already confirmed (local mirror check)", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "confirmed",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "The stall already confirmed your payment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("refuses to undo when paykit reports the transaction was confirmed in the meantime", async () => {
    unclaimCheckoutMock.mockResolvedValue({
      ok: true,
      data: {
        transactionId: "tx1",
        status: "confirmed",
        amountCents: 800,
        orderRef: "o1",
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: "2026-08-11T00:05:00Z",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "The stall already confirmed your payment.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that never required payment", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: {
        id: "o1",
        total_cents: 800,
        payment_status: "not_required",
        status: "preparing",
      },
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "This order doesn't take payment.",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit checkout lookup fails", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not undo. Try again.",
    });
    expect(unclaimCheckoutMock).not.toHaveBeenCalled();
  });

  it("undoes a claim after the vendor changed payment details", async () => {
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Payment configuration changed since checkout creation",
    });
    expect(await unclaimPayment(BOOTH, ORDER, TOKEN)).toEqual({
      success: true,
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(unclaimCheckoutMock).toHaveBeenCalledWith("tx1");
  });

  it("reports a failure when paykit's unclaim call fails", async () => {
    unclaimCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({
      success: false,
      error: "Could not undo. Try again.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("still reports success when the local mirror write fails (paykit already recorded the revert)", async () => {
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await unclaimPayment(BOOTH, ORDER, TOKEN);
    expect(res).toEqual({ success: true });
  });
});

describe("getPaymentStatus", () => {
  it("returns null for an invalid token without creating a client", async () => {
    const res = await getPaymentStatus(BOOTH, ORDER, "not-a-uuid");
    expect(res).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any order", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
  });

  it("returns null and never reads the order when rate-limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    ordersMaybeSingle.mockResolvedValue({
      data: { payment_status: "confirmed" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(rateLimitMock).toHaveBeenCalledWith(
      `payment-status:${TOKEN}`,
      30,
      60,
    );
  });

  it("returns the payment status for a matching token", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: { payment_status: "confirmed" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBe("confirmed");
    expect(readEqMock.mock.calls).toEqual([
      ["booth_id", BOOTH],
      ["order_number", ORDER],
      ["access_token", TOKEN],
    ]);
  });

  it("returns null and logs on a real read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    ordersMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await getPaymentStatus(BOOTH, ORDER, TOKEN);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("getPaymentStatus failed", "boom");
    errorSpy.mockRestore();
  });
});
