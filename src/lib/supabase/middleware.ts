import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

// Only these prefixes need a session; everything else (the landing page, the
// login page, and the whole anonymous customer ordering funnel — /o, /order)
// is public.
function isProtectedPath(path: string): boolean {
  return (
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/admin")
  );
}

function isAuthTokenCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

// Names that appear twice in the raw Cookie header: a host-only cookie from
// before the shared .merqo.io domain, plus the domain-scoped one. The parsed
// cookie jar keeps one per name, so only the raw header shows the pair.
function duplicatedAuthCookieNames(request: NextRequest): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const name = part.split("=")[0].trim();
    if (!isAuthTokenCookieName(name)) continue;
    if (seen.has(name)) duplicated.add(name);
    seen.add(name);
  }
  return [...duplicated];
}

// A Set-Cookie with no Domain expires only the host-only copy, leaving the
// domain-scoped one. Runs on every request until the duplicate is gone (a
// one-time marker let a re-created duplicate send the vendor back to /login).
// `writtenThisPass` holds the names @supabase/ssr just wrote this request:
// ResponseCookies keys by name, so clearing one would overwrite the fresh
// session, and the next request retries instead.
function clearHostOnlyDuplicates(
  request: NextRequest,
  response: NextResponse,
  writtenThisPass: ReadonlySet<string>,
) {
  if (!process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN) return;
  for (const name of duplicatedAuthCookieNames(request)) {
    if (writtenThisPass.has(name)) continue;
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const cookiesWrittenBySupabase = new Set<string>();

  const supabase = createServerClient<Database, "qkit">(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
            cookiesWrittenBySupabase.add(name);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      db: { schema: "qkit" },
      cookieOptions: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }
        : undefined,
    },
  );

  // The customer funnel is anonymous and hot — don't spend an auth round-trip
  // (or risk an auth-outage 500) on it. Only protected routes resolve the user.
  if (!isProtectedPath(request.nextUrl.pathname)) {
    clearHostOnlyDuplicates(
      request,
      supabaseResponse,
      cookiesWrittenBySupabase,
    );
    return supabaseResponse;
  }

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth unreachable — degrade to "unauthenticated" and redirect to /login
    // rather than 500-ing a protected route.
    user = null;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    clearHostOnlyDuplicates(
      request,
      redirectResponse,
      cookiesWrittenBySupabase,
    );
    return redirectResponse;
  }

  clearHostOnlyDuplicates(request, supabaseResponse, cookiesWrittenBySupabase);
  return supabaseResponse;
}
