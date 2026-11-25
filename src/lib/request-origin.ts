import { headers } from "next/headers";

// host/x-forwarded-host are client-spoofable (same caution clientIp's own
// doc comment gives in @/lib/rate-limit, "NOT trusted... a coarse fairness
// key, not an authz signal") — this allowlist is a basic check, not full
// trusted-proxy IP-range validation (that's a separate, bigger task).
const ALLOWED_HOST_SUFFIXES = [".merqo.io", ".vercel.app"];

// Strict hostname[:port] shape, checked before the allowlist so userinfo or
// path tricks like `x.merqo.io:1@evil.com` never reach a URL built from it.
const HOST_SHAPE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

function hostnameOf(host: string): string {
  return host.split(":")[0].toLowerCase();
}

function isLocalHost(host: string): boolean {
  const hostname = hostnameOf(host);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isAllowedHost(host: string): boolean {
  if (!HOST_SHAPE.test(host)) return false;
  const hostname = hostnameOf(host);
  return (
    isLocalHost(host) ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/**
 * This app's own origin as the request names it, or null when neither host
 * header is one of ours. Taken from the Host header, not an env var: the
 * address must resolve on the device that made the request, and
 * NEXT_PUBLIC_BASE_URL has proved unreliable. Prefers `host`;
 * `x-forwarded-host` is only a fallback, and only once it passes the same
 * allowlist. `x-forwarded-proto` counts only when exactly `http` or `https`.
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
  const forwardedProto = h.get("x-forwarded-proto");
  const fallbackProto = isLocalHost(trustedHost) ? "http" : "https";
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : fallbackProto;
  return `${proto}://${trustedHost}`;
}
