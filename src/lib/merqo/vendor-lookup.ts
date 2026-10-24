import type { createServiceClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";
import { findAuthUserByEmail, listAllAuthUsers } from "@/lib/merqo/auth";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export type VendorLookup =
  | { ok: false }
  | { ok: true; vendor: { id: string; plan: Plan } | null };

/**
 * The vendor row for an auth email, or `vendor: null` when none exists.
 * `ok: false` means an upstream read failed (already logged under `tag`).
 */
export async function findVendorByEmail(
  supabase: ServiceClient,
  tag: string,
  email: string,
): Promise<VendorLookup> {
  const usersRes = await listAllAuthUsers(supabase, tag);
  if (usersRes.error) {
    console.error(`${tag}: read failed`, usersRes.error.message);
    return { ok: false };
  }
  const authUser = findAuthUserByEmail(usersRes.data?.users ?? [], email);
  if (!authUser) return { ok: true, vendor: null };
  const vendorRes = await supabase
    .from("vendors")
    .select("id, plan")
    .eq("id", authUser.id)
    .maybeSingle();
  if (vendorRes.error) {
    console.error(`${tag}: read failed`, vendorRes.error.message);
    return { ok: false };
  }
  return { ok: true, vendor: vendorRes.data };
}
