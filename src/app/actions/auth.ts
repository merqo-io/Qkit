"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Signs out from public pages and returns to the landing page. The dashboard
 * has its own action that lands on /login; a visitor browsing / or /about
 * should stay on the page they were reading.
 */
export async function signOutToHome(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
