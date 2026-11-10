import { createProxy } from "@merqo/ui/next";
import { NONCE_PREFIXES } from "@/lib/nonce-prefixes";
import { updateSession } from "@/lib/supabase/middleware";

// next.config.ts cannot import the ESM-only @merqo/ui, so the CSP (nonce on
// per-request routes via needsNonce, static elsewhere) is set here. The env
// reference stays literal so Next inlines it.
export const proxy = createProxy({
  updateSession,
  noncePrefixes: NONCE_PREFIXES,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
