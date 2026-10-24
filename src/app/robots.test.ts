import { afterEach, describe, it, expect, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots", () => {
  it("disallows everything outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("allows crawling in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });
});
