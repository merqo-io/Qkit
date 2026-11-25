import { beforeEach, describe, expect, it, vi } from "vitest";

const { headerValues } = vi.hoisted(() => ({
  headerValues: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerValues.get(k) ?? null }),
}));

import { requestOrigin } from "./request-origin";

beforeEach(() => headerValues.clear());

describe("requestOrigin", () => {
  it("defaults to http for localhost with no forwarded proto", async () => {
    headerValues.set("host", "localhost:3000");
    expect(await requestOrigin()).toBe("http://localhost:3000");
  });

  it("uses a valid x-forwarded-proto", async () => {
    headerValues.set("host", "localhost:3000");
    headerValues.set("x-forwarded-proto", "https");
    expect(await requestOrigin()).toBe("https://localhost:3000");
  });

  it("ignores a junk x-forwarded-proto", async () => {
    headerValues.set("host", "qkit.merqo.io");
    headerValues.set("x-forwarded-proto", "javascript");
    expect(await requestOrigin()).toBe("https://qkit.merqo.io");
  });

  it("rejects a host carrying userinfo", async () => {
    headerValues.set("host", "x.merqo.io:1@evil.com");
    expect(await requestOrigin()).toBeNull();
  });

  it.each([
    "x.merqo.io/evil",
    "x.merqo.io?a",
    "x.merqo.io#a",
    "x.merqo.io\\a",
    "x.merqo.io a",
  ])("rejects host %j", async (host) => {
    headerValues.set("host", host);
    expect(await requestOrigin()).toBeNull();
  });

  it("accepts a normal merqo.io host", async () => {
    headerValues.set("host", "qkit-staging.merqo.io");
    expect(await requestOrigin()).toBe("https://qkit-staging.merqo.io");
  });
});
