import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * True when the user is an admin. Reads the `admins` table; under RLS the row is
 * visible only to admins, and a non-admin simply gets no row — so presence of a
 * row is the membership test either way.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Admin membership only: signed-out users and non-admins get a 404 so the
 * route's existence isn't revealed. The /mfa page uses this because it must
 * stay reachable below `aal2`.
 */
export async function requireAdminMember(): Promise<{ user: User }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!(await isAdmin(user.id))) notFound();
  return { user };
}

/**
 * Admin gate for /admin pages and admin server actions: an admin who has also
 * verified a second factor (`aal2`). Admins have no vendor row, so this
 * returns only the user.
 */
export async function requireAdmin(): Promise<{ user: User }> {
  const member = await requireAdminMember();
  const supabase = await createServerClient();
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data?.currentLevel !== "aal2") redirect("/mfa");
  return member;
}
