import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit, rateLimitStrict } from "./rate-limit";

function hdrs(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIp", () => {
  it("prefers x-vercel-forwarded-for over every other header", () => {
    expect(
      clientIp(
        hdrs({
          "x-vercel-forwarded-for": " 203.0.113.9 , 10.0.0.1",
          "x-real-ip": "198.51.100.7",
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        }),
      ),
    ).toBe("203.0.113.9");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(
      clientIp(
        hdrs({ "x-real-ip": " 198.51.100.7 ", "x-forwarded-for": "1.1.1.1" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("uses the last x-forwarded-for hop so a spoofed first hop is ignored", () => {
    expect(
      clientIp(
        hdrs({ "x-forwarded-for": "6.6.6.6, 203.0.113.5 , 70.41.3.18 " }),
      ),
    ).toBe("70.41.3.18");
  });

  it("ignores empty hops and blank headers", () => {
    expect(clientIp(hdrs({ "x-forwarded-for": "203.0.113.5, , " }))).toBe(
      "203.0.113.5",
    );
    expect(
      clientIp(
        hdrs({
          "x-vercel-forwarded-for": "  ",
          "x-real-ip": " ",
          "x-forwarded-for": " ",
        }),
      ),
    ).toBe("unknown");
  });

  it("returns 'unknown' when no header is present", () => {
    expect(clientIp(hdrs({}))).toBe("unknown");
  });
});
describe("rateLimit", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(createServiceClient).mockReset();
    vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks the requested bucket through the service client", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    expect(await rateLimit("order:test", 8, 60)).toBe(true);
    expect(createServiceClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "order:test",
      p_limit: 8,
      p_window_seconds: 60,
    });
  });

  it("rejects a request when the database denies the bucket", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    expect(await rateLimit("order:test", 8, 60)).toBe(false);
  });

  it("fails open on an RPC error without logging the private bucket", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Sensitive key: private-token" },
    });

    expect(await rateLimit("private-token", 8, 60)).toBe(true);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit unavailable",
      "Error",
    );
  });

  it("fails open on a thrown RPC failure without logging its contents", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("Sensitive key: private-token"));

    expect(await rateLimit("private-token", 8, 60)).toBe(true);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit unavailable",
      "Error",
    );
  });

  it("fails open when the service client cannot be created", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createServiceClient).mockRejectedValue(new Error("Unavailable"));

    expect(await rateLimit("order:test", 8, 60)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit unavailable",
      "Error",
    );
  });
});

describe("rateLimitStrict", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(createServiceClient).mockReset();
    vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows when the database allows", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    expect(await rateLimitStrict("order:test", 8, 60)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "order:test",
      p_limit: 8,
      p_window_seconds: 60,
    });
  });

  it("denies when the database denies", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    expect(await rateLimitStrict("order:test", 8, 60)).toBe(false);
  });

  it("fails closed on an RPC error without logging the bucket", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Sensitive key: private-token" },
    });

    expect(await rateLimitStrict("private-token", 8, 60)).toBe(false);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit unavailable",
      "Error",
    );
  });

  it("fails closed on a thrown failure", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("Sensitive key: private-token"));

    expect(await rateLimitStrict("private-token", 8, 60)).toBe(false);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit unavailable",
      "Error",
    );
  });

  it("leaves rateLimit failing open on the same error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });

    expect(await rateLimit("k", 8, 60)).toBe(true);
  });
});
