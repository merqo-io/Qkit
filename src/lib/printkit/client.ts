// Thin server-only HTTP client for printkit's /api/v1/* — mirrors
// src/lib/paykit/client.ts's shared-request shape (same never-throw,
// discriminated-result pattern, same KIT_SLUG-not-an-env-var reasoning).
// Three endpoints: job creation, location registration, and a location's
// printer status. A print job's own status flows the OTHER direction
// (printkit calls qkit's /api/printkit/print-status — see
// src/lib/qkit-printkit-auth.ts and that route), so nothing here polls a job.

import { z } from "zod";

const KIT_SLUG = "qkit";

export type PrintkitResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

const createPrintJobResponseSchema = z.object({ id: z.string() });
const registerLocationResponseSchema = z.object({ id: z.string() });
const errorBodySchema = z.object({ error: z.string() });

/**
 * Only an http(s) URL may become a link in the dashboard. Anything else
 * printkit might send (no field at all from a deployment that predates it,
 * a non-string, another scheme) reads as "no link" and never fails the
 * status it came with.
 */
function httpUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const printerStatusSchema = z.object({
  printer: z
    .object({
      display_name: z.string(),
      catalog_id: z.string(),
      connector: z.string(),
      state: z.enum(["online", "offline", "not_set_up"]),
      last_seen_at: z.string().nullable(),
      hardware_verified: z.boolean(),
    })
    .nullable(),
  manage_url: z.unknown().optional().transform(httpUrlOrNull),
});

export type PrinterStatusBody = z.infer<typeof printerStatusSchema>;

/**
 * Shared fetch: bearer-authenticates as `qkit`, validates the response body
 * against `schema`, and never throws — every failure mode (missing secret,
 * missing URL, network error, timeout, non-2xx, malformed/unexpected body)
 * collapses to a `{ok:false, status, error}` result. No fallback URL: unlike
 * paykit, printkit has no live deployment yet (its own Plan 1 deliberately
 * deferred Vercel/domain setup to a human), so an unset
 * `NEXT_PUBLIC_PRINTKIT_URL` must fail closed rather than guess a
 * `*.vercel.app` subdomain — the exact mistake printkit's own
 * qkit-client.ts made and fixed in its final review.
 */
async function printkitRequest<T>(
  path: string,
  schema: {
    safeParse(data: unknown): { success: true; data: T } | { success: false };
  },
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<PrintkitResult<T>> {
  const secret = process.env.PRINTKIT_KIT_SECRET;
  if (!secret)
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl)
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(path, printkitUrl), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${KIT_SLUG}:${secret}`,
        "Content-Type": "application/json",
      },
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an invalid response",
      };
    }

    if (!res.ok) {
      const parsedError = errorBodySchema.safeParse(body);
      return {
        ok: false,
        status: res.status,
        error: parsedError.success
          ? parsedError.data.error
          : `printkit request failed (${res.status})`,
      };
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an unexpected response",
      };
    return { ok: true, data: parsed.data };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Could not reach printkit",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Whether qkit holds what it needs to call printkit at all. Lets a caller
 *  tell "not set up in this deployment" from "printkit did not answer". */
export function printkitConfigured(): boolean {
  return Boolean(
    process.env.PRINTKIT_KIT_SECRET && process.env.NEXT_PUBLIC_PRINTKIT_URL,
  );
}

export async function createPrintJob(args: {
  vendorId: string;
  orderId: string;
  boothId: string;
  customerName: string;
  orderNumber: string;
  labels?: { item_name: string; item_options?: string }[];
}): Promise<PrintkitResult<{ id: string }>> {
  return printkitRequest("/api/v1/print-jobs", createPrintJobResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      vendor_id: args.vendorId,
      payload: {
        customer_name: args.customerName,
        order_number: args.orderNumber,
      },
      ...(args.labels ? { job_type: "label_batch", labels: args.labels } : {}),
      source_ref: args.orderId,
      location_ref: args.boothId,
    }),
  });
}

/**
 * Whether this booth has a printer in printkit, and whether it is reachable
 * right now. printkit owns that fact for every kind of printer (cloud, 4G,
 * Bluetooth bridge), so qkit reads it over HTTP rather than subscribing to
 * printkit's own realtime channel with qkit's Supabase client.
 * `manage_url` names the printkit page to link to; qkit builds no such path.
 */
export async function getPrinterStatus(
  boothId: string,
): Promise<PrintkitResult<PrinterStatusBody>> {
  return printkitRequest(
    `/api/v1/print-locations/status?source_ref=${encodeURIComponent(boothId)}`,
    printerStatusSchema,
  );
}

export async function registerPrintLocation(args: {
  vendorId: string;
  sourceRef: string;
  label: string;
  active: boolean;
}): Promise<PrintkitResult<{ id: string }>> {
  return printkitRequest(
    "/api/v1/print-locations",
    registerLocationResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({
        vendor_id: args.vendorId,
        source_ref: args.sourceRef,
        label: args.label,
        active: args.active,
      }),
    },
  );
}
