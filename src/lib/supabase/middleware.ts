import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@merqo/ui/supabase/middleware";
import { publicEnv } from "@/lib/env";

// Only these prefixes need a session; everything else (the landing page, the
// login page, and the whole anonymous customer ordering funnel: /o, /order)
// is public and spends no auth round-trip.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/admin"] as const;

export function updateSession(request: NextRequest) {
  return updateSupabaseSession(request, {
    url: publicEnv.supabaseUrl,
    publishableKey: publicEnv.supabasePublishableKey,
    schema: "qkit",
    cookieDomain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN,
    protectedPrefixes: PROTECTED_PREFIXES,
  });
}
