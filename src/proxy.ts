import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, robotsHeaderFor, withNonceCsp } from "@merqo/ui/security";
import { updateSession } from "@/lib/supabase/middleware";
import { cspOptions } from "@/lib/security-headers";

const CSP = "Content-Security-Policy";

// Browsers enforce frame-ancestors on localhost too, which blocks IDE preview panes.
const devCsp = (csp: string) => csp.replace("; frame-ancestors 'none'", "");

// next.config.ts cannot import the ESM-only @merqo/ui/security, so the CSP is
// set here. Every page renders per request (the root layout reads cookies and
// headers), so every page gets a nonce. Dev keeps the static policy: React
// needs eval there and the theme script differs.
function contentSecurityPolicy(request: NextRequest): string | null {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) return devCsp(buildCsp(cspOptions(isDev)));
  // The nonce must be on the request before updateSession builds its response.
  return withNonceCsp(
    request,
    NextResponse.next(),
    cspOptions(isDev),
  ).headers.get(CSP);
}

export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy(request);
  const response = await updateSession(request);
  if (csp) response.headers.set(CSP, csp);
  const robots = robotsHeaderFor(process.env.VERCEL_ENV);
  if (robots) response.headers.set(robots.key, robots.value);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
