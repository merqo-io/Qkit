import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  advanceOrder,
  revertOrderAdvance,
  confirmOrderPayment,
  confirmPaymentAndStart,
  declinePaymentClaim,
  revertPaymentAndStart,
  cancelOrder,
  bumpOrder,
  restoreAutoCompleted,
  sweepReadyOrders,
  sweepAbandonedPayments,
} from "./order-actions";

it("rejects omitted runtime undo states before reading or writing", async () => {
  const result = await revertOrderAdvance(
    "00000000-0000-4000-8000-000000000001",
    undefined as unknown as import("@/lib/types").OrderStatus,
    undefined as unknown as import("@/lib/types").OrderStatus,
    "pending",
  );
  expect(result.success).toBe(false);
  expect(getUserMock).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

// Mock the supabase server client's fluent chain and the vendor gate. Two
// chains hang off `from("orders")`: a read (select→eq→maybeSingle) and a write
// (update→eq→eq→select). `maybeSingle` is set per-test to the "current" order
// row; `updateSelect` returns the updated rows — [] models a concurrent change
// that the status/payment guard filtered out. `from("vendors")` is a separate
// branch (select→eq→maybeSingle) for sweepReadyOrders' board_settings read;
// `update(...)` on the orders branch also exposes a `.eq().lt(...).select(...)`
// chain for the sweep's bulk update (returns the swept ids) alongside the
// existing `.eq().eq().select(...)`. The sweep chain now supports multiple
// `.eq()` calls (for sweepAbandonedPayments which needs 3 filters).
const {
  getUserMock,
  maybeSingle,
  update,
  updateSelect,
  vendorSingle,
  sweepLt,
  sweepSelect,
  sweepEqMock,
} = vi.hoisted(() => {
  const updateSelect = vi.fn();
  const sweepSelect = vi.fn();
  const sweepLt = vi.fn(() => ({ select: sweepSelect }));
  const vendorSingle = vi.fn();

  // Create a recursive chain that supports unlimited .eq() calls followed by .lt().
  // All .eq() calls share the same mock (sweepEqMock) so tests can assert on the
  // full filter chain.
  type QueryChain = {
    eq: (...args: unknown[]) => QueryChain;
    lt: typeof sweepLt;
    select: typeof updateSelect;
  };
  function createChain(): QueryChain {
    return { eq: sweepEqMock, lt: sweepLt, select: updateSelect };
  }
  const sweepEqMock = vi.fn(() => createChain());

  return {
    getUserMock: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(() => createChain()),
    updateSelect,
    vendorSingle,
    sweepLt,
    sweepSelect,
    sweepEqMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "vendors")
          return {
            select: () => ({ eq: () => ({ maybeSingle: vendorSingle }) }),
          };
        return {
          select: () => ({ eq: () => ({ maybeSingle }) }),
          update,
        };
      },
    }),
}));
vi.mock("@/lib/supabase/get-user", () => ({ getUser: getUserMock }));

const {
  createCheckoutMock,
  confirmCheckoutMock,
  unclaimCheckoutMock,
  getCheckoutByOrderRefMock,
} = vi.hoisted(() => ({
  createCheckoutMock: vi.fn(),
  confirmCheckoutMock: vi.fn(),
  unclaimCheckoutMock: vi.fn(),
  getCheckoutByOrderRefMock: vi.fn(),
}));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  confirmCheckout: confirmCheckoutMock,
  unclaimCheckout: unclaimCheckoutMock,
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));

const { notifyCustomerMock } = vi.hoisted(() => ({
  notifyCustomerMock: vi.fn(),
}));
vi.mock("@/lib/merqo/customer-notify", () => ({
  notifyCustomer: notifyCustomerMock,
}));

