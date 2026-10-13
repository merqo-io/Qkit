import { describe, expect, it, vi, beforeEach } from "vitest";
import { getOrderPaymentProof } from "./payment-evidence-actions";

// The session client: `orders` is read twice at most (the order under review,
// then the order a duplicate points at), `booths` once. Each read is
// select().eq(column, value).maybeSingle(), answered per table and id.
const {
  getUserMock,
  orderRow,
  boothRow,
  readStep,
  createServerClientMock,
  storageFromMock,
  lookupMock,
  evidenceMock,
  legacyUrlMock,
  legacyDuplicateMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  orderRow: vi.fn(),
  boothRow: vi.fn(),
  readStep: vi.fn(),
  createServerClientMock: vi.fn(),
  storageFromMock: vi.fn(),
  lookupMock: vi.fn(),
  evidenceMock: vi.fn(),
  legacyUrlMock: vi.fn(),
  legacyDuplicateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/lib/paykit/client", () => ({
  getCheckoutByOrderRef: lookupMock,
  getCheckoutEvidence: evidenceMock,
}));
vi.mock("./proof-actions", () => ({
  getProofPhotoUrl: legacyUrlMock,
  findDuplicateProofOrder: legacyDuplicateMock,
}));

const VENDOR = "00000000-0000-4000-8000-00000000000a";
const OTHER_VENDOR = "00000000-0000-4000-8000-00000000000b";
const ORDER = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222";
const BOOTH = "33333333-3333-4333-8333-333333333333";

function sessionClient() {
  return {
    auth: { getUser: getUserMock },
    storage: { from: storageFromMock },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          readStep(table, columns, column, value);
          return {
            maybeSingle: () =>
              table === "booths" ? boothRow(value) : orderRow(value),
          };
        },
      }),
    }),
  };
}

function evidence(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      proofUrl: "https://storage.example/signed",
      duplicateOf: null,
      amountMatch: null,
      ...over,
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  readStep.mockReset();
  storageFromMock.mockReset();
  createServerClientMock.mockReset().mockResolvedValue(sessionClient());
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: VENDOR } } });
  orderRow.mockReset().mockImplementation((id: string) =>
    Promise.resolve({
      data:
        id === ORDER
          ? { id: ORDER, booth_id: BOOTH, payment_proof_path: null }
          : null,
    }),
  );
  boothRow.mockReset().mockResolvedValue({ data: { vendor_id: VENDOR } });
  lookupMock.mockReset().mockResolvedValue({
    ok: true,
    data: { transactionId: "tx1", vendorId: VENDOR, status: "claimed" },
  });
  evidenceMock.mockReset().mockResolvedValue(evidence());
  legacyUrlMock.mockReset().mockResolvedValue("https://legacy.example/signed");
  legacyDuplicateMock.mockReset().mockResolvedValue(null);
});

function expectPaykitNotAsked() {
  expect(lookupMock).not.toHaveBeenCalled();
  expect(evidenceMock).not.toHaveBeenCalled();
}

