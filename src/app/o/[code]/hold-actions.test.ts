import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const rateLimit = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimitStrict: (...args: unknown[]) => rateLimit(...args),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { holdCart, readAvailability } from "./hold-actions";

const BOOTH = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const RESULT = {
  remaining: { kopi: 2 },
  held: { kopi: 1 },
  left: 5,
  left_held: 1,
  max_per_order: 4,
};
const PARSED = {
  remaining: { kopi: 2 },
  held: { kopi: 1 },
  left: 5,
  leftHeld: 1,
  maxPerOrder: 4,
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: RESULT, error: null });
  rateLimit.mockReset().mockResolvedValue(true);
});

describe("holdCart", () => {
  it("holds the basket and returns what is still available", async () => {
    const lines = [{ menuItemId: "kopi", quantity: 2 }];
    expect(await holdCart(BOOTH, SESSION, lines)).toEqual(PARSED);
    expect(rpc).toHaveBeenCalledWith("hold_cart", {
      p_booth_id: BOOTH,
      p_session: SESSION,
      p_items: lines,
    });
  });

  it("passes an empty basket through, which releases the hold", async () => {
    await holdCart(BOOTH, SESSION, []);
    expect(rpc).toHaveBeenCalledWith(
      "hold_cart",
      expect.objectContaining({ p_items: [] }),
    );
  });

  it("makes no call for ids or lines that do not validate", async () => {
    expect(await holdCart("nope", SESSION, [])).toBeNull();
    expect(await holdCart(BOOTH, "nope", [])).toBeNull();
    expect(
      await holdCart(BOOTH, SESSION, [{ menuItemId: "kopi", quantity: 0 }]),
    ).toBeNull();
    expect(
      await holdCart(BOOTH, SESSION, [{ menuItemId: "kopi", quantity: 51 }]),
    ).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes no call when the per-IP guard refuses", async () => {
    rateLimit.mockResolvedValue(false);
    expect(await holdCart(BOOTH, SESSION, [])).toBeNull();
    expect(rateLimit).toHaveBeenCalledWith(`hold:${BOOTH}:1.2.3.4`, 240, 60);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null on an RPC error or an unexpected result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await holdCart(BOOTH, SESSION, [])).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await holdCart(BOOTH, SESSION, [])).toBeNull();
  });
});

describe("readAvailability", () => {
  it("reads availability for the caller's basket without holding", async () => {
    expect(await readAvailability(BOOTH, SESSION)).toEqual(PARSED);
    expect(rpc).toHaveBeenCalledWith("booth_availability", {
      p_booth_id: BOOTH,
      p_session: SESSION,
    });
    expect(rpc).not.toHaveBeenCalledWith("hold_cart", expect.anything());
  });

  it("returns null for bad ids or an RPC error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await readAvailability("nope", SESSION)).toBeNull();
    expect(await readAvailability(BOOTH, "nope")).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await readAvailability(BOOTH, SESSION)).toBeNull();
  });
});
