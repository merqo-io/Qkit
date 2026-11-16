import { z } from "zod";

type ConnectToken = { token: string; deep_link: string };
const connectTokenSchema = z.object({
  token: z.string(),
  deep_link: z.string(),
});

// Read lazily (not at module scope) so tests can set/override these per-case
// via process.env rather than baking a stale value in at import time.
function merqoBaseUrl(): string {
  return process.env.MERQO_BASE_URL ?? "https://www.merqo.io";
}
function merqoCustomerSecret(): string {
  return process.env.MERQO_CUSTOMER_SECRET ?? "";
}

/** Bearer header for merqo calls; empty when the secret is unset so callers
 *  that can degrade (the plan page) still work. */
export function merqoAuthHeaders(): Record<string, string> {
  const secret = merqoCustomerSecret();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

type MerqoFetchResult = { res: Response } | { res: null; error: unknown };

/** Shared bearer-authenticated POST to a merqo `/api/merqo/*` endpoint —
 *  every caller below builds its own success/failure handling on top, since
 *  they disagree on whether a failure should log (notifyCustomer/notifyVendor)
 *  or fail silently to null (mintCustomerConnectToken). */
async function merqoFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<MerqoFetchResult> {
  try {
    const res = await fetch(`${merqoBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${merqoCustomerSecret()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return { res };
  } catch (error) {
    return { res: null, error };
  }
}

/**
 * Mints a short-lived Telegram connect-link token for one customer-facing
 * event via merqo's `POST /api/merqo/customer-connect-token`. Fails closed
 * (returns `null`) on any non-2xx response, timeout, network error, or
 * unexpected body shape — a merqo outage must never break the caller's own
 * render/flow.
 */
export async function mintCustomerConnectToken(
  vendorId: string,
  kitSlug: string,
  notifyRef: string,
): Promise<ConnectToken | null> {
  const result = await merqoFetch("/api/merqo/customer-connect-token", {
    vendor_id: vendorId,
    kit_slug: kitSlug,
    notify_ref: notifyRef,
  });
  if (!result.res || !result.res.ok) return null;
  try {
    const parsed = connectTokenSchema.safeParse(await result.res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: notifies a customer via merqo's
 * `POST /api/merqo/notify-customer` (`notify_ref` mode). Never throws — a
 * non-2xx response or network error is caught and logged, never propagated,
 * same rule as every other Telegram integration point in this ecosystem
 * (callers must never have their own result changed by this).
 */
export async function notifyCustomer(
  vendorId: string,
  notifyRef: string,
  message: string,
): Promise<void> {
  const result = await merqoFetch("/api/merqo/notify-customer", {
    vendor_id: vendorId,
    notify_ref: notifyRef,
    message,
  });
  if (!result.res) {
    console.error("notifyCustomer failed", result.error);
    return;
  }
  if (!result.res.ok)
    console.error("notifyCustomer: non-2xx response", result.res.status);
}

/**
 * Fire-and-forget: notifies a vendor via merqo's shared bot
 * (`POST /api/merqo/notify-vendor`) — the Phase A2 replacement for a kit's
 * own per-kit vendor-alert bot. Never throws, same rule as `notifyCustomer`.
 */
export async function notifyVendor(
  vendorId: string,
  message: string,
): Promise<void> {
  const result = await merqoFetch("/api/merqo/notify-vendor", {
    vendor_id: vendorId,
    message,
  });
  if (!result.res) {
    console.error("notifyVendor failed", result.error);
    return;
  }
  if (!result.res.ok)
    console.error("notifyVendor: non-2xx response", result.res.status);
}