const { sendOrderReadyPushMock, afterMock } = vi.hoisted(() => ({
  sendOrderReadyPushMock: vi.fn(),
  // Runs the deferred callback at once; a test may queue it instead.
  afterMock: vi.fn((task: () => unknown) => {
    void task();
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendOrderReadyPush: sendOrderReadyPushMock,
}));
vi.mock("next/server", () => ({ after: afterMock }));

const { recordAuditMock, recordOrderStatusEventMock } = vi.hoisted(() => ({
  recordAuditMock: vi.fn(),
  recordOrderStatusEventMock: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: recordAuditMock,
  recordOrderStatusEvent: recordOrderStatusEventMock,
}));

const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ id: "v1" });
  maybeSingle.mockReset();
  update.mockClear();
  // Default: the guarded UPDATE matched its row (1 row back).
  updateSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: ID }], error: null });
  // board_settings is always the full object in the DB (0065_ready_auto_clear
  // sets a complete JSONB default) — boardSettingsSchema validates all its
  // fields, not just ready_auto_clear_min, so the mock must be complete too.
  vendorSingle.mockReset().mockResolvedValue({
    data: {
      board_settings: {
        aging_min: 5,
        overdue_min: 10,
        sound_id: "chime",
        desktop_notify: false,
        undo_seconds: 4,
        daily_order_number_reset: false,
        show_wait_estimate: true,
        default_prep_minutes: null,
        ready_auto_clear_min: 3,
      },
    },
  });
  sweepEqMock.mockClear();
  sweepLt.mockClear();
  sweepSelect.mockReset().mockResolvedValue({ data: [], error: null });
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  recordOrderStatusEventMock.mockReset().mockResolvedValue(undefined);
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx1", payload: "0002" },
  });
  getCheckoutByOrderRefMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "claimed",
      amountCents: 800,
      orderRef: ID,
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: null,
      vendorId: "v1",
    },
  });
  unclaimCheckoutMock.mockReset();
  confirmCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "confirmed",
      amountCents: 800,
      orderRef: ID,
      claimedAt: null,
      confirmedAt: "2026-08-11T00:00:00Z",
    },
  });
  notifyCustomerMock.mockReset().mockResolvedValue(undefined);
  sendOrderReadyPushMock.mockReset().mockResolvedValue(undefined);
  afterMock.mockClear();
});

describe("advanceOrder", () => {
  it("does not complete an order made ready before a stale Mark Ready request", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
      error: null,
    });
    const result = await advanceOrder(ID, "preparing");
    expect(result.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed expected status before database access", async () => {
    const result = await advanceOrder(
      ID,
      "invalid" as unknown as import("@/lib/types").OrderStatus,
    );
    expect(result.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("advances preparing → ready and stamps ready_at", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(update).toHaveBeenCalledWith({
      status: "ready",
      ready_at: expect.any(String),
    });
    expect(sweepEqMock).toHaveBeenCalledWith("id", ID);
    expect(sweepEqMock).toHaveBeenCalledWith("status", "preparing");
  });

  it.each(["pending", "claimed"])(
    "completes without confirming a %s payment",
    async (paymentStatus) => {
      maybeSingle.mockResolvedValue({
        data: { id: ID, status: "ready", payment_status: paymentStatus },
      });
      const res = await advanceOrder(ID);
      expect(res).toEqual({ success: true, status: "completed" });
      expect(update).toHaveBeenCalledWith({
        status: "completed",
        completed_at: expect.any(String),
      });
      expect(confirmCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an order with no legal forward move", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await advanceOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("notifies the customer via Telegram when advancing to ready", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    await advanceOrder(ID);
    expect(notifyCustomerMock).toHaveBeenCalledWith(
      "v1",
      `qkit:${ID}`,
      "Your order is ready for pickup!",
    );
  });

  it("sends the web push after responding when advancing to ready", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    await advanceOrder(ID);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(sendOrderReadyPushMock).toHaveBeenCalledWith(ID);
  });

  it("does not wait for the web push before returning", async () => {
    let deferred: (() => unknown) | null = null;
    afterMock.mockImplementationOnce((task: () => unknown) => {
      deferred = task;
    });
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(sendOrderReadyPushMock).not.toHaveBeenCalled();
    expect(deferred).not.toBeNull();
  });

  it("still returns success when scheduling the web push throws", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("no request scope");
    });
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(notifyCustomerMock).toHaveBeenCalled();
  });

  it("sends the web push even when the vendor turned off the Telegram ping", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    vendorSingle.mockResolvedValue({
      data: { board_settings: { customer_telegram_notify_enabled: false } },
    });
    await advanceOrder(ID);
    expect(sendOrderReadyPushMock).toHaveBeenCalledWith(ID);
  });

  it("does not send the web push for other transitions", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    await advanceOrder(ID);
    expect(sendOrderReadyPushMock).not.toHaveBeenCalled();
  });

  it("still returns success when notifyCustomer rejects", async () => {
    notifyCustomerMock.mockRejectedValue(new Error("merqo down"));
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
  });

  it("preserves the committed advance if notification preference lookup rejects", async () => {
    vendorSingle.mockRejectedValueOnce(new Error("database disconnected"));
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    await expect(advanceOrder(ID)).resolves.toEqual({
      success: true,
      status: "ready",
    });
    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });

  it("does not notify when advancing to a status other than ready", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "pending", payment_status: "not_required" },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "preparing" });
    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });

  it("does not notify a second time when advancing from ready to completed", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    await advanceOrder(ID);
    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });

  it("does not notify when the vendor has disabled the customer notification", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    vendorSingle.mockResolvedValue({
      data: {
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 4,
          daily_order_number_reset: false,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: 3,
          customer_telegram_notify_enabled: false,
        },
      },
    });
    const res = await advanceOrder(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(notifyCustomerMock).not.toHaveBeenCalled();
  });

  it("still notifies when customer_telegram_notify_enabled is explicitly true", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    vendorSingle.mockResolvedValue({
      data: {
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 4,
          daily_order_number_reset: false,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: 3,
          customer_telegram_notify_enabled: true,
        },
      },
    });
    await advanceOrder(ID);
    expect(notifyCustomerMock).toHaveBeenCalledWith(
      "v1",
      `qkit:${ID}`,
      "Your order is ready for pickup!",
    );
  });

  it("still notifies when the vendor has no board_settings row at all (defaults true, backward compat)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    vendorSingle.mockResolvedValue({ data: null });
    await advanceOrder(ID);
    expect(notifyCustomerMock).toHaveBeenCalledWith(
      "v1",
      `qkit:${ID}`,
      "Your order is ready for pickup!",
    );
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await advanceOrder("not-a-uuid");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await advanceOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the status changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    // The guarded UPDATE matched nothing — another action moved the order.
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await advanceOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed. Please refresh.",
    });
  });
});

