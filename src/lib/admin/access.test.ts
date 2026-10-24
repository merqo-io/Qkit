import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server Supabase client and next/navigation. vi.hoisted so the fns
// exist before the (hoisted) vi.mock factories run.
const {
  maybeSingle,
  getUser,
  getAal,
  redirectMock,
  notFoundMock,
  fromMock,
  selectMock,
  eqMock,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    maybeSingle,
    getUser: vi.fn(),
    getAal: vi.fn(),
    redirectMock: vi.fn((path: string) => {
      throw new Error(`REDIRECT ${path}`);
    }),
    fromMock,
    selectMock,
    eqMock,
    notFoundMock: vi.fn(() => {
      // Real notFound() throws to halt the request; mirror that so code after
      // it never runs and callers reject.
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: fromMock,
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: getAal } },
  })),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

import { isAdmin, requireAdmin, requireAdminMember } from "./access";

beforeEach(() => {
  maybeSingle.mockReset();
  getUser.mockReset();
  getAal.mockReset().mockResolvedValue({
    data: { currentLevel: "aal2", nextLevel: "aal2" },
    error: null,
  });
  redirectMock.mockClear();
  notFoundMock.mockClear();
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
});

describe("isAdmin", () => {
  it("true when an admins row is visible", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    expect(await isAdmin("u1")).toBe(true);
  });

  it("false when no row (RLS hides it for non-admins)", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    expect(await isAdmin("u1")).toBe(false);
  });

  it("queries the admins table by user_id", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    await isAdmin("u1");
    expect(fromMock).toHaveBeenCalledWith("admins");
    expect(selectMock).toHaveBeenCalledWith("user_id");
    expect(eqMock).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("requireAdmin", () => {
  it("404s when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("404s when signed in but not an admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("returns the user when an admin", async () => {
    const user = { id: "u1" };
    getUser.mockResolvedValue({ data: { user } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    const out = await requireAdmin();
    expect(out.user).toBe(user);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("sends a password-only (aal1) admin to the MFA page", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    getAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /mfa");
  });

  it("sends an admin with no factor enrolled to the MFA page", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    getAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /mfa");
  });

  it("fails closed when the assurance level cannot be read", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    getAal.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /mfa");
  });

  it("keeps a non-admin on a 404 before any MFA prompt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAal).not.toHaveBeenCalled();
  });
});

describe("requireAdminMember", () => {
  it("lets the MFA page check admin membership without aal2", async () => {
    const user = { id: "u1" };
    getUser.mockResolvedValue({ data: { user } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    getAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    expect((await requireAdminMember()).user).toBe(user);
  });
});
