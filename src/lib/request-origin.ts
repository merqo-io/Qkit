import { headers } from "next/headers";

// host/x-forwarded-host are client-spoofable (same caution clientIp's own
// doc comment gives in @/lib/rate-limit, "NOT trusted... a coarse fairness
// key, not an authz signal") — this allowlist is a basic check, not full
// trusted-proxy IP-range validation (that's a separate, bigger task).
const ALLOWED_HOST_SUFFIXES = [".merqo.io", ".vercel.app"];

function isAllowedHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/**
 * This app's own origin as the request names it, or null when neither host
 * header is one of ours. Taken from the Host header, not an env var: the
 * address must resolve on the device that made the request, and
 * NEXT_PUBLIC_BASE_URL has proved unreliable. Prefers `host`;
 * `x-forwarded-host` is only a fallback, and only once it passes the same
 * allowlist.
 */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  const forwardedHost = h.get("x-forwarded-host");

  let trustedHost: string | null = null;
  if (host && isAllowedHost(host)) trustedHost = host;
  else if (forwardedHost && isAllowedHost(forwardedHost))
    trustedHost = forwardedHost;

  if (!trustedHost) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${trustedHost}`;
}
