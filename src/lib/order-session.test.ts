import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
const set = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get, set }),
}));

import { orderSessionId } from "./order-session";

const SID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  get.mockReset();
  set.mockReset();
});

describe("orderSessionId", () => {
  it("creates and sets a hardened cookie when absent", async () => {
    get.mockReturnValue(undefined);
    const sid = await orderSessionId();
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(set).toHaveBeenCalledWith(
      "qkit_order_sid",
      sid,
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      }),
    );
  });

  it("reuses a valid existing cookie without resetting it", async () => {
    get.mockReturnValue({ value: SID });
    expect(await orderSessionId()).toBe(SID);
    expect(set).not.toHaveBeenCalled();
  });

  it("replaces a malformed cookie value", async () => {
    get.mockReturnValue({ value: "not-a-uuid" });
    const sid = await orderSessionId();
    expect(sid).not.toBe("not-a-uuid");
    expect(set).toHaveBeenCalled();
  });
});
