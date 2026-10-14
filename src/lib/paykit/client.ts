// Thin server-only HTTP client for paykit's `/api/v1/*` checkout API — the
// Merqo family's shared payment engine (see paykit/AGENTS.md). Every function
// here is called from a Server Action, Route Handler, or Server Component
// only; never import this from a client component. Modeled on merqo's
// `fetchKitJson`/`postKitAction` (src/lib/kit-action-request.ts) — same
// never-throw, discriminated-result shape — but qkit has no prior "call
// another kit" module of its own to match instead.

import { z } from "zod";

// Fixed per paykit's kit_api_keys registration for this app — not an env var,
// since it identifies WHICH kit is calling, not a secret.
const KIT_SLUG = "qkit";

export type PaykitResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

export type VendorConfigFull = {
  hasConfig: boolean;
  displayName: string | null;
  kind: "paynow" | "pointer" | null;
  payeeName: string | null;
  uen: string | null;
  mobile: string | null;
  label: string | null;
  url: string | null;
  qrImageUrl: string | null;
};

const vendorConfigFullResponseSchema = z.object({
  has_config: z.boolean(),
  display_name: z.string().nullable(),
  kind: z.enum(["paynow", "pointer"]).nullable(),
  payee_name: z.string().nullable(),
  uen: z.string().nullable(),
  mobile: z.string().nullable(),
  label: z.string().nullable(),
  url: z.string().nullable(),
  qr_image_url: z.string().nullable(),
});

export type CheckoutView =
  | { type: "qr"; transactionId: string; payload: string }
  | { type: "link"; transactionId: string; url: string; label: string }
  | { type: "image"; transactionId: string; url: string };

const checkoutResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("qr"),
    transaction_id: z.string(),
    payload: z.string().min(1),
  }),
  z.object({
    type: z.literal("link"),
    transaction_id: z.string(),
    url: z.string().url(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    transaction_id: z.string(),
    url: z.string().url(),
  }),
]);

export type TransactionStatus = {
  transactionId: string;
  status: "pending" | "claimed" | "confirmed";
  amountCents: number;
  orderRef: string;
  claimedAt: string | null;
  confirmedAt: string | null;
};

const transactionStatusResponseSchema = z.object({
  transaction_id: z.string(),
  status: z.enum(["pending", "claimed", "confirmed"]),
  amount_cents: z.number(),
  order_ref: z.string(),
  claimed_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
});

const checkoutLookupResponseSchema = transactionStatusResponseSchema.extend({
  vendor_id: z.string().min(1),
});

export type CheckoutLookup = TransactionStatus & { vendorId: string };

export type BookingStatus = {
  bookingId: string;
  status: "pending_deposit" | "deposit_paid" | "fully_paid" | "cancelled";
  eventDate: string;
  depositAmountCents: number;
  balanceAmountCents: number;
  totalAmountCents: number;
  depositConfirmed: boolean;
  balanceConfirmed: boolean;
};

const bookingStatusResponseSchema = z.object({
  booking_id: z.string(),
  status: z.enum([
    "pending_deposit",
    "deposit_paid",
    "fully_paid",
    "cancelled",
  ]),
  event_date: z.string(),
  deposit_amount_cents: z.number(),
  balance_amount_cents: z.number(),
  total_amount_cents: z.number(),
  deposit_confirmed: z.boolean(),
  balance_confirmed: z.boolean(),
});

/** What paykit holds as evidence for a transaction. Both signals are hints
 *  for a person: `duplicateOf` names another transaction of the same vendor
 *  that carries the same screenshot, and `amountMatch` is null when paykit
 *  did not check the amount. */
export type CheckoutEvidence = {
  proofUrl: string | null;
  duplicateOf: { orderRef: string; kitSlug: string } | null;
  amountMatch: boolean | null;
};

const checkoutEvidenceResponseSchema = z.object({
  proof_url: z.string().url().nullable(),
  signals: z.object({
    duplicate_of: z
      .object({ order_ref: z.string(), kit_slug: z.string() })
      .nullable(),
    amount_match: z.boolean().nullable(),
  }),
});

// A claim that carries the screenshot uploads up to 1 MB through paykit to
// its storage, so it gets longer than the default before qkit gives up.
const PROOF_CLAIM_TIMEOUT_MS = 15_000;

const errorBodySchema = z.object({ error: z.string() });

/**
 * Shared fetch: bearer-authenticates as `qkit`, validates the response body
 * against `schema`, and never throws — every failure mode (missing secret,
 * network error, timeout, non-2xx, malformed/unexpected body) collapses to a
 * `{ok:false, status, error}` result so each call site decides its own
 * degrade-vs-fail behavior instead of repeating try/catch scaffolding.
 *
 * Read the secret at request time so missing configuration fails only the
 * affected payment operation, never module loading or the build.
 */
