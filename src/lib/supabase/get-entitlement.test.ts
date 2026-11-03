// src/lib/supabase/get-entitlement.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";

const { getOrCreateVendorProfile, getUser, legal } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
  getUser: vi.fn(),
  legal: vi.fn(),
}));

vi.mock("@/lib/legal-gate", () => ({ requireCurrentLegalAcceptance: legal }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/merqo/vendor-profile", () => ({ getOrCreateVendorProfile }));
vi.mock("@/lib/supabase/get-user", () => ({ getUser }));

const maybeSingleVendor = vi.fn();
const maybeSingleEntitlement = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => {
      if (table === "vendors") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: maybeSingleVendor }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: maybeSingleEntitlement }) }),
      };
    },
  }),
}));

import { loadEntitlement, requireEntitledVendor } from "./get-entitlement";

beforeEach(() => {
  legal.mockReset().mockResolvedValue(undefined);
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  maybeSingleVendor.mockReset();
  maybeSingleEntitlement.mockReset();
  maybeSingleEntitlement.mockResolvedValue({ data: null });
});

describe("loadEntitlement", () => {
  it("returns free anonymous state without private reads", async () => {
    getUser.mockResolvedValue(null);
    expect(await loadEntitlement()).toEqual(
      expect.objectContaining({
        user: null,
        vendor: null,
        entitlement: expect.objectContaining({ tier: "free" }),
      }),
    );
    expect(maybeSingleVendor).not.toHaveBeenCalled();
    expect(maybeSingleEntitlement).not.toHaveBeenCalled();
  });

  it("surfaces vendor lookup errors instead of misrouting onboarded users", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: null,
      error: { message: "Unavailable" },
    });
    await expect(loadEntitlement()).rejects.toThrow("vendor lookup failed");
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("resolves the cached tier and fills missing board settings", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: { id: "v1" },
      error: null,
    });
    maybeSingleEntitlement.mockResolvedValue({
      data: {
        tier: "starter",
        founder: false,
        stats_window: "24h",
        event_pass_starts_at: null,
        event_pass_ends_at: null,
        valid_until: null,
      },
    });
    getOrCreateVendorProfile.mockResolvedValue({
      stall_name: "Coffee",
      social_links: {},
    });
    const result = await loadEntitlement();
    expect(result.entitlement.tier).toBe("starter");
    expect(result.vendor?.board_settings).toEqual(DEFAULT_BOARD_SETTINGS);
  });
  it("merges the merqo profile's stall_name/social_links onto the vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: {
        id: "v1",
        created_at: "2026-01-01T00:00:00Z",
        tours_seen: {},
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 5,
          daily_order_number_reset: true,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
      error: null,
    });
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopitiam Cart",
      social_links: { website: "https://example.com" },
    });

    const { vendor } = await loadEntitlement();

    expect(vendor?.name).toBe("Kopitiam Cart");
    expect(vendor?.social_links).toEqual({ website: "https://example.com" });
    expect(getOrCreateVendorProfile).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      null,
    );
  });

  it("returns a null vendor without calling getOrCreateVendorProfile when there's no vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({ data: null, error: null });

    const { vendor } = await loadEntitlement();

    expect(vendor).toBeNull();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("falls back to an empty tours_seen when the column is missing (migration 0092 not yet applied to this DB)", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: {
        id: "v1",
        created_at: "2026-01-01T00:00:00Z",
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 5,
          daily_order_number_reset: true,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
      error: null,
    });
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopitiam Cart",
      social_links: {},
    });

    const { vendor } = await loadEntitlement();

    expect(vendor?.tours_seen).toEqual({});
  });
});

describe("entitled vendor gate", () => {
  it("redirects anonymous users to login", async () => {
    getUser.mockResolvedValue(null);
    await expect(requireEntitledVendor()).rejects.toThrow("REDIRECT:/login");
    expect(legal).not.toHaveBeenCalled();
  });
  it("redirects accounts without a vendor to onboarding", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({ data: null, error: null });
    await expect(requireEntitledVendor()).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(legal).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "checks current legal acceptance before granting access: %s",
    async (accepted) => {
      getUser.mockResolvedValue({ id: "v1", email: "vendor@example.com" });
      maybeSingleVendor.mockResolvedValue({
        data: { id: "v1" },
        error: null,
      });
      getOrCreateVendorProfile.mockResolvedValue({
        stall_name: "Coffee",
        social_links: {},
      });
      if (!accepted)
        legal.mockRejectedValue(new Error("REDIRECT:/legal/accept"));
      if (accepted)
        expect(await requireEntitledVendor()).toEqual(
          expect.objectContaining({
            vendor: expect.objectContaining({ id: "v1", name: "Coffee" }),
          }),
        );
      else
        await expect(requireEntitledVendor()).rejects.toThrow(
          "REDIRECT:/legal/accept",
        );
      expect(legal).toHaveBeenCalledWith("vendor@example.com");
    },
  );
});