describe("revertOrderAdvance payment isolation", () => {
  it.each(["pending", "claimed"] as const)(
    "preserves concurrent payment confirmation when the previous payment was %s",
    async (previousPayment) => {
      maybeSingle.mockResolvedValue({
        data: { id: ID, status: "completed", payment_status: "confirmed" },
      });
      expect(
        await revertOrderAdvance(ID, "ready", "completed", previousPayment),
      ).toEqual({ success: true, status: "ready" });
      expect(update).toHaveBeenCalledWith({
        status: "ready",
        completed_at: null,
      });
      expect(sweepEqMock).toHaveBeenCalledWith("id", ID);
      expect(sweepEqMock).toHaveBeenCalledWith("status", "completed");
      expect(confirmCheckoutMock).not.toHaveBeenCalled();
    },
  );
});

describe("confirmPaymentAndStart", () => {
  it.each(["pending", "claimed"])(
    "does not advance when Paykit returns %s",
    async (status) => {
      maybeSingle.mockResolvedValue({
        data: {
          id: ID,
          status: "pending",
          payment_status: "claimed",
          total_cents: 800,
        },
      });
      confirmCheckoutMock.mockResolvedValue({ ok: true, data: { status } });
      expect(await confirmPaymentAndStart(ID)).toEqual({
        success: false,
        error: "Failed to confirm payment",
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it("confirms payment via paykit and advances to preparing in one write", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ID);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({
      status: "preparing",
      payment_status: "confirmed",
    });
  });

  it("confirms and starts an order whose vendor changed payment details after checkout", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Payment configuration changed since checkout creation",
    });
    expect(await confirmPaymentAndStart(ID)).toEqual({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
  });

  it("refuses to confirm a transaction that belongs to another vendor", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: true,
      data: {
        transactionId: "tx1",
        status: "claimed",
        amountCents: 800,
        orderRef: ID,
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: null,
        vendorId: "v2",
      },
    });
    expect(await confirmPaymentAndStart(ID)).toEqual({
      success: false,
      error: "Failed to confirm payment",
    });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses when payment is already confirmed", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "pending", payment_status: "confirmed" },
    });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: false,
      error: "Order can't be advanced",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses when status isn't pending", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "claimed" },
    });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: false,
      error: "Order can't be advanced",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed -- please refresh.",
    });
  });

  it("treats a lost race as success when a concurrent call already confirmed+advanced it", async () => {
    maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: ID,
          status: "pending",
          payment_status: "claimed",
          total_cents: 800,
        },
      })
      .mockResolvedValueOnce({
        data: { status: "preparing", payment_status: "confirmed" },
      });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: true,
      status: "preparing",
      prevPaymentStatus: "claimed",
    });
  });

  it("still reports a refresh on a lost race if the order was cancelled instead", async () => {
    maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: ID,
          status: "pending",
          payment_status: "claimed",
          total_cents: 800,
        },
      })
      .mockResolvedValueOnce({
        data: { status: "cancelled", payment_status: "confirmed" },
      });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed -- please refresh.",
    });
  });

  it("reports a failure when paykit's lookup fails", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({ success: false, error: "Failed to confirm payment" });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit's confirm call fails", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "pending",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    confirmCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await confirmPaymentAndStart(ID);
    expect(res).toEqual({ success: false, error: "Failed to confirm payment" });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await confirmPaymentAndStart("not-a-uuid");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe("revertPaymentAndStart", () => {
  it("reverts status only, leaving payment_status confirmed (paykit's confirm can't be undone)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "confirmed" },
    });
    const res = await revertPaymentAndStart(ID, "claimed");
    expect(res).toEqual({ success: true, status: "pending" });
    expect(update).toHaveBeenCalledWith({ status: "pending" });
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "confirmed" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await revertPaymentAndStart(ID, "claimed");
    expect(res).toEqual({
      success: false,
      error: "Order changed -- please refresh.",
    });
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await revertPaymentAndStart("not-a-uuid", "claimed");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe("declinePaymentClaim", () => {
  const claimed = {
    data: {
      id: ID,
      status: "preparing",
      payment_status: "claimed",
      total_cents: 800,
    },
  };

  it("unclaims in paykit and mirrors the order back to unpaid", async () => {
    maybeSingle.mockResolvedValue(claimed);
    unclaimCheckoutMock.mockResolvedValue({
      ok: true,
      data: { status: "pending" },
    });
    expect(await declinePaymentClaim(ID)).toEqual({ success: true });
    expect(unclaimCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({ payment_status: "pending" });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decline_order_payment" }),
    );
  });

  it("does not mirror a revert paykit refused because the payment was confirmed", async () => {
    maybeSingle.mockResolvedValue(claimed);
    unclaimCheckoutMock.mockResolvedValue({
      ok: true,
      data: { status: "confirmed" },
    });
    expect(await declinePaymentClaim(ID)).toEqual({
      success: false,
      error: "This payment was already confirmed",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("fails without a local write when paykit errors", async () => {
    maybeSingle.mockResolvedValue(claimed);
    unclaimCheckoutMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: "boom",
    });
    expect(await declinePaymentClaim(ID)).toEqual({
      success: false,
      error: "Failed to decline payment",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a transaction that belongs to another vendor", async () => {
    maybeSingle.mockResolvedValue(claimed);
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: true,
      data: {
        transactionId: "tx1",
        status: "claimed",
        amountCents: 800,
        orderRef: ID,
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: null,
        vendorId: "v2",
      },
    });
    expect((await declinePaymentClaim(ID)).success).toBe(false);
    expect(unclaimCheckoutMock).not.toHaveBeenCalled();
  });

  it("is a no-op success when the claim is already gone", async () => {
    maybeSingle.mockResolvedValue({
      data: { ...claimed.data, payment_status: "pending" },
    });
    expect(await declinePaymentClaim(ID)).toEqual({ success: true });
    expect(unclaimCheckoutMock).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "not_required"])(
    "rejects an order whose payment is %s",
    async (payment_status) => {
      maybeSingle.mockResolvedValue({
        data: { ...claimed.data, payment_status },
      });
      expect((await declinePaymentClaim(ID)).success).toBe(false);
      expect(unclaimCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a malformed id before any lookup", async () => {
    expect((await declinePaymentClaim("nope")).success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe("confirmOrderPayment", () => {
  it.each(["pending", "claimed"])(
    "does not confirm locally when Paykit returns %s",
    async (status) => {
      maybeSingle.mockResolvedValue({
        data: {
          id: ID,
          status: "ready",
          payment_status: "claimed",
          total_cents: 800,
        },
      });
      confirmCheckoutMock.mockResolvedValue({ ok: true, data: { status } });
      expect(await confirmOrderPayment(ID)).toEqual({
        success: false,
        error: "Failed to confirm payment",
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it("confirms a claimed order via paykit and mirrors paid_at locally", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: true });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ID);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
    expect(update).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: expect.any(String),
    });
  });

  it("confirms an order whose vendor changed payment details after checkout", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Payment configuration changed since checkout creation",
    });
    expect(await confirmOrderPayment(ID)).toEqual({ success: true });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ID);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
  });

  it("refuses to confirm a transaction that belongs to another vendor", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: true,
      data: {
        transactionId: "tx1",
        status: "claimed",
        amountCents: 800,
        orderRef: ID,
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: null,
        vendorId: "v2",
      },
    });
    expect(await confirmOrderPayment(ID)).toEqual({
      success: false,
      error: "Failed to confirm payment",
    });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("creates the checkout when paykit has none for this order", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "pending",
        total_cents: 800,
        created_at: "2026-10-14T01:15:00.000Z",
      },
    });
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
    });
    expect(await confirmOrderPayment(ID)).toEqual({ success: true });
    expect(createCheckoutMock).toHaveBeenCalledWith({
      vendorId: "v1",
      amountCents: 800,
      orderRef: ID,
      expiresAt: "2026-10-14T01:45:00.000Z",
    });
    expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
  });

  it("refuses to confirm when paykit's amount differs from the order's", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 900,
      },
    });
    expect(await confirmOrderPayment(ID)).toEqual({
      success: false,
      error: "Failed to confirm payment",
    });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("is idempotent when already confirmed (no paykit call, no write)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "confirmed",
        total_cents: 800,
      },
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: true });
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that doesn't take payment", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "not_required",
        total_cents: 800,
      },
    });
    const res = await confirmOrderPayment(ID);
    expect(res.success).toBe(false);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit's lookup fails", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: false, error: "Failed to confirm payment" });
    expect(confirmCheckoutMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failure when paykit's confirm call fails", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "claimed",
        total_cents: 800,
      },
    });
    confirmCheckoutMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Upstream unavailable",
    });
    const res = await confirmOrderPayment(ID);
    expect(res).toEqual({ success: false, error: "Failed to confirm payment" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("cancelOrder", () => {
  it("cancels a live order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "pending" },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
  });

  it("rejects a terminal order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await cancelOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a paid (confirmed-payment) live order — no refund rail", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "confirmed" },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Paid orders can't be cancelled. Refund the customer directly.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order advanced concurrently (0 rows)", async () => {
    // A cancellable (non-confirmed-payment) order that reaches the guarded
    // UPDATE, which then matches nothing because it moved concurrently.
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "ready", payment_status: "claimed" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed. Please refresh.",
    });
  });

  it("allows cancelling an order the auto-clear sweep completed before the vendor could", async () => {
    // sweepReadyOrders beat the vendor's own cancel tap to it -- this is the
    // one exception to "terminal orders can't be cancelled", since the sweep
    // isn't a deliberate vendor decision the way a manual "Mark Picked Up" is.
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "pending",
        auto_completed: true,
      },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      status: "cancelled",
      auto_completed: false,
      completed_at: null,
    });
  });

  it("still rejects a manually-completed order (auto_completed false)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "pending",
        auto_completed: false,
      },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({ success: false, error: "Order is already closed" });
    expect(update).not.toHaveBeenCalled();
  });

  it("still rejects an auto-completed order once payment is confirmed", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "confirmed",
        auto_completed: true,
      },
    });
    const res = await cancelOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Paid orders can't be cancelled. Refund the customer directly.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("bumpOrder", () => {
  it("bumps a live order to the front of its status lane", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    const res = await bumpOrder(ID);
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      priority_bumped_at: expect.any(String),
    });
  });

  it("rejects a terminal order", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "completed", payment_status: "confirmed" },
    });
    const res = await bumpOrder(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id before touching the DB", async () => {
    const res = await bumpOrder("not-a-uuid");
    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, status: "preparing", payment_status: "not_required" },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await bumpOrder(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed. Please refresh.",
    });
  });
});

