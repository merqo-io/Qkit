import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, schema, createServiceClient } = vi.hoisted(() => {
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  return { rpc, schema, createServiceClient: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createServiceClient }));

import { getEarnOffer } from "./earn-offer";

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { enabled: false }, error: null });
  schema.mockClear();
  createServiceClient.mockReset().mockResolvedValue({ schema });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getEarnOffer", () => {
  it("asks loopkit's qkit_earn_offer for the vendor on the loopkit schema", async () => {
    rpc.mockResolvedValue({
      data: { enabled: true, program_name: "Coffee Stamps" },
      error: null,
    });

    await expect(getEarnOffer("v1")).resolves.toEqual({
      enabled: true,
      program_name: "Coffee Stamps",
    });
    expect(schema).toHaveBeenCalledWith("loopkit");
    expect(rpc).toHaveBeenCalledWith("qkit_earn_offer", { p_vendor: "v1" });
  });

  it.each([
    { enabled: "false" },
    { enabled: true, program_name: {} },
    { enabled: true, program_name: "x".repeat(201) },
    null,
  ])("fails closed for a malformed answer %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(getEarnOffer("v1")).resolves.toEqual({ enabled: false });
  });

  it("fails closed when the rpc returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });

    await expect(getEarnOffer("v1")).resolves.toEqual({ enabled: false });
  });

  it("fails closed when the client cannot be made or the call throws", async () => {
    createServiceClient.mockRejectedValueOnce(new Error("no key"));
    await expect(getEarnOffer("v1")).resolves.toEqual({ enabled: false });

    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(getEarnOffer("v1")).resolves.toEqual({ enabled: false });
  });
});
