import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time bearer check against PAYKIT_CALLBACK_SECRET, for
 * POST /api/paykit/payment-status. A plain shared secret with no kit_slug
 * prefix: paykit is that route's only caller. Kept apart from
 * printkitCallbackBearerOk (qkit-printkit-auth.ts) on purpose. Each inbound
 * route is guarded by its own secret, so a leak of one opens only its own
 * route.
 */
export function paykitCallbackBearerOk(request: Request): boolean {
  const secret = process.env.PAYKIT_CALLBACK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
