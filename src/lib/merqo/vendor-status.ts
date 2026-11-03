import type { Tier } from "@/lib/plan";

export type VendorStatus =
  | { active: true; plan: Tier }
  | { active: false; plan: null };

/**
 * qkit.vendors has no email column (id references auth.users(id) directly),
 * so the caller supplies the auth-user list (from supabase.auth.admin.listUsers)
 * alongside the vendors rows, and this pure function does the two-step lookup.
 * `tierOf` resolves a vendor id to its effective tier from the entitlement
 * cache (free when merqo has not pushed one).
 */
export function resolveVendorStatus(
  email: string,
  authUsers: { id: string; email: string | null }[],
  vendors: { id: string }[],
  tierOf: (vendorId: string) => Tier,
): VendorStatus {
  const key = email.toLowerCase();
  const user = authUsers.find((u) => u.email?.toLowerCase() === key);
  if (!user) return { active: false, plan: null };
  const vendor = vendors.find((v) => v.id === user.id);
  if (!vendor) return { active: false, plan: null };
  return { active: true, plan: tierOf(vendor.id) };
}
