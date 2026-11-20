import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

const { loadEntitlementMock } = vi.hoisted(() => ({
  loadEntitlementMock: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: loadEntitlementMock,
}));

import { getLandingNavUser } from "./landing-nav-user";

const user = { id: "u1", email: "kopi@example.com", user_metadata: {} } as User;

beforeEach(() => {
  loadEntitlementMock.mockReset();
});

describe("getLandingNavUser", () => {
  it("returns null without reading the vendor when signed out", async () => {
    expect(await getLandingNavUser(null)).toBeNull();
    expect(loadEntitlementMock).not.toHaveBeenCalled();
  });

  it("names the account after the vendor's stall", async () => {
    loadEntitlementMock.mockResolvedValue({ vendor: { name: "Kopi Corner" } });
    expect((await getLandingNavUser(user))?.name).toBe("Kopi Corner");
  });

  it("falls back to the email local part when there is no vendor row", async () => {
    loadEntitlementMock.mockResolvedValue({ vendor: null });
    expect((await getLandingNavUser(user))?.name).toBe("kopi");
  });

  it("falls back instead of throwing when the vendor read fails", async () => {
    loadEntitlementMock.mockRejectedValue(new Error("db down"));
    expect((await getLandingNavUser(user))?.name).toBe("kopi");
  });
});
