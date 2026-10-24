import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { exchangeCodeForSession: exchange },
  }),
}));
import { GET } from "./route";

const call = (qs: string) =>
  GET(new Request(`https://qkit.merqo.io/auth/callback${qs}`));
const location = (r: Response) => r.headers.get("location");

beforeEach(() => {
  vi.clearAllMocks();
  exchange.mockResolvedValue({ error: null });
});

describe("auth callback", () => {
  it("rejects a missing code without calling Supabase", async () => {
    expect(location(await call(""))).toBe(
      "https://qkit.merqo.io/login?error=oauth",
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects an oversized code without calling Supabase", async () => {
    const res = await call(`?code=${"a".repeat(513)}`);
    expect(location(res)).toBe("https://qkit.merqo.io/login?error=oauth");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("falls back to /dashboard for a protocol-relative next", async () => {
    const res = await call("?code=abc&next=//evil.example");
    expect(location(res)).toBe("https://qkit.merqo.io/dashboard");
  });

  it("falls back to /dashboard for a backslash next", async () => {
    const res = await call("?code=abc&next=/%5Cevil.example");
    expect(location(res)).toBe("https://qkit.merqo.io/dashboard");
  });

  it("follows a same-origin next", async () => {
    const res = await call("?code=abc&next=/reset-password");
    expect(location(res)).toBe("https://qkit.merqo.io/reset-password");
  });
});
