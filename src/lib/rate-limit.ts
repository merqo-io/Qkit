import { createServiceClient } from "@/lib/supabase/server";

/**
 * Resolve a best-effort client IP from request headers. On Vercel the platform
 * sets and overwrites `x-vercel-forwarded-for` and `x-real-ip`, so those are
 * trusted first. The left side of `x-forwarded-for` is client-supplied (a
 * caller can send any value and the edge only appends to it), so the fallback
 * uses its LAST hop, the one the proxy added. Else the literal "unknown". Still
 * a coarse fairness key for the flood guard, not an authz signal.
 */
export function clientIp(hdrs: Headers): string {
  const vercel = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = hdrs.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (hdrs.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

async function checkBucket(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean | null> {
  try {
    const supabase = await createServiceClient();
    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (!error) return allowed !== false;
  } catch {
    // Reported by the caller as a degraded limiter.
  }
  return null;
}

/**
 * Server-side fixed-window check via the service-only DB limiter. Returns
 * true when the call is allowed. Fails OPEN — any limiter error (infra hiccup)
 * yields `true` so a real customer is never blocked by a degraded limiter. The
 * limiter is defence against floods, not a correctness gate.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const allowed = await checkBucket(key, limit, windowSeconds);
  if (allowed !== null) return allowed;
  // Buckets can contain order tokens; RPC diagnostics must never echo them.
  console.error("rateLimit degraded (failing open)");
  return true;
}

/**
 * Same check, but fails CLOSED: a limiter error denies the call. For anonymous
 * paths that create orders or reach paykit, where an attacker who can degrade
 * the store must not get an unlimited window.
 */
export async function rateLimitStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const allowed = await checkBucket(key, limit, windowSeconds);
  if (allowed !== null) return allowed;
  console.error("rateLimit degraded (failing closed)");
  return false;
}
