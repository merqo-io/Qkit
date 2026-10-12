import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { paykitCallbackBearerOk } from "./qkit-paykit-auth";

const originalEnv = { ...process.env };

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://qkit.test/api/paykit/payment-status", {
    headers,
  });
}

describe("paykitCallbackBearerOk", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns false when PAYKIT_CALLBACK_SECRET is unset", () => {
    delete process.env.PAYKIT_CALLBACK_SECRET;
    expect(paykitCallbackBearerOk(requestWith("Bearer anything"))).toBe(false);
  });

  it("returns false when PAYKIT_CALLBACK_SECRET is empty, even for an empty bearer", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "";
    expect(paykitCallbackBearerOk(requestWith("Bearer "))).toBe(false);
  });

  it("returns false with no authorization header", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith(null))).toBe(false);
  });

  it.each([
    ["a scheme other than Bearer", "Basic shared-secret"],
    ["a secret that doesn't match", "Bearer wrong-secret"],
    ["a secret of a different length", "Bearer shared-secret-x"],
  ])("returns false for %s", (_, authorization) => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith(authorization))).toBe(false);
  });

  it("does not accept the printkit callback secret", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "paykit-secret";
    process.env.PRINTKIT_CALLBACK_SECRET = "printkit-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer printkit-secret"))).toBe(
      false,
    );
  });

  it("returns true when the secret matches exactly", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer shared-secret"))).toBe(
      true,
    );
  });
});