describe("getOrderPaymentProof: who may read", () => {
  it("refuses an id that is not a uuid, without creating a client", async () => {
    expect(await getOrderPaymentProof("not-a-uuid")).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in, without reading the order", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await getOrderPaymentProof(ORDER)).toBeNull();
    expect(readStep).not.toHaveBeenCalled();
    expectPaykitNotAsked();
  });

  it("refuses an order RLS does not return", async () => {
    orderRow.mockResolvedValue({ data: null });
    expect(await getOrderPaymentProof(ORDER)).toBeNull();
    expectPaykitNotAsked();
    expect(legacyUrlMock).not.toHaveBeenCalled();
  });

  it("refuses an order whose booth RLS does not return", async () => {
    boothRow.mockResolvedValue({ data: null });
    expect(await getOrderPaymentProof(ORDER)).toBeNull();
    expectPaykitNotAsked();
  });

  it.each([
    ["a paykit screenshot", null],
    ["a legacy screenshot", "other-vendor/order.webp"],
  ])(
    "refuses an admin reading another vendor's order with %s",
    async (_name, payment_proof_path) => {
      orderRow.mockResolvedValue({
        data: { id: ORDER, booth_id: BOOTH, payment_proof_path },
      });
      boothRow.mockResolvedValue({ data: { vendor_id: OTHER_VENDOR } });
      expect(await getOrderPaymentProof(ORDER)).toBeNull();
      expectPaykitNotAsked();
      expect(legacyUrlMock).not.toHaveBeenCalled();
    },
  );

  it("refuses when paykit's transaction belongs to another vendor", async () => {
    lookupMock.mockResolvedValue({
      ok: true,
      data: { transactionId: "tx1", vendorId: OTHER_VENDOR },
    });
    expect(await getOrderPaymentProof(ORDER)).toBeNull();
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it("reads the order and its booth with the session client, never storage", async () => {
    await getOrderPaymentProof(ORDER);
    expect(readStep).toHaveBeenCalledWith(
      "orders",
      "id, booth_id, payment_proof_path",
      "id",
      ORDER,
    );
    expect(readStep).toHaveBeenCalledWith("booths", "vendor_id", "id", BOOTH);
    expect(storageFromMock).not.toHaveBeenCalled();
  });
});

describe("getOrderPaymentProof: an order claimed before screenshots moved", () => {
  beforeEach(() => {
    orderRow.mockResolvedValue({
      data: {
        id: ORDER,
        booth_id: BOOTH,
        payment_proof_path: `${VENDOR}/${ORDER}.webp`,
      },
    });
  });

  it("reads the photo and the duplicate from qkit, and does not ask paykit", async () => {
    legacyDuplicateMock.mockResolvedValue("0031");
    expect(await getOrderPaymentProof(ORDER)).toEqual({
      url: "https://legacy.example/signed",
      duplicateOrderNumber: "0031",
      duplicateElsewhere: false,
      amountMatch: null,
    });
    expect(legacyUrlMock).toHaveBeenCalledWith(ORDER);
    expect(legacyDuplicateMock).toHaveBeenCalledWith(ORDER);
    expectPaykitNotAsked();
  });

  it("answers with no photo when the old bucket cannot sign it", async () => {
    legacyUrlMock.mockResolvedValue(null);
    expect(await getOrderPaymentProof(ORDER)).toEqual({
      url: null,
      duplicateOrderNumber: null,
      duplicateElsewhere: false,
      amountMatch: null,
    });
  });
});

describe("getOrderPaymentProof: from paykit", () => {
  it("returns paykit's link and signals", async () => {
    evidenceMock.mockResolvedValue(evidence({ amountMatch: true }));
    expect(await getOrderPaymentProof(ORDER)).toEqual({
      url: "https://storage.example/signed",
      duplicateOrderNumber: null,
      duplicateElsewhere: false,
      amountMatch: true,
    });
    expect(lookupMock).toHaveBeenCalledWith(ORDER);
    expect(evidenceMock).toHaveBeenCalledWith("tx1");
    expect(legacyUrlMock).not.toHaveBeenCalled();
  });

  it("names the other order when the duplicate is a qkit order this vendor can read", async () => {
    evidenceMock.mockResolvedValue(
      evidence({ duplicateOf: { orderRef: OTHER_ORDER, kitSlug: "qkit" } }),
    );
    orderRow.mockImplementation((id: string) =>
      Promise.resolve({
        data:
          id === ORDER
            ? { id: ORDER, booth_id: BOOTH, payment_proof_path: null }
            : { order_number: "0031" },
      }),
    );
    const result = await getOrderPaymentProof(ORDER);
    expect(result).toMatchObject({
      duplicateOrderNumber: "0031",
      duplicateElsewhere: false,
    });
    expect(readStep).toHaveBeenCalledWith(
      "orders",
      "order_number",
      "id",
      OTHER_ORDER,
    );
  });

  it.each([
    [
      "a qkit order RLS does not return",
      { orderRef: OTHER_ORDER, kitSlug: "qkit" },
    ],
    ["a payment in another kit", { orderRef: "loop-77", kitSlug: "loopkit" }],
    [
      "a qkit reference that is not an order id",
      { orderRef: "not-a-uuid", kitSlug: "qkit" },
    ],
  ])(
    "reports %s as a duplicate without a number",
    async (_name, duplicateOf) => {
      evidenceMock.mockResolvedValue(evidence({ duplicateOf }));
      expect(await getOrderPaymentProof(ORDER)).toMatchObject({
        url: "https://storage.example/signed",
        duplicateOrderNumber: null,
        duplicateElsewhere: true,
      });
    },
  );

  it("does not look up an order for a duplicate in another kit", async () => {
    evidenceMock.mockResolvedValue(
      evidence({ duplicateOf: { orderRef: OTHER_ORDER, kitSlug: "loopkit" } }),
    );
    await getOrderPaymentProof(ORDER);
    expect(readStep).not.toHaveBeenCalledWith(
      "orders",
      "order_number",
      "id",
      OTHER_ORDER,
    );
  });

  it.each([
    ["has no transaction for the order", 404],
    ["cannot be reached", null],
    ["answers an error", 503],
  ])("answers with no photo when paykit %s", async (_name, status) => {
    lookupMock.mockResolvedValue({ ok: false, status, error: "x" });
    expect(await getOrderPaymentProof(ORDER)).toEqual({
      url: null,
      duplicateOrderNumber: null,
      duplicateElsewhere: false,
      amountMatch: null,
    });
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it("answers with no photo when the evidence call fails", async () => {
    evidenceMock.mockResolvedValue({ ok: false, status: 503, error: "x" });
    expect(await getOrderPaymentProof(ORDER)).toEqual({
      url: null,
      duplicateOrderNumber: null,
      duplicateElsewhere: false,
      amountMatch: null,
    });
  });

  it("passes on an answer with no screenshot", async () => {
    evidenceMock.mockResolvedValue(evidence({ proofUrl: null }));
    expect(await getOrderPaymentProof(ORDER)).toMatchObject({ url: null });
  });
});
