import { NONCE_PREFIXES as SHARED_NONCE_PREFIXES } from "@merqo/ui/security";

// Routes that render per request and so can carry a CSP nonce. The shared list
// covers auth, dashboard and admin; the vendor onboarding step and the
// anonymous customer funnel (/o, /order) are qkit's own per-request routes.
// The landing, about and legal pages keep the static policy.
export const NONCE_PREFIXES: readonly string[] = [
  ...SHARED_NONCE_PREFIXES,
  "/onboarding",
  "/o",
  "/order",
];
