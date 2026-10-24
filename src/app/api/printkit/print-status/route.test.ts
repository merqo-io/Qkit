const ATTEMPT_AT = "2026-10-08T01:00:00.123456Z";
const orMock = vi.fn();
const existsMock = vi.fn();
import { describe, it, expect, vi, beforeEach } from "vitest";

const printkitCallbackBearerOkMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/qkit-printkit-auth", () => ({
  printkitCallbackBearerOk: (...args: unknown[]) =>
    printkitCallbackBearerOkMock(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        update: updateMock,
        select: () => ({ eq: () => ({ maybeSingle: existsMock }) }),
      }),
      rpc: rpcMock,
    }),
}));

import { POST } from "./route";

function requestWith(body: unknown) {
  return new Request("https://qkit.test/api/printkit/print-status", {
    method: "POST",
    headers: {
      authorization: "Bearer secret",
      "content-type": "application/json",
    },
    body: JSON.stringify(
      typeof body === "object" && body !== null
        ? { attempt_at: ATTEMPT_AT, ...body }
        : body,
    ),
  });
}

const ORDER_ID = "11111111-1111-1111-8111-111111111111";
const OTHER_ORDER_ID = "22222222-2222-2222-8222-222222222222";

beforeEach(() => {
  printkitCallbackBearerOkMock.mockReset();
  updateMock.mockReset();
  eqMock.mockReset();
  selectMock.mockReset();
  maybeSingleMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: true, error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ or: orMock });
  orMock.mockReset().mockReturnValue({ select: selectMock });
  existsMock
    .mockReset()
    .mockResolvedValue({ data: { id: ORDER_ID }, error: null });
  selectMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  maybeSingleMock.mockResolvedValue({ data: { id: ORDER_ID }, error: null });
});

describe("POST /api/printkit/print-status", () => {
  it("returns 401 when the bearer secret doesn't verify", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(false);

    const res = await POST(
      requestWith({ order_id: ORDER_ID, status: "failed" }),
    );

    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter rejects the call", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    rpcMock.mockResolvedValue({ data: false, error: null });

    const res = await POST(
      requestWith({ order_id: ORDER_ID, status: "failed" }),
    );

    expect(res.status).toBe(429);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each(["bogus", "queued", "sent"])(
    "returns 400 for unsupported callback status %s",
    async (status) => {
      printkitCallbackBearerOkMock.mockReturnValue(true);

      const res = await POST(requestWith({ order_id: ORDER_ID, status }));

      expect(res.status).toBe(400);
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it("returns 400 on a non-UUID order_id, not a 503", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ order_id: "order-1", status: "failed" }),
    );

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates orders.print_status and returns 200", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ order_id: ORDER_ID, status: "failed" }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "failed" }),
    );
    expect(eqMock).toHaveBeenCalledWith("id", ORDER_ID);
  });

  it("returns 503 on a database error", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    const res = await POST(
      requestWith({ order_id: ORDER_ID, status: "printed" }),
    );

    expect(res.status).toBe(503);
  });

  it("returns 404 when no order matches order_id (silent no-op prevention)", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    existsMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(
      requestWith({ order_id: ORDER_ID, status: "printed" }),
    );

    expect(res.status).toBe(404);
  });

  it("accepts source_ref as the order's id", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ source_ref: ORDER_ID, status: "printed" }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      print_status: "printed",
      print_status_updated_at: ATTEMPT_AT,
    });
    expect(eqMock).toHaveBeenCalledWith("id", ORDER_ID);
  });

  it("accepts a body that carries both names for the same order", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({
        source_ref: ORDER_ID,
        order_id: ORDER_ID,
        status: "failed",
      }),
    );

    expect(res.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith("id", ORDER_ID);
  });

  it("treats the two names as one order when only their letter case differs", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    const upper = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

    const res = await POST(
      requestWith({
        source_ref: upper,
        order_id: upper.toLowerCase(),
        status: "failed",
      }),
    );

    expect(res.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith("id", upper);
  });

  it("returns 400 when source_ref and order_id name different orders", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({
        source_ref: ORDER_ID,
        order_id: OTHER_ORDER_ID,
        status: "failed",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "source_ref and order_id disagree",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body names no order at all", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(requestWith({ status: "failed" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "source_ref is required" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on a non-UUID source_ref", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);

    const res = await POST(
      requestWith({ source_ref: "order-1", status: "failed" }),
    );

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no order matches source_ref", async () => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    existsMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(
      requestWith({ source_ref: ORDER_ID, status: "printed" }),
    );

    expect(res.status).toBe(404);
  });
});

it("acknowledges a stale terminal callback without rewriting the order", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  existsMock.mockResolvedValue({
    data: { id: "11111111-1111-1111-8111-111111111111" },
    error: null,
  });
  const response = await POST(
    requestWith({
      order_id: "11111111-1111-1111-8111-111111111111",
      status: "failed",
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, stale: true });
  expect(orMock).toHaveBeenCalledWith(
    expect.stringContaining("print_status.neq.printed"),
  );
});
it.each([
  undefined,
  "2026-10-08T01:00:00Z",
  "2026-10-08T01:00:00.123456Z),print_status.eq.failed",
])(
  "rejects missing or noncanonical attempt identity %j",
  async (attempt_at) => {
    printkitCallbackBearerOkMock.mockReturnValue(true);
    updateMock.mockClear();
    const response = await POST(
      requestWith({
        order_id: "11111111-1111-1111-8111-111111111111",
        status: "failed",
        attempt_at,
      }),
    );
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  },
);
