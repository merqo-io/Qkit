import {
  createServerClient as createSSRClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Shared @supabase/ssr cookie adapter. The setAll catch covers the read-only
// Server Component context (session refresh is handled by middleware instead).
function cookieMethods(cookieStore: CookieStore): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Read-only context (Server Component) — session refresh handled by middleware
      }
    },
  };
}

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database, "qkit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: cookieMethods(cookieStore),
      db: { schema: "qkit" },
      cookieOptions: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }
        : undefined,
    },
  );
}

// Uses the secret key — bypasses RLS. Only use in Server Actions/Route Handlers.
// CRITICAL: do NOT attach the request cookies here. If the user's auth cookies
// are passed, @supabase/ssr hydrates their session and authenticates every query
// as that user (RLS applies) instead of as service-role — silently breaking
// admin writes (entitlement writes denied, cross-vendor updates match 0 rows). An
// empty cookie adapter means the secret key drives auth → true RLS bypass.
export async function createServiceClient() {
  // Validated inline (not in lib/env, which is client-importable) so the secret
  // never enters a module the browser bundle could reach.
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey)
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
  return createSSRClient<Database, "qkit">(publicEnv.supabaseUrl, secretKey, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: "qkit" },
  });
}
