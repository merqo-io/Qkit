import type { User } from "@supabase/supabase-js";

export type LandingAccount = { name: string; avatarUrl: string | null };

/**
 * Account data for the public-page nav, taken from the auth user alone. The
 * stall name lives in merqo.vendor_profile behind a get-or-create helper that
 * writes, which a public page must not trigger just to label an avatar.
 */
export function toLandingAccount(user: User | null): LandingAccount | null {
  if (!user) return null;
  const rawAvatar = user.user_metadata?.avatar_url;
  return {
    name: user.email || "Account",
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
  };
}
