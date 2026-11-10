import {
  clientIp as sharedClientIp,
  rateLimit as sharedRateLimit,
  rateLimitStrict as sharedRateLimitStrict,
  type RateLimitStore,
} from "@merqo/ui/kit-api";
import { createServiceClient } from "@/lib/supabase/server";

// On Vercel the platform sets and overwrites x-vercel-forwarded-for and
// x-real-ip, so those come first. The left side of x-forwarded-for is
// client-supplied, so the shared helper reads its last hop, the one the proxy
// added. Still a coarse fairness key for the flood guard, not an authz signal.
const TRUSTED_IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-real-ip",
  "x-forwarded-for",
];

export function clientIp(hdrs: Headers): string {
  return (
    sharedClientIp(hdrs, { trustedHeaders: TRUSTED_IP_HEADERS }) ?? "unknown"
  );
}

// The service-only DB limiter. A thrown error is how the shared helpers learn
// the store is degraded; the message stays generic because buckets can contain
// order tokens and RPC diagnostics must never echo them.
const store: RateLimitStore = {
  async hit(key, limit, windowSeconds) {
    const supabase = await createServiceClient();
    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error("check_rate_limit failed");
    return allowed !== false;
  },
};

/**
 * Server-side fixed-window check. Returns true when the call is allowed. Fails
 * OPEN: any limiter error (infra hiccup) yields `true` so a real customer is
 * never blocked by a degraded limiter. The limiter is defence against floods,
 * not a correctness gate.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  return sharedRateLimit(store, key, limit, windowSeconds);
}

/**
 * Same check, but fails CLOSED: a limiter error denies the call. For anonymous
 * paths that create orders or reach paykit, where an attacker who can degrade
 * the store must not get an unlimited window.
 */
export function rateLimitStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  return sharedRateLimitStrict(store, key, limit, windowSeconds);
}
