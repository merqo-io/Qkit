import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizePaidOrder, writePaidMirror } from "./finalize-paid-order";

const {
  calls,
  filters,
  rpcMock,
  updateMock,
  selectMock,
  proofOnlyResult,
  rateLimitMock,
  alertMock,
  printMock,
  createServiceClientMock,
} = vi.hoisted(() => {
  const calls: string[] = [];
  const filters: unknown[][] = [];
  const selectMock = vi.fn();
  const proofOnlyResult = {
    value: { error: null as { message: string } | null },
  };
  const updateMock = vi.fn((..._patch: unknown[]) => {
    calls.push("mirror");
    const node = {
      eq: (...args: unknown[]) => {
        filters.push(["eq", ...args]);
        return node;
      },
      neq: (...args: unknown[]) => {
        filters.push(["neq", ...args]);
        return node;
      },
      in: (...args: unknown[]) => {
        filters.push(["in", ...args]);
        return node;
      },
      or: (...args: unknown[]) => {
        filters.push(["or", ...args]);
        return node;
      },
      select: selectMock,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(proofOnlyResult.value).then(resolve),
    };
    return node;
  });
  const rpcMock = vi.fn();
  const client = { rpc: rpcMock, from: () => ({ update: updateMock }) };
  return {
    calls,
    filters,
    rpcMock,
    updateMock,
    selectMock,
    proofOnlyResult,
    rateLimitMock: vi.fn(),
    alertMock: vi.fn(),
    printMock: vi.fn(),
    createServiceClientMock: vi.fn(() => Promise.resolve(client)),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyVendorTelegram: alertMock,
  notifyPrintkit: printMock,
}));

const ORDER = { id: "o1", boothId: "b1" };
const PROOF = { path: "v1/o1.webp", hash: "abc123" };
let errorSpy: ReturnType<typeof vi.spyOn>;

// One alert per order: the first ask is allowed, every later one is not.
function alertOncePerOrder() {
  const seen = new Set<string>();
  rateLimitMock.mockImplementation((key: string) => {
    const first = !seen.has(key);
    seen.add(key);
    return Promise.resolve(first);
  });
}

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  proofOnlyResult.value = { error: null };
  updateMock.mockClear();
  selectMock
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  rpcMock.mockReset().mockImplementation(() => {
    calls.push("assign");
    return Promise.resolve({ data: "0007", error: null });
  });
  rateLimitMock.mockReset();
  alertOncePerOrder();
  alertMock.mockReset().mockImplementation(() => {
    calls.push("alert");
    return Promise.resolve();
  });
  printMock.mockReset().mockImplementation(() => {
    calls.push("print");
    return Promise.resolve();
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  vi.useRealTimers();
});

describe("finalizePaidOrder", () => {
  it("assigns the number, then notifies, then writes the mirror last", async () => {
    const result = await finalizePaidOrder(ORDER, {
      status: "claimed",
      proof: PROOF,
    });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
    expect(calls).toEqual(["assign", "alert", "print", "mirror"]);
    expect(rpcMock).toHaveBeenCalledWith("assign_order_number", {
      p_order_id: "o1",
    });
    expect(alertMock).toHaveBeenCalledWith("b1", "0007");
    expect(printMock).toHaveBeenCalledWith("b1", "0007");
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "claimed",
      payment_proof_path: "v1/o1.webp",
      payment_proof_hash: "abc123",
    });
  });

  it("asks for the alert under a per-order, once-an-hour key", async () => {
    await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(rateLimitMock).toHaveBeenCalledWith("paid-order-alert:o1", 1, 3_600);
  });

  it("run twice in a row: same number, one vendor alert, the print request repeated", async () => {
    const first = await finalizePaidOrder(ORDER, {
      status: "claimed",
      proof: PROOF,
    });
    const second = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(first).toEqual({ ok: true, orderNumber: "0007" });
    expect(second).toEqual({ ok: true, orderNumber: "0007" });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(printMock).toHaveBeenCalledTimes(2);
  });

  it("run twice at the same moment: one vendor alert", async () => {
    const [a, b] = await Promise.all([
      finalizePaidOrder(ORDER, { status: "claimed", proof: PROOF }),
      finalizePaidOrder(ORDER, { status: "claimed" }),
    ]);
    expect(a).toEqual({ ok: true, orderNumber: "0007" });
    expect(b).toEqual({ ok: true, orderNumber: "0007" });
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(printMock).toHaveBeenCalledTimes(2);
  });

  it("still sends the print request and writes the mirror when the alert was already sent", async () => {
    rateLimitMock.mockReset().mockResolvedValue(false);
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
    expect(alertMock).not.toHaveBeenCalled();
    expect(calls).toEqual(["assign", "print", "mirror"]);
  });

  it.each([
    ["an RPC error", { data: null, error: { message: "boom" } }],
    ["no number", { data: null, error: null }],
  ])("stops on %s: no notification, no mirror write", async (_, answer) => {
    rpcMock.mockReset().mockResolvedValue(answer);
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: false });
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(printMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("still reports success when the mirror write fails", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
  });
});

describe("writePaidMirror", () => {
  async function write(payment: Parameters<typeof writePaidMirror>[2]) {
    const supabase = await createServiceClientMock();
    await writePaidMirror(
      supabase as unknown as Parameters<typeof writePaidMirror>[0],
      "o1",
      payment,
    );
  }

  it("claimed, no screenshot: only a pending order moves", async () => {
    await write({ status: "claimed" });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ payment_status: "claimed" });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["in", "payment_status", ["pending"]],
    ]);
  });

  it("claimed with a screenshot: also lands on an order the callback already marked claimed", async () => {
    await write({ status: "claimed", proof: PROOF });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["in", "payment_status", ["pending", "claimed"]],
    ]);
  });

  it("confirmed: sets paid_at to paykit's confirmed_at and never touches a not_required order", async () => {
    await write({ status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" });
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: "2026-08-11T00:00:05Z",
    });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["neq", "payment_status", "not_required"],
      ["or", "payment_status.neq.confirmed,paid_at.is.null"],
    ]);
  });

  it("confirmed without a confirmed_at: uses the current time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T03:04:05.000Z"));
    await write({ status: "confirmed", confirmedAt: null });
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: "2026-10-12T03:04:05.000Z",
    });
  });

  it("keeps the screenshot when the order is already further along", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    await write({ status: "claimed", proof: PROOF });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenLastCalledWith({
      payment_proof_path: "v1/o1.webp",
      payment_proof_hash: "abc123",
    });
    expect(filters.at(-1)).toEqual(["eq", "id", "o1"]);
  });

  it("makes no second write when nothing matched and there is no screenshot", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    await write({ status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("makes no second write when the first one failed", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await write({ status: "claimed", proof: PROOF });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs, and does not throw, when the screenshot-only write fails", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    proofOnlyResult.value = { error: { message: "boom" } };
    await expect(
      write({ status: "claimed", proof: PROOF }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
