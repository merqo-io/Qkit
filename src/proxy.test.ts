import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { proxy } from "./proxy";

beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

function signedIn() {
  createServerClient.mockImplementation(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  }));
}

const csp = (response: Response) =>
  response.headers.get("Content-Security-Policy");

afterEach(() => vi.unstubAllEnvs());

describe("proxy nonce CSP", () => {
  it("keeps frame-ancestors 'none' in production", async () => {
    signedIn();
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/dashboard"),
    );

    expect(csp(response)).toContain("frame-ancestors 'none'");
  });

  it("keeps the static policy in dev, where React needs eval", async () => {
    signedIn();
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/dashboard"),
    );

    expect(csp(response)).toMatch(
      /script-src 'self' 'unsafe-inline' 'unsafe-eval'/,
    );
    expect(csp(response)).not.toContain("frame-ancestors");
  });

  it("sets a nonce CSP without script unsafe-inline on a dynamic route", async () => {
    signedIn();
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/dashboard"),
    );

    expect(csp(response)).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(csp(response)).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("gives the landing page a nonce too, since every page renders per request", async () => {
    signedIn();
    const response = await proxy(new NextRequest("https://qkit.merqo.io/"));

    expect(csp(response)).toMatch(/script-src 'self' 'nonce-/);
  });

  it("forwards the same nonce to the app as x-nonce", async () => {
    signedIn();
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/admin"),
    );

    const nonce = /'nonce-([^']+)'/.exec(csp(response) ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("gives every request a fresh nonce", async () => {
    signedIn();
    const a = await proxy(new NextRequest("https://qkit.merqo.io/dashboard"));
    const b = await proxy(new NextRequest("https://qkit.merqo.io/dashboard"));

    expect(csp(a)).not.toBe(csp(b));
  });

  it("still carries the nonce CSP on the login redirect", async () => {
    createServerClient.mockImplementation(() => ({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    }));
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/admin"),
    );

    expect(response.status).toBe(307);
    expect(csp(response)).toContain("'nonce-");
  });
});

describe("proxy X-Robots-Tag", () => {
  it("marks non-production deployments noindex", async () => {
    signedIn();
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await proxy(new NextRequest("https://qkit.merqo.io/"));

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("leaves production indexable", async () => {
    signedIn();
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await proxy(new NextRequest("https://qkit.merqo.io/"));

    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});

describe("proxy Supabase origins", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets the browser reach the configured Supabase project", async () => {
    signedIn();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const response = await proxy(new NextRequest("https://qkit.merqo.io/"));

    expect(csp(response)).toContain("http://127.0.0.1:54321");
    expect(csp(response)).toContain("ws://127.0.0.1:54321");
  });
});

describe("proxy Vercel toolbar", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows vercel.live outside production", async () => {
    signedIn();
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/dashboard"),
    );

    expect(csp(response)).toContain("https://vercel.live");
  });

  it("keeps vercel.live out of the production policy", async () => {
    signedIn();
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await proxy(
      new NextRequest("https://qkit.merqo.io/dashboard"),
    );

    expect(csp(response)).not.toContain("vercel.live");
  });
});
