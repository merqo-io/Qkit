import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@merqo/ui/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

export async function createServerClient() {
  return createSupabaseServerClient<Database, "qkit">({
    url: publicEnv.supabaseUrl,
    publishableKey: publicEnv.supabasePublishableKey,
    schema: "qkit",
    cookieDomain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN,
  });
}

// Uses the secret key and bypasses RLS: only for Server Actions and Route
// Handlers. The shared client attaches no request cookies, which is what keeps
// the secret key, not the visitor's session, driving auth. The secret is read
// here, not in lib/env, so it never enters a module the browser bundle reaches.
export async function createServiceClient() {
  return createSupabaseServiceClient<Database, "qkit">({
    url: publicEnv.supabaseUrl,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    schema: "qkit",
  });
}
