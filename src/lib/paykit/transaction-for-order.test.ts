import { describe, expect, it, vi, beforeEach } from "vitest";
import { transactionIdForOrder } from "./transaction-for-order";

const { getCheckoutByOrderRefMock, createCheckoutMock } = vi.hoisted(() => ({
  getCheckoutByOrderRefMock: vi.fn(),
  createCheckoutMock: vi.fn(),
}));
vi.mock("./client", () => ({
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
  createCheckout: createCheckoutMock,
}));

const ARGS = {
  vendorId: "v1",
  amountCents: 800,
  orderRef: "o1",
  expiresAt: "2026-08-11T00:30:00.000Z",
};

function found(amountCents = 800) {
  return {
    ok: true,
    data: {
      transactionId: "tx1",
      status: "claimed",
      amountCents,
      orderRef: "o1",
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: null,
      vendorId: "v1",
    },
  };
}

beforeEach(() => {
  getCheckoutByOrderRefMock.mockReset().mockResolvedValue(found());
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx-new", payload: "0002" },
  });
});

describe("transactionIdForOrder", () => {
  it("returns the transaction paykit already holds, without creating one", async () => {
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: true,
      data: "tx1",
    });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith("o1");
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a transaction that belongs to a different vendor", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: true,
      data: { ...found().data, vendorId: "v2" },
    });
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: false,
      status: 409,
      error: "Checkout belongs to a different vendor",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a transaction whose amount differs from the order's", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue(found(900));
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: false,
      status: 409,
      error: "Checkout amount does not match this order",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it.each([404, 405])(
    "creates the checkout when the lookup answers %i",
    async (status) => {
      getCheckoutByOrderRefMock.mockResolvedValue({
        ok: false,
        status,
        error: "Not found",
      });
      expect(await transactionIdForOrder(ARGS)).toEqual({
        ok: true,
        data: "tx-new",
      });
      expect(createCheckoutMock).toHaveBeenCalledWith(ARGS);
    },
  );

  it("returns the create failure when the fallback fails", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
    });
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 422,
      error: "vendor has no PayNow config",
    });
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: false,
      status: 422,
      error: "vendor has no PayNow config",
    });
  });

  it.each([503, 429, 401, null])(
    "does not create a checkout when the lookup fails with %s",
    async (status) => {
      getCheckoutByOrderRefMock.mockResolvedValue({
        ok: false,
        status,
        error: "Upstream unavailable",
      });
      expect(await transactionIdForOrder(ARGS)).toEqual({
        ok: false,
        status,
        error: "Upstream unavailable",
      });
      expect(createCheckoutMock).not.toHaveBeenCalled();
    },
  );
});