async function paykitRequest<T>(
  path: string,
  schema: {
    safeParse(data: unknown): { success: true; data: T } | { success: false };
  },
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<PaykitResult<T>> {
  const secret = process.env.PAYKIT_KIT_SECRET;
  if (!secret)
    return {
      ok: false,
      status: null,
      error: "Payments are not configured yet.",
    };
  // Not a secret (it's the public checkout host), but read here rather than
  // as a module constant for the same reason as the secret above — and so a
  // test can stub it per-case instead of it being frozen at first import.
  const paykitUrl =
    process.env.NEXT_PUBLIC_PAYKIT_URL ?? "https://paykit-sg.vercel.app";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(path, paykitUrl), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      // fetch writes the multipart boundary itself for a FormData body, so
      // the JSON content type is set for every other request only.
      headers: {
        ...init.headers,
        Authorization: `Bearer ${KIT_SLUG}:${secret}`,
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        error: "paykit returned an invalid response",
      };
    }

    if (!res.ok) {
      const parsedError = errorBodySchema.safeParse(body);
      return {
        ok: false,
        status: res.status,
        error: parsedError.success
          ? parsedError.data.error
          : `paykit request failed (${res.status})`,
      };
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return {
        ok: false,
        status: res.status,
        error: "paykit returned an unexpected response",
      };
    return { ok: true, data: parsed.data };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Could not reach paykit",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a vendor's payment config as paykit holds it. The config is entered
 *  in paykit and is vendor-wide; qkit only reads it, to name what is on file
 *  in the booth form (`vendorPaymentSetup`) and to learn the kind a booth's
 *  marker should carry (`saveBooth`). `ok:false` (paykit unreachable, or no
 *  `PAYKIT_KIT_SECRET` in this environment) means paykit did not say, which
 *  is not the same as `hasConfig:false`. */
export async function getVendorConfig(
  vendorId: string,
): Promise<PaykitResult<VendorConfigFull>> {
  const result = await paykitRequest(
    `/api/v1/vendors/${encodeURIComponent(vendorId)}/config`,
    vendorConfigFullResponseSchema,
    { method: "GET" },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      hasConfig: result.data.has_config,
      displayName: result.data.display_name,
      kind: result.data.kind,
      payeeName: result.data.payee_name,
      uen: result.data.uen,
      mobile: result.data.mobile,
      label: result.data.label,
      url: result.data.url,
      qrImageUrl: result.data.qr_image_url,
    },
  };
}

/** Read-only status for one paykit booking — powers the "booking status"
 *  section on an event-mode booth's dashboard (see `[boothId]/page.tsx`).
 *  The vendor pastes their own `paykit_booking_id` into the booth (they
 *  created the booking in paykit's own dashboard); this never looks a
 *  booking up by name/phone/date. Degrades the same way every other call
 *  here does (`ok:false`) — the caller shows nothing rather than an error,
 *  never blocking the rest of the dashboard. */
export async function getBookingStatus(
  bookingId: string,
): Promise<PaykitResult<BookingStatus>> {
  const result = await paykitRequest(
    `/api/v1/bookings/${encodeURIComponent(bookingId)}`,
    bookingStatusResponseSchema,
    { method: "GET" },
  );
  if (!result.ok) return result;
  const d = result.data;
  return {
    ok: true,
    data: {
      bookingId: d.booking_id,
      status: d.status,
      eventDate: d.event_date,
      depositAmountCents: d.deposit_amount_cents,
      balanceAmountCents: d.balance_amount_cents,
      totalAmountCents: d.total_amount_cents,
      depositConfirmed: d.deposit_confirmed,
      balanceConfirmed: d.balance_confirmed,
    },
  };
}

/** Create (or, idempotently, re-fetch) a checkout for one order. Safe to call
 *  repeatedly for the same `orderRef` — paykit dedupes on (kit_slug,
 *  order_ref) and returns the transaction it already created. 422 (no vendor
 *  config, or an incomplete one) surfaces as a normal `ok:false` — callers
 *  treat that as "no payment expected", not a hard error. */
export async function createCheckout(args: {
  vendorId: string;
  amountCents: number;
  orderRef: string;
}): Promise<PaykitResult<CheckoutView>> {
  const result = await paykitRequest(
    "/api/v1/checkout",
    checkoutResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({
        vendor_id: args.vendorId,
        amount_cents: args.amountCents,
        order_ref: args.orderRef,
      }),
    },
  );
  if (!result.ok) return result;
  const d = result.data;
  if (d.type === "qr")
    return {
      ok: true,
      data: { type: "qr", transactionId: d.transaction_id, payload: d.payload },
    };
  if (d.type === "link")
    return {
      ok: true,
      data: {
        type: "link",
        transactionId: d.transaction_id,
        url: d.url,
        label: d.label,
      },
    };
  return {
    ok: true,
    data: { type: "image", transactionId: d.transaction_id, url: d.url },
  };
}

function toTransactionStatus(
  d: z.infer<typeof transactionStatusResponseSchema>,
): TransactionStatus {
  return {
    transactionId: d.transaction_id,
    status: d.status,
    amountCents: d.amount_cents,
    orderRef: d.order_ref,
    claimedAt: d.claimed_at,
    confirmedAt: d.confirmed_at,
  };
}

