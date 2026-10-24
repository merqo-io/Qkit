import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchange, client } = vi.hoisted(() => ({
  exchange: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: client }));
import { GET } from "./route";

beforeEach(() => {
  client
    .mockReset()
    .mockResolvedValue({ auth: { exchangeCodeForSession: exchange } });
  exchange.mockReset().mockResolvedValue({ error: null });
});

describe("authentication callback", () => {
  it("rejects a missing authorization code without constructing a client", async () => {
    const response = await GET(
      new Request("https://qkit.example/auth/callback"),
    );
    expect(response.headers.get("location")).toBe(
      "https://qkit.example/login?error=oauth",
    );
    expect(client).not.toHaveBeenCalled();
  });

  it("does not continue to recovery when code exchange fails", async () => {
    exchange.mockResolvedValue({ error: { message: "Expired code" } });
    const response = await GET(
      new Request(
        "https://qkit.example/auth/callback?code=expired&next=/reset-password",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://qkit.example/login?error=oauth",
    );
  });

  it.each([
    null,
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "dashboard",
  ])("keeps unsupported next=%s on the dashboard", async (next) => {
    const url = new URL("https://qkit.example/auth/callback?code=valid-code");
    if (next !== null) url.searchParams.set("next", next);
    const response = await GET(new Request(url));
    expect(exchange).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe(
      "https://qkit.example/dashboard",
    );
  });

  it.each(["/reset-password", "/dashboard?tab=orders", "/\\evil.example"])(
    "allows only a same-origin destination for %s",
    async (next) => {
      const url = new URL("https://qkit.example/auth/callback?code=valid");
      url.searchParams.set("next", next);
      const response = await GET(new Request(url));
      const destination = new URL(response.headers.get("location")!);
      expect(destination.origin).toBe(url.origin);
      if (next === "/reset-password") expect(destination.pathname).toBe(next);
    },
  );

  it("rejects an oversized authorization code without calling Supabase", async () => {
    const response = await GET(
      new Request(`https://x.example/auth/callback?code=${"a".repeat(513)}`),
    );
    expect(response.headers.get("location")).toBe(
      "https://x.example/login?error=oauth",
    );
    expect(exchange).not.toHaveBeenCalled();
  });
});
