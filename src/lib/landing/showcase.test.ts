import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));
vi.mock("@/lib/env", () => ({
  publicEnv: { supabaseUrl: "http://x.test", supabasePublishableKey: "k" },
}));

import { getShowcaseVendors, parseShowcaseRows } from "./showcase";

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("parseShowcaseRows", () => {
  it("maps valid rows to camelCase", () => {
    expect(
      parseShowcaseRows([
        { name: "Bee", logo_url: "https://i.test/b.png" },
        { name: "Cee", logo_url: null },
      ]),
    ).toEqual([
      { name: "Bee", logoUrl: "https://i.test/b.png" },
      { name: "Cee", logoUrl: null },
    ]);
  });

  it("drops malformed rows and keeps the rest", () => {
    expect(
      parseShowcaseRows([
        { name: "", logo_url: null },
        { name: 5, logo_url: null },
        null,
        { name: "Ok", logo_url: null },
      ]),
    ).toEqual([{ name: "Ok", logoUrl: null }]);
  });

  it("returns [] for a non-array payload", () => {
    expect(parseShowcaseRows({ name: "x" })).toEqual([]);
    expect(parseShowcaseRows(null)).toEqual([]);
  });
});

describe("getShowcaseVendors", () => {
  it("returns parsed vendors from the RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ name: "Bee", logo_url: null }],
      error: null,
    });
    await expect(getShowcaseVendors()).resolves.toEqual([
      { name: "Bee", logoUrl: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_showcase_vendors");
  });

  it("returns [] when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getShowcaseVendors()).resolves.toEqual([]);
  });

  it("returns [] when the call throws", async () => {
    rpc.mockRejectedValue(new Error("network"));
    await expect(getShowcaseVendors()).resolves.toEqual([]);
  });
});