/** Customer "I've paid" tap. Idempotent on paykit's side — already
 *  claimed/confirmed is a no-op success, never reverts a confirmed payment.
 *
 *  With `proof`, the customer's payment screenshot travels with the claim and
 *  paykit stores it before the claim commits: if it cannot be stored, paykit
 *  answers an error and the transaction is not claimed. qkit keeps no copy. */
export async function claimCheckout(
  transactionId: string,
  proof?: Blob,
): Promise<PaykitResult<TransactionStatus>> {
  let body: FormData | undefined;
  if (proof) {
    body = new FormData();
    body.append("proof", proof, "proof");
  }
  const result = await paykitRequest(
    `/api/v1/checkout/${encodeURIComponent(transactionId)}/claim`,
    transactionStatusResponseSchema,
    { method: "POST", body },
    proof ? PROOF_CLAIM_TIMEOUT_MS : undefined,
  );
  return result.ok
    ? { ok: true, data: toTransactionStatus(result.data) }
    : result;
}

/** Customer "Tapped by mistake? Undo" tap — reverts a `claimed` transaction
 *  back to `pending`. Idempotent on paykit's side (already `pending` is a
 *  no-op success) and never reverts a `confirmed` transaction — the response
 *  just echoes `status:"confirmed"` unchanged so the caller can detect
 *  "too late" and surface that to the customer. */
export async function unclaimCheckout(
  transactionId: string,
): Promise<PaykitResult<TransactionStatus>> {
  const result = await paykitRequest(
    `/api/v1/checkout/${encodeURIComponent(transactionId)}/unclaim`,
    transactionStatusResponseSchema,
    { method: "POST" },
  );
  return result.ok
    ? { ok: true, data: toTransactionStatus(result.data) }
    : result;
}

/** Vendor "Confirm payment" tap. Idempotent on paykit's side. */
export async function confirmCheckout(
  transactionId: string,
): Promise<PaykitResult<TransactionStatus>> {
  const result = await paykitRequest(
    `/api/v1/checkout/${encodeURIComponent(transactionId)}/confirm`,
    transactionStatusResponseSchema,
    { method: "POST" },
  );
  return result.ok
    ? { ok: true, data: toTransactionStatus(result.data) }
    : result;
}

/** Read-only status poll — not used by qkit's own polling today (the pay
 *  panel polls qkit's local `orders.payment_status` mirror instead, cheaper
 *  than round-tripping paykit every few seconds), but exposed for any future
 *  caller that needs the authoritative paykit-side status directly. */
export async function getCheckoutStatus(
  transactionId: string,
): Promise<PaykitResult<TransactionStatus>> {
  const result = await paykitRequest(
    `/api/v1/checkout/${encodeURIComponent(transactionId)}`,
    transactionStatusResponseSchema,
    { method: "GET" },
  );
  return result.ok
    ? { ok: true, data: toTransactionStatus(result.data) }
    : result;
}

/** Find the transaction paykit already holds for one of qkit's orders,
 *  without creating one. qkit stores no transaction id, so this is how an
 *  action reaches it. Unlike `createCheckout`, it does not depend on the
 *  vendor's current payment config, so it still answers after the vendor
 *  edits their payment details. The result carries the vendor that owns the
 *  transaction. A 404 means paykit has no transaction for the order; a 405
 *  means that paykit deployment has no lookup route. */
export async function getCheckoutByOrderRef(
  orderRef: string,
): Promise<PaykitResult<CheckoutLookup>> {
  const result = await paykitRequest(
    `/api/v1/checkout?order_ref=${encodeURIComponent(orderRef)}`,
    checkoutLookupResponseSchema,
    { method: "GET" },
  );
  return result.ok
    ? {
        ok: true,
        data: {
          ...toTransactionStatus(result.data),
          vendorId: result.data.vendor_id,
        },
      }
    : result;
}

/** Read the evidence paykit holds for a transaction: a link to the payment
 *  screenshot that expires after 300 seconds, and paykit's signals about it.
 *  The caller must already have established that the signed-in vendor owns
 *  the order this transaction belongs to; paykit trusts the calling kit. */
export async function getCheckoutEvidence(
  transactionId: string,
): Promise<PaykitResult<CheckoutEvidence>> {
  const result = await paykitRequest(
    `/api/v1/checkout/${encodeURIComponent(transactionId)}/evidence`,
    checkoutEvidenceResponseSchema,
    { method: "GET" },
  );
  if (!result.ok) return result;
  const duplicate = result.data.signals.duplicate_of;
  return {
    ok: true,
    data: {
      proofUrl: result.data.proof_url,
      duplicateOf: duplicate
        ? { orderRef: duplicate.order_ref, kitSlug: duplicate.kit_slug }
        : null,
      amountMatch: result.data.signals.amount_match,
    },
  };
}
