import { createSupabaseBrowserClient } from "@merqo/ui/supabase";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

export function createClient() {
  return createSupabaseBrowserClient<Database, "qkit">({
    url: publicEnv.supabaseUrl,
    publishableKey: publicEnv.supabasePublishableKey,
    schema: "qkit",
    cookieDomain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN,
  });
}
