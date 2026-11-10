import { NONCE_PREFIXES as SHARED_NONCE_PREFIXES } from "@merqo/ui/security";

// qkit keeps a strict nonce CSP (no 'unsafe-inline') on its public pages as
// well: they already render per request, and a static policy's
// 'unsafe-inline' would give no XSS protection. e2e/csp.spec.ts guards this.
// createProxy takes prefixes, not a predicate, so the public pages are listed;
// "/" matches the landing page only, not every path.
export const NONCE_PREFIXES: readonly string[] = [
  ...SHARED_NONCE_PREFIXES,
  "/",
  "/about",
  "/legal",
  "/offers",
  "/order-history",
  "/onboarding",
  "/o",
  "/order",
];
