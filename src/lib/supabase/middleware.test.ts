import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
  const createServerClient = vi.fn().mockReturnValue({ auth: { getUser } });
  return { createServerClient };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./middleware";

describe("updateSession — host-only duplicate auth cookie cleanup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    createServerClient.mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
    }));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    vi.clearAllMocks();
  });

  const request = (cookie: string) =>
    new NextRequest("https://qkit.merqo.io/dashboard", { headers: { cookie } });
  const cleared = (
    response: Response & {
      cookies: {
        getAll: () => { name: string; value: string; maxAge?: number }[];
      };
    },
    name: string,
  ) => response.cookies.getAll().find((c) => c.name === name);

  it("clears the host-only copy when the browser sends the same auth cookie twice", async () => {
    const response = await updateSession(
      request("sb-project-auth-token=host-only; sb-project-auth-token=domain"),
    );

    const out = cleared(response, "sb-project-auth-token");
    expect(out?.value).toBe("");
    expect(out?.maxAge).toBe(0);
  });

  it("clears chunked token names too", async () => {
    const response = await updateSession(
      request(
        "sb-project-auth-token.0=a; sb-project-auth-token.0=b; sb-project-auth-token.1=a; sb-project-auth-token.1=b",
      ),
    );

    expect(cleared(response, "sb-project-auth-token.0")?.maxAge).toBe(0);
    expect(cleared(response, "sb-project-auth-token.1")?.maxAge).toBe(0);
  });

  it("clears again on every request while the duplicate exists, with no marker cookie", async () => {
    const header =
      "sb-project-auth-token=host-only; sb-project-auth-token=domain";
    const first = await updateSession(request(header));
    const second = await updateSession(request(header));

    expect(cleared(first, "sb-project-auth-token")?.maxAge).toBe(0);
    expect(cleared(second, "sb-project-auth-token")?.maxAge).toBe(0);
    expect(
      first.cookies.getAll().find((c) => c.name.includes("migrated")),
    ).toBeUndefined();
  });

  it("leaves a single auth cookie alone", async () => {
    const response = await updateSession(
      request("sb-project-auth-token=only-one"),
    );

    expect(cleared(response, "sb-project-auth-token")).toBeUndefined();
  });

  it("does nothing when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset", async () => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    const response = await updateSession(
      request("sb-project-auth-token=a; sb-project-auth-token=b"),
    );

    expect(cleared(response, "sb-project-auth-token")).toBeUndefined();
  });

  it("does not clobber a same-request token refresh", async () => {
    createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: vi.fn().mockImplementation(async () => {
          // @supabase/ssr rotates the session as a side effect of getUser().
          options.cookies.setAll([
            {
              name: "sb-project-auth-token",
              value: "freshly-refreshed",
              options: {},
            },
          ]);
          return { data: { user: { id: "u1" } } };
        }),
      },
    }));

    const response = await updateSession(
      request("sb-project-auth-token=host-only; sb-project-auth-token=domain"),
    );

    expect(cleared(response, "sb-project-auth-token")?.value).toBe(
      "freshly-refreshed",
    );
  });
});
