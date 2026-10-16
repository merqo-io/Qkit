import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { startNewService } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => void fn(),
}));

const h = vi.hoisted(() => ({
  authUser: { id: "v1" } as { id: string } | null,
  rpcResult: { data: true, error: null } as {
    data: boolean | null;
    error: { message: string } | null;
  },
  rpcSpy: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: h.authUser } }),
      },
      rpc: (fn: string, args: unknown) => {
        h.rpcSpy(fn, args);
        return Promise.resolve(h.rpcResult);
      },
    }),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  h.authUser = { id: "v1" };
  h.rpcResult = { data: true, error: null };
  h.rpcSpy.mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe("startNewService", () => {
  it("resets the booth through the RPC and refreshes the dashboard", async () => {
    await expect(startNewService(BOOTH_ID)).resolves.toEqual({
      success: true,
    });
    expect(h.rpcSpy).toHaveBeenCalledWith("start_new_service", {
      p_booth_id: BOOTH_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("rejects a booth id that is not a uuid before any call", async () => {
    await expect(startNewService("not-a-uuid")).resolves.toEqual({
      success: false,
      error: "Invalid booth",
    });
    expect(h.rpcSpy).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    h.authUser = null;
    await expect(startNewService(BOOTH_ID)).resolves.toEqual({
      success: false,
      error: "Not authenticated",
    });
    expect(h.rpcSpy).not.toHaveBeenCalled();
  });

  it("reports not found when the booth is not the caller's", async () => {
    h.rpcResult = { data: false, error: null };
    await expect(startNewService(BOOTH_ID)).resolves.toEqual({
      success: false,
      error: "Booth not found",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a database error without revalidating", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.rpcResult = { data: null, error: { message: "boom" } };
    await expect(startNewService(BOOTH_ID)).resolves.toEqual({
      success: false,
      error: "Could not start a new service",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
