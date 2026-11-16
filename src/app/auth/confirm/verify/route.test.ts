import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, client } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: client }));
import { POST } from "./route";

const ORIGIN = "https://qkit.example";

function post(fields: Record<string, string>, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (origin !== null) headers.origin = origin;
  return POST(
    new Request(`${ORIGIN}/auth/confirm/verify`, {
      method: "POST",
      headers,
      body: new URLSearchParams(fields),
    }),
  );
}

beforeEach(() => {
  client.mockReset().mockResolvedValue({ auth: { verifyOtp } });
  verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("auth confirm verify", () => {
  it("lands on the dashboard after verifying a magic link", async () => {
    const response = await post({ token_hash: "abc", type: "magiclink" });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "abc",
      type: "magiclink",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("sends a recovery link to the reset-password page", async () => {
    const response = await post({ token_hash: "abc", type: "recovery" });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("sends a failed verification to the login error", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired" } });
    const response = await post({ token_hash: "abc", type: "recovery" });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=link`);
  });

  it("rejects a cross-origin POST without verifying", async () => {
    const response = await post(
      { token_hash: "abc", type: "recovery" },
      "https://evil.example",
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=link`);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
