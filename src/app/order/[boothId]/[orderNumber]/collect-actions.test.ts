import { describe, expect, it, vi, beforeEach } from "vitest";
import { confirmCollection } from "./collect-actions";

// Mock the service client. Two chains against `orders`:
//   select().eq().eq().eq().maybeSingle() (the order read, keyed on
//   booth_id/order_number/access_token)
//   update().eq().eq().select("id") (the guarded status flip, keyed on
//   id + status="ready")
const {
  createServiceClientMock,
  ordersMaybeSingle,
  boothMaybeSingle,
  readEqMock,
  update,
  writeSelect,
  rateLimitMock,
  clientIpMock,
  recordOrderStatusEventMock,
} = vi.hoisted(() => {
  const ordersMaybeSingle = vi.fn();
  const boothMaybeSingle = vi.fn();
  const readEqMock = vi.fn();
  const writeSelect = vi.fn();
  const update = vi.fn(() => ({
    eq: () => ({ eq: () => ({ select: writeSelect }) }),
  }));
  const ordersSelect = () => {
    const node = {
      eq: (...args: unknown[]) => {
        readEqMock(...args);
        return node;
      },
      maybeSingle: ordersMaybeSingle,
    };
    return node;
  };
  const boothSelect = () => ({
    eq: () => ({ maybeSingle: boothMaybeSingle }),
  });
  const from = (table: string) =>
    table === "booths"
      ? { select: boothSelect }
      : { select: ordersSelect, update };
  return {
    createServiceClientMock: vi.fn(() => Promise.resolve({ from })),
    ordersMaybeSingle,
    boothMaybeSingle,
    readEqMock,
    update,
    writeSelect,
    rateLimitMock: vi.fn(),
    clientIpMock: vi.fn(() => "1.2.3.4"),
    recordOrderStatusEventMock: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: clientIpMock,
}));
vi.mock("@/lib/audit", () => ({
  recordOrderStatusEvent: recordOrderStatusEventMock,
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({}) }));

const BOOTH = "00000000-0000-4000-8000-000000000001";
const ORDER = "0007";
const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  createServiceClientMock.mockClear();
  update.mockClear();
  readEqMock.mockClear();
  boothMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { pickup_scan_enabled: true } });
  ordersMaybeSingle.mockReset().mockResolvedValue({
    data: { id: "o1", status: "ready", payment_status: "claimed" },
  });
  writeSelect
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  rateLimitMock.mockReset().mockResolvedValue(true);
  clientIpMock.mockClear();
  recordOrderStatusEventMock.mockReset().mockResolvedValue(undefined);
});

describe("confirmCollection", () => {
  it("completes a ready order and logs a null-actor event", async () => {
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({ success: true, status: "completed" });
    expect(readEqMock.mock.calls).toEqual([
      ["booth_id", BOOTH],
      ["order_number", ORDER],
      ["access_token", TOKEN],
    ]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
      }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: expect.anything() }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ paid_at: expect.anything() }),
    );
    expect(recordOrderStatusEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: "o1",
        actor: null,
        from_status: "ready",
        to_status: "completed",
      }),
    );
  });

  it.each([
    ["off", { data: { pickup_scan_enabled: false } }],
    ["missing", { data: null }],
  ])("refuses when the booth switch is %s", async (_label, row) => {
    boothMaybeSingle.mockResolvedValue(row);
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({
      success: false,
      error: "Self-checkout pickup is off for this booth.",
    });
    expect(ordersMaybeSingle).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a not-ready order without erroring", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: { id: "o1", status: "preparing", payment_status: "pending" },
    });
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({ success: false, error: "Not ready yet." });
    expect(update).not.toHaveBeenCalled();
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("treats an already-completed order as already collected, not an error", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: { id: "o1", status: "completed", payment_status: "confirmed" },
    });
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({ success: false, error: "Already collected." });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid booth/order/token", async () => {
    expect(await confirmCollection("not-a-uuid", ORDER, TOKEN)).toEqual({
      success: false,
      error: "Invalid booth",
    });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid token as an invalid order, not a booth error", async () => {
    expect(await confirmCollection(BOOTH, ORDER, "not-a-uuid")).toEqual({
      success: false,
      error: "Invalid order",
    });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects a lookup that matches no order at all", async () => {
    ordersMaybeSingle.mockResolvedValue({ data: null });
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({ success: false, error: "Invalid order" });
    expect(update).not.toHaveBeenCalled();
  });

  it("rate-limits repeated attempts", async () => {
    rateLimitMock.mockResolvedValueOnce(false);
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({
      success: false,
      error: "Too many attempts -- wait a moment.",
    });
    expect(createServiceClientMock).toHaveBeenCalled();
  });

  it("reports a changed-order race rather than a false success", async () => {
    writeSelect.mockResolvedValue({ data: [], error: null });
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({
      success: false,
      error: "Order changed -- try scanning again.",
    });
    expect(recordOrderStatusEventMock).not.toHaveBeenCalled();
  });

  it("reports a generic failure and logs when the update errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await confirmCollection(BOOTH, ORDER, TOKEN);
    expect(result).toEqual({
      success: false,
      error: "Could not complete order. Try again.",
    });
    expect(errorSpy).toHaveBeenCalledWith("confirmCollection failed", "boom");
    errorSpy.mockRestore();
  });
});
