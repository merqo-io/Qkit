import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyPrintkit, notifyVendorTelegram } from "./notify";

const {
  boothsMaybeSingle,
  ordersMaybeSingle,
  updateMock,
  updateFilters,
  createPrintJobMock,
} = vi.hoisted(() => {
  const updateFilters: unknown[][] = [];
  const updateMock = vi.fn((..._patch: unknown[]) => {
    const node = {
      eq: (...args: unknown[]) => {
        updateFilters.push(args);
        return node;
      },
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    };
    return node;
  });
  return {
    boothsMaybeSingle: vi.fn(),
    ordersMaybeSingle: vi.fn(),
    updateMock,
    updateFilters,
    createPrintJobMock: vi.fn(),
  };
});

function readChain(maybeSingle: () => unknown) {
  const node = { eq: () => node, maybeSingle };
  return node;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) =>
        table === "booths"
          ? { select: () => readChain(boothsMaybeSingle) }
          : { select: () => readChain(ordersMaybeSingle), update: updateMock },
    }),
}));
vi.mock("@/lib/printkit/client", () => ({
  createPrintJob: createPrintJobMock,
}));
vi.mock("@/lib/daily-order-number", () => ({
  vendorFacingOrderNumber: () => Promise.resolve("007"),
}));
vi.mock("@/lib/merqo/customer-notify", () => ({ notifyVendor: vi.fn() }));

const BOOTH = "00000000-0000-4000-8000-000000000001";
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  updateMock.mockClear();
  updateFilters.length = 0;
  boothsMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1", print_enabled: true } });
  ordersMaybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "o1",
      customer_name: "Ann",
      status: "preparing",
      payment_status: "confirmed",
    },
  });
  createPrintJobMock
    .mockReset()
    .mockResolvedValue({ ok: true, data: { id: "job1" } });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("notifyPrintkit run more than once for one order", () => {
  it("marks the order queued after creating the job", async () => {
    await notifyPrintkit(BOOTH, "0007");
    expect(createPrintJobMock).toHaveBeenCalledWith({
      vendorId: "v1",
      orderId: "o1",
      boothId: BOOTH,
      customerName: "Ann",
      orderNumber: "007",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "queued" }),
    );
    expect(updateFilters).toEqual([
      ["id", "o1"],
      ["print_status", "not_required"],
    ]);
  });

  it("treats printkit's 409 as already queued: no error logged, guarded write still made", async () => {
    createPrintJobMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "queued" }),
    );
    expect(updateFilters).toContainEqual(["print_status", "not_required"]);
  });

  it.each([400, 500, null])(
    "logs and writes nothing when printkit fails with %s",
    async (status) => {
      createPrintJobMock.mockResolvedValue({
        ok: false,
        status,
        error: "Could not create print job.",
      });
      await notifyPrintkit(BOOTH, "0007");
      expect(errorSpy).toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it("creates no job for a booth that does not print", async () => {
    boothsMaybeSingle.mockResolvedValue({
      data: { vendor_id: "v1", print_enabled: false },
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(createPrintJobMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("failure logging never carries caller or remote text", () => {
  const FORGED = "x\nFORGED level=info msg=admin-login";

  function logged(): string {
    return errorSpy.mock.calls.flat().map(String).join(" ");
  }

  it("omits the booth id when the booth lookup finds nothing", async () => {
    boothsMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: FORGED },
    });
    await notifyPrintkit(FORGED, "0007");
    expect(errorSpy).toHaveBeenCalled();
    expect(logged()).not.toContain("FORGED");
  });

  it("omits the order number when the order lookup finds nothing", async () => {
    ordersMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: FORGED },
    });
    await notifyPrintkit(BOOTH, FORGED);
    expect(errorSpy).toHaveBeenCalled();
    expect(logged()).not.toContain("FORGED");
  });

  it("omits printkit's response text when job creation fails", async () => {
    createPrintJobMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: FORGED,
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(errorSpy).toHaveBeenCalled();
    expect(logged()).not.toContain("FORGED");
  });

  it("omits the database message when the print_status write fails", async () => {
    const failingUpdate = () => {
      const node = {
        eq: () => node,
        then: (resolve: (value: { error: { message: string } }) => unknown) =>
          Promise.resolve({ error: { message: FORGED } }).then(resolve),
      };
      return node;
    };
    updateMock.mockImplementationOnce(failingUpdate as never);
    await notifyPrintkit(BOOTH, "0007");
    expect(errorSpy).toHaveBeenCalled();
    expect(logged()).not.toContain("FORGED");
  });

  it("logs only the error name when notifyPrintkit throws", async () => {
    boothsMaybeSingle.mockRejectedValue(new TypeError(FORGED));
    await notifyPrintkit(BOOTH, "0007");
    expect(errorSpy).toHaveBeenCalledWith("notifyPrintkit failed", "TypeError");
    expect(logged()).not.toContain("FORGED");
  });

  it("logs only the error name when notifyVendorTelegram throws", async () => {
    boothsMaybeSingle.mockRejectedValue(new TypeError(FORGED));
    await notifyVendorTelegram(BOOTH, "0007");
    expect(errorSpy).toHaveBeenCalledWith(
      "notifyVendorTelegram failed",
      "TypeError",
    );
    expect(logged()).not.toContain("FORGED");
  });
});

describe("printing eligibility", () => {
  it.each([
    ["pending", "pending", false],
    ["preparing", "claimed", false],
    ["ready", "claimed", false],
    ["pending", "not_required", false],
    ["confirmed", "not_required", false],
    ["preparing", "not_required", true],
    ["pending", "confirmed", true],
    ["preparing", "confirmed", true],
    ["ready", "confirmed", true],
    ["cancelled", "confirmed", false],
    ["completed", "confirmed", false],
  ])("%s / %s prints: %s", async (status, payment_status, eligible) => {
    ordersMaybeSingle.mockResolvedValue({
      data: { id: "o1", customer_name: "Ann", status, payment_status },
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(createPrintJobMock).toHaveBeenCalledTimes(eligible ? 1 : 0);
  });
});
