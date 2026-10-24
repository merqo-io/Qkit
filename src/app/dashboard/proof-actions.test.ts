import { describe, expect, it, vi, beforeEach } from "vitest";
import { getProofPhotoUrl, findDuplicateProofOrder } from "./proof-actions";

// Two independent read chains hang off `from("orders")`: the row lookup
// (select→eq→maybeSingle, keyed per test to the order under test) and the
// duplicate-hash lookup (select→eq→neq→limit→maybeSingle). `createSignedUrl`
// is its own mock on the `storage.from("payment-proofs")` chain.
const { orderSingle, duplicateSingle, createSignedUrl, queryStep } = vi.hoisted(
  () => ({
    orderSingle: vi.fn(),
    duplicateSingle: vi.fn(),
    createSignedUrl: vi.fn(),
    queryStep: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            queryStep("eq", column, value);
            return {
              maybeSingle: orderSingle,
              neq: (column: string, value: unknown) => {
                queryStep("neq", column, value);
                return {
                  limit: (count: number) => {
                    queryStep("limit", count);
                    return { maybeSingle: duplicateSingle };
                  },
                };
              },
            };
          },
        }),
      }),
      storage: {
        from: (bucket: string) => {
          queryStep("bucket", bucket);
          return { createSignedUrl };
        },
      },
    }),
}));

beforeEach(() => {
  orderSingle.mockReset();
  duplicateSingle.mockReset();
  createSignedUrl.mockReset();
  queryStep.mockReset();
});

describe("getProofPhotoUrl", () => {
  it("returns a signed URL for the caller's own order", async () => {
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_path: "vendor-1/order-1.png" },
      error: null,
    });
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://signed.example/payment-proofs/..." },
      error: null,
    });
    const url = await getProofPhotoUrl("11111111-1111-1111-8111-111111111111");
    expect(url).toBe("https://signed.example/payment-proofs/...");
    expect(queryStep).toHaveBeenCalledWith(
      "eq",
      "id",
      "11111111-1111-1111-8111-111111111111",
    );
    expect(queryStep).toHaveBeenCalledWith("bucket", "payment-proofs");
    expect(createSignedUrl).toHaveBeenCalledWith("vendor-1/order-1.png", 300);
  });

  it("returns null for an order with no uploaded proof", async () => {
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_path: null },
      error: null,
    });
    const url = await getProofPhotoUrl("22222222-2222-2222-8222-222222222222");
    expect(url).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns null for a malformed order id, without querying", async () => {
    const url = await getProofPhotoUrl("not-a-uuid");
    expect(url).toBeNull();
    expect(orderSingle).not.toHaveBeenCalled();
  });

  it("returns null when signing the URL fails", async () => {
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_path: "vendor-1/order-1.png" },
      error: null,
    });
    createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const url = await getProofPhotoUrl("11111111-1111-1111-8111-111111111111");
    expect(url).toBeNull();
  });
});

describe("findDuplicateProofOrder", () => {
  it("returns the other order, with what names it on the board, when the hash matches", async () => {
    const match = {
      booth_id: "booth-1",
      order_number: "0031",
      created_at: "2026-10-14T02:00:00.000Z",
    };
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_hash: "abc123" },
      error: null,
    });
    duplicateSingle.mockResolvedValueOnce({ data: match, error: null });
    const other = await findDuplicateProofOrder(
      "11111111-1111-1111-8111-111111111111",
    );
    expect(other).toEqual(match);
    expect(queryStep).toHaveBeenCalledWith(
      "eq",
      "payment_proof_hash",
      "abc123",
    );
    expect(queryStep).toHaveBeenCalledWith(
      "neq",
      "id",
      "11111111-1111-1111-8111-111111111111",
    );
    expect(queryStep).toHaveBeenCalledWith("limit", 1);
  });

  it("returns null when no other order shares the hash", async () => {
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_hash: "abc123" },
      error: null,
    });
    duplicateSingle.mockResolvedValueOnce({ data: null, error: null });
    const other = await findDuplicateProofOrder(
      "22222222-2222-2222-8222-222222222222",
    );
    expect(other).toBeNull();
  });

  it("returns null when the order has no proof hash, without a lookup", async () => {
    orderSingle.mockResolvedValueOnce({
      data: { payment_proof_hash: null },
      error: null,
    });
    const other = await findDuplicateProofOrder(
      "33333333-3333-3333-8333-333333333333",
    );
    expect(other).toBeNull();
    expect(duplicateSingle).not.toHaveBeenCalled();
  });

  it("returns null for a malformed order id, without querying", async () => {
    const other = await findDuplicateProofOrder("not-a-uuid");
    expect(other).toBeNull();
    expect(orderSingle).not.toHaveBeenCalled();
  });
});
