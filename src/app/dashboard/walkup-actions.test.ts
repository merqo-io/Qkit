const { notifyPrintkitMock } = vi.hoisted(() => ({
  notifyPrintkitMock: vi.fn(),
}));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyPrintkit: notifyPrintkitMock,
}));
import { describe, expect, it, vi, beforeEach } from "vitest";
import { placeWalkupOrder } from "./walkup-actions";
import type { PlaceOrderInput } from "@/lib/schemas";

const {
  rpcMock,
  orderLookupMock,
  getUserMock,
  createCheckoutMock,
  createServerClientMock,
} = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const orderLookupMock = vi.fn();
  const getUserMock = vi.fn();
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: orderLookupMock,
  };
  return {
    rpcMock,
    orderLookupMock,
    getUserMock,
    createCheckoutMock: vi.fn(),
    createServerClientMock: vi.fn(() =>
      Promise.resolve({
        rpc: rpcMock,
        from: () => query,
        auth: { getUser: getUserMock },
      }),
    ),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/lib/paykit/client", () => ({ createCheckout: createCheckoutMock }));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

function makeInput(over: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    customerName: "Ada",
    items: [{ menuItemId: "m1", name: "Kopi", quantity: 2 }],
    ...over,
  };
}

beforeEach(() => {
  notifyPrintkitMock.mockReset().mockResolvedValue(undefined);
  rpcMock.mockReset();
  createServerClientMock.mockClear();
  orderLookupMock.mockReset();
  orderLookupMock.mockResolvedValue({ data: null });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
  createCheckoutMock.mockReset();
});

function placedOk() {
  rpcMock.mockResolvedValue({
    data: { order_number: "0001", access_token: "tok" },
    error: null,
  });
}

const PENDING_ORDER = {
  data: {
    id: "order-1",
    total_cents: 550,
    payment_status: "pending",
    created_at: "2026-10-14T01:15:00.000Z",
  },
};

describe("placeWalkupOrder", () => {
  it("rejects a non-boolean payment flag before invoking the RPC", async () => {
    const result = await placeWalkupOrder(
      BOOTH_ID,
      makeInput(),
      "false" as unknown as boolean,
    );
    expect(result).toEqual({ success: false, error: "Invalid payment state" });
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("rejects an invalid booth id without calling the RPC", async () => {
    const res = await placeWalkupOrder("not-a-uuid", makeInput(), false);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid order details (schema) without calling the RPC", async () => {
    const res = await placeWalkupOrder(
      BOOTH_ID,
      makeInput({ items: [] }),
      false,
    );
    expect(res).toEqual({ success: false, error: "Invalid order details" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls place_walkup_order with the booth id, name, items, and paid flag", async () => {
    rpcMock.mockResolvedValue({
      data: { order_number: "0001", access_token: "tok" },
      error: null,
    });
    const input = makeInput();

    const res = await placeWalkupOrder(BOOTH_ID, input, false);

    expect(rpcMock).toHaveBeenCalledWith("place_walkup_order", {
      p_booth_id: BOOTH_ID,
      p_customer_name: input.customerName,
      p_items: input.items,
      p_paid: false,
    });
    expect(res).toEqual({
      success: true,
      orderNumber: "0001",
      accessToken: "tok",
      payment: null,
    });
  });

  it("returns the booth's checkout for an order placed unpaid", async () => {
    placedOk();
    orderLookupMock.mockResolvedValue(PENDING_ORDER);
    const checkout = { type: "qr", transactionId: "tx-1", payload: "PAYLOAD" };
    createCheckoutMock.mockResolvedValue({ ok: true, data: checkout });

    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);

    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      amountCents: 550,
      orderRef: "order-1",
      expiresAt: "2026-10-14T01:45:00.000Z",
    });
    expect(res).toMatchObject({
      success: true,
      payment: { orderId: "order-1", amountCents: 550, checkout },
    });
  });

  it("keeps the order payable when paykit cannot be reached", async () => {
    placedOk();
    orderLookupMock.mockResolvedValue(PENDING_ORDER);
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: null,
      error: "unreachable",
    });

    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);

    expect(res).toMatchObject({
      success: true,
      payment: { orderId: "order-1", amountCents: 550, checkout: null },
    });
  });

  it("returns no payment for an order that owes nothing", async () => {
    placedOk();
    orderLookupMock.mockResolvedValue({
      data: { id: "order-1", total_cents: 0, payment_status: "not_required" },
    });

    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);

    expect(res).toMatchObject({ success: true, payment: null });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("skips the payment lookup for an order placed already paid", async () => {
    placedOk();

    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), true);

    expect(res).toMatchObject({ success: true, payment: null });
    expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH_ID, "0001");
    expect(orderLookupMock).not.toHaveBeenCalled();
  });

  it("still reports the order placed when the payment lookup throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    placedOk();
    orderLookupMock.mockRejectedValue(new Error("db down"));

    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);

    expect(res).toMatchObject({
      success: true,
      orderNumber: "0001",
      payment: null,
    });
    errorSpy.mockRestore();
  });

  it("passes paid=true through to p_paid", async () => {
    rpcMock.mockResolvedValue({
      data: { order_number: "0001", access_token: "tok" },
      error: null,
    });
    await placeWalkupOrder(BOOTH_ID, makeInput(), true);

    expect(rpcMock).toHaveBeenCalledWith(
      "place_walkup_order",
      expect.objectContaining({ p_paid: true }),
    );
  });

  it("maps ORDER_UNAUTHORIZED to a not-your-booth message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_UNAUTHORIZED: not your booth" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({ success: false, error: "Not your booth." });
  });

  it("maps ORDER_SOLD_OUT to a sold-out message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_SOLD_OUT: m1" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "An item just sold out. Adjust the order.",
    });
  });

  it("maps ORDER_RATE_LIMITED to a rate-limit message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "ORDER_RATE_LIMITED: booth flood" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Too many orders too fast. Wait a moment and try again.",
    });
  });

  it("falls back to a generic message and logs on an unrecognized error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Could not place order. Please try again.",
    });
    expect(errorSpy).toHaveBeenCalledWith("placeWalkupOrder failed", "boom");
    errorSpy.mockRestore();
  });

  it("handles a malformed RPC success payload", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: { unexpected: true }, error: null });
    const res = await placeWalkupOrder(BOOTH_ID, makeInput(), false);
    expect(res).toEqual({
      success: false,
      error: "Could not place order. Please try again.",
    });
    errorSpy.mockRestore();
  });
});
