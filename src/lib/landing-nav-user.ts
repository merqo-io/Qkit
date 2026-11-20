import type { User } from "@supabase/supabase-js";
import { toNavUser, type NavUser } from "@merqo/ui";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";

/**
 * The public nav's account data, named after the vendor's stall. A failed
 * vendor read must not take the public page down, so it falls back to the
 * name derived from the auth user alone.
 */
export async function getLandingNavUser(
  user: User | null,
): Promise<NavUser | null> {
  if (!user) return null;
  try {
    const { vendor } = await loadEntitlement();
    return toNavUser(user, vendor?.name);
  } catch {
    return toNavUser(user);
  }
}
