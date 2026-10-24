import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { getEntitlement, type Entitlement } from "@/lib/plan";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_BOARD_SETTINGS,
  DEFAULT_TOURS_SEEN,
  type Vendor,
  type SocialLinks,
} from "@/lib/types";
import { getOrCreateVendorProfile } from "@/lib/merqo/vendor-profile";
import { requireCurrentLegalAcceptance } from "@/lib/legal-gate";

/**
 * Vendor row merged with its shared merqo.vendor_profile fields. qkit.vendors
 * has no name/social_links columns at all since migration 0069 —
 * merqo.vendor_profile is the only source, so every consumer of `vendor`
 * (profile page, booth forms, order-status page) gets those two fields
 * attached here instead of reading them off the DB row directly.
 */
export type VendorWithProfile = Vendor & {
  name: string;
  social_links: SocialLinks;
};

/**
 * Resolve the current vendor's effective entitlement (plan + any live license).
 *
 * vendors.id === auth.users.id and licenses.vendor_id === vendors.id, so both
 * the vendor row and the license both key on user.id — they're fetched in
 * parallel (one round-trip, not two) on this hot dashboard path. A THIRD,
 * sequential round-trip follows once the vendor row is back: the
 * merqo.vendor_profile fetch below can't join the Promise.all above because
 * it needs to know the vendor row actually exists first — firing it
 * unconditionally would spuriously create a merqo profile for a
 * signed-in-but-not-yet-onboarded user (no vendors row yet).
 *
 * Defensive: if the licenses table predates migration 0010 the query errors and
 * `data` is null, so we degrade to the plan-only entitlement rather than throw.
 * The VENDOR read is not treated this way — a read error there is surfaced (like
 * get-vendor), because swallowing it would misroute a real vendor to /onboarding
 * on a transient DB hiccup.
 */
export const loadEntitlement = cache(
  async (): Promise<{
    user: User | null;
    vendor: VendorWithProfile | null;
    entitlement: Entitlement;
    licenseExpiresAt: string | null;
  }> => {
    const supabase = await createServerClient();
    const user = await getUser();
    const now = Date.now();

    if (!user) {
      return {
        user: null,
        vendor: null,
        entitlement: getEntitlement("free", null, now),
        licenseExpiresAt: null,
      };
    }

    // A pass counts only inside its window: valid_from <= now < expires_at. Among
    // currently-active licenses, take the latest-expiring (longest remaining).
    const nowIso = new Date(now).toISOString();
    const [{ data: vendor, error: vendorError }, { data: license }] =
      await Promise.all([
        supabase
          .from("vendors")
          .select("id, plan, created_at, tours_seen, board_settings")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("licenses")
          .select("expires_at")
          .eq("vendor_id", user.id)
          .lte("valid_from", nowIso)
          .gt("expires_at", nowIso)
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    // Fail loud on a vendor read error (see get-vendor) — a null-on-error would
    // bounce an onboarded vendor back to /onboarding. Caught by the error boundary.
    if (vendorError) {
      console.error("loadEntitlement: vendor read failed", vendorError.message);
      throw new Error("vendor lookup failed");
    }

    // board_settings can be missing if migration 0050 hasn't reached this DB
    // yet (deploy and migrate aren't atomic) — fall back rather than crash
    // every board render.
    if (vendor && !vendor.board_settings) {
      vendor.board_settings = DEFAULT_BOARD_SETTINGS;
    }
    if (vendor && !vendor.tours_seen) {
      vendor.tours_seen = DEFAULT_TOURS_SEEN;
    }

    // Stall name + social links live only in merqo.vendor_profile — qkit.vendors
    // has never had a row to fall back to since migration 0069. `null` default:
    // onboarding (src/app/onboarding/actions.ts) is what seeds the initial name
    // now, so by the time a vendor reaches the dashboard the profile already
    // exists; get_or_create_vendor_profile's own 'My Stall' fallback only
    // matters for the rare row with no profile at all.
    // This call is deliberately NOT wrapped in try/catch (unlike the
    // order-status page's use of the same helper) because a swallowed error
    // here would misroute an onboarded vendor or silently show a wrong/stale
    // name. This path's convention (see vendor read error handling above) is to
    // fail loud rather than degrade silently.
    let vendorWithProfile: VendorWithProfile | null = null;
    if (vendor) {
      const profile = await getOrCreateVendorProfile(supabase, vendor.id, null);
      vendorWithProfile = {
        ...vendor,
        name: profile.stall_name,
        social_links: profile.social_links,
      };
    }

    const licenseExpiresAt = vendorWithProfile
      ? (license?.expires_at ?? null)
      : null;
    return {
      user,
      vendor: vendorWithProfile,
      entitlement: getEntitlement(
        vendorWithProfile?.plan ?? "free",
        licenseExpiresAt,
        now,
      ),
      licenseExpiresAt,
    };
  },
);

/**
 * Page guard variant of loadEntitlement: redirect when the gate fails
 * (`/login` if not signed in, `/onboarding` if not yet onboarded,
 * `/legal/accept` if their terms/privacy acceptance is stale), otherwise
 * return the entitlement bundle with non-null user + vendor.
 */
export async function requireEntitledVendor(): Promise<{
  user: User;
  vendor: VendorWithProfile;
  entitlement: Entitlement;
  licenseExpiresAt: string | null;
}> {
  const { user, vendor, entitlement, licenseExpiresAt } =
    await loadEntitlement();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");
  await requireCurrentLegalAcceptance(user.email);
  return { user, vendor, entitlement, licenseExpiresAt };
}