describe("restoreAutoCompleted", () => {
  it("restores an auto-cleared order back to ready", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({ success: true, status: "ready" });
    expect(update).toHaveBeenCalledWith({
      status: "ready",
      ready_at: expect.any(String),
      completed_at: null,
      auto_completed: false,
    });
  });

  it("rejects an order the vendor completed manually", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an order that isn't completed at all", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "ready",
        payment_status: "not_required",
        auto_completed: false,
      },
    });
    const res = await restoreAutoCompleted(ID);
    expect(res.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a refresh when the order changed concurrently (0 rows)", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: ID,
        status: "completed",
        payment_status: "not_required",
        auto_completed: true,
      },
    });
    updateSelect.mockResolvedValue({ data: [], error: null });
    const res = await restoreAutoCompleted(ID);
    expect(res).toEqual({
      success: false,
      error: "Order changed. Please refresh.",
    });
  });
});

describe("sweepReadyOrders", () => {
  it("sweeps ready orders older than the vendor's configured minutes", async () => {
    sweepSelect.mockResolvedValue({ data: [{ id: ID }], error: null });
    await sweepReadyOrders();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", auto_completed: true }),
    );
    expect(sweepLt).toHaveBeenCalledWith("ready_at", expect.any(String));
  });

  it("records an order_status_events row for each swept order, but no admin_audit entry", async () => {
    const OTHER = "00000000-0000-4000-8000-000000000002";
    sweepSelect.mockResolvedValue({
      data: [{ id: ID }, { id: OTHER }],
      error: null,
    });
    await sweepReadyOrders();
    expect(recordOrderStatusEventMock).toHaveBeenCalledTimes(2);
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith({
      order_id: ID,
      from_status: "ready",
      to_status: "completed",
      actor: "v1",
    });
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith({
      order_id: OTHER,
      from_status: "ready",
      to_status: "completed",
      actor: "v1",
    });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("records nothing when no order was old enough to sweep", async () => {
    sweepSelect.mockResolvedValue({ data: [], error: null });
    await sweepReadyOrders();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("logs and stops without recording anything when the sweep update errors", async () => {
    sweepSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    await sweepReadyOrders();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("does nothing when the vendor has disabled the sweep (null)", async () => {
    vendorSingle.mockResolvedValue({
      data: {
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 4,
          daily_order_number_reset: false,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
    });
    await sweepReadyOrders();
    expect(sweepLt).not.toHaveBeenCalled();
  });

  it("does nothing when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    await sweepReadyOrders();
    expect(vendorSingle).not.toHaveBeenCalled();
  });
});

describe("sweepAbandonedPayments", () => {
  it("cancels a pending-payment qr order older than 30 minutes", async () => {
    sweepSelect.mockResolvedValue({ data: [{ id: ID }], error: null });
    await sweepAbandonedPayments();
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(sweepLt).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("filters on payment_status=pending, source=qr, status=pending", async () => {
    sweepSelect.mockResolvedValue({ data: [], error: null });
    await sweepAbandonedPayments();
    // Verify the filter chain: .eq("payment_status", "pending").eq("source", "qr").eq("status", "pending").lt("created_at", cutoff)
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(sweepEqMock).toHaveBeenCalledWith("payment_status", "pending");
    expect(sweepEqMock).toHaveBeenCalledWith("source", "qr");
    expect(sweepEqMock).toHaveBeenCalledWith("status", "pending");
    expect(sweepLt).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("records an order_status_events row for each cancelled order, but no admin_audit entry", async () => {
    const OTHER = "00000000-0000-4000-8000-000000000002";
    sweepSelect.mockResolvedValue({
      data: [{ id: ID }, { id: OTHER }],
      error: null,
    });
    await sweepAbandonedPayments();
    expect(recordOrderStatusEventMock).toHaveBeenCalledTimes(2);
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith({
      order_id: ID,
      from_status: "pending",
      to_status: "cancelled",
      actor: "v1",
    });
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith({
      order_id: OTHER,
      from_status: "pending",
      to_status: "cancelled",
      actor: "v1",
    });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("records nothing when no order was old enough to sweep", async () => {
    sweepSelect.mockResolvedValue({ data: [], error: null });
    await sweepAbandonedPayments();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("logs and stops without recording anything when the sweep update errors", async () => {
    sweepSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    await sweepAbandonedPayments();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("does nothing when not signed in", async () => {
    getUserMock.mockResolvedValue(null);
    await sweepAbandonedPayments();
    expect(update).not.toHaveBeenCalled();
  });
});
