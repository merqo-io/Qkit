"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  PAYMENT_PROOF_EXTENSIONS,
  parseOrderItems,
  parseOrderRef,
  parsePreClaimRef,
  paymentProofSchema,
  type PaymentProofType,
} from "@/lib/schemas";
import {
  createCheckout,
  claimCheckout,
  unclaimCheckout,
  type CheckoutView,
} from "@/lib/paykit/client";
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
import { hashBuffer } from "@/lib/hash";
import { isAbandonedPayment } from "@/lib/orders";
import { finalizePaidOrder } from "./finalize-paid-order";
import type { ActionResult } from "@/lib/action-result";
import type { PaymentStatus } from "@/lib/types";

/**
 * Read one order's payment status. Polling companion to getOrderStatus so the
 * customer's status page reflects the vendor's "Confirm payment" the same way
 * it reflects order progress (realtime is unreliable on customer devices).
 * Service client bypasses RLS — only the single field leaks.
 *
 * Reads qkit's local `orders.payment_status` mirror rather than paykit
 * directly — paykit is the source of truth for whether a claim/confirm
 * *succeeded* (see claimPayment below and dashboard/order-actions.ts's
 * confirmOrderPayment), but this mirror is kept in sync on every successful
 * write, so a poll every few seconds can stay a cheap local read instead of
 * round-tripping paykit's HTTP API each tick.
 */
export async function getPaymentStatus(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<PaymentStatus | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();

  // Same load-amplification guard as getOrderStatus/getWaitEstimate — the
  // token can't be brute-forced, but a holder could script polling faster
  // than the page's own 5s cadence.
  const allowed = await rateLimit(`payment-status:${token}`, 30, 60);
  if (!allowed) return null;

  // maybeSingle + log real errors only (an unknown order is a normal null). The
  // token match authorizes the read (booth_id + number aren't secret).
  const { data, error } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (error) console.error("getPaymentStatus failed", error.message);

  return data?.payment_status ?? null;
}

/**
 * Look up what paykit needs to create/re-fetch this order's checkout: the
 * order's amount + id (used as paykit's idempotency key, `order_ref`) and the
 * booth's owning vendor. Two small reads instead of a join — mirrors the
 * existing Promise.all pattern in page.tsx rather than depending on a
 * configured Supabase foreign-table relationship.
 */
async function loadCheckoutContext(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boothId: string,
  orderNumber: string,
  token: string,
) {
  const [{ data: order }, { data: booth }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_cents, payment_status, status")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .eq("access_token", token)
      .maybeSingle(),
    supabase.from("booths").select("vendor_id").eq("id", boothId).maybeSingle(),
  ]);
  if (!order || !booth?.vendor_id) return null;
  return {
    orderId: order.id as string,
    totalCents: order.total_cents as number,
    vendorId: booth.vendor_id as string,
    paymentStatus: order.payment_status as PaymentStatus,
    status: order.status as string,
  };
}

/**
 * Read what the pre-claim pay panel needs for a payment-required order that
 * has no order_number yet (numbering is deferred to a successful claim — see
 * claimPayment below). Same two-read + createCheckout shape as page.tsx's own
 * loadCheckoutView, just keyed on (boothId, token) instead of a numbered
 * order route.
 */
type PreClaimContext =
  | {
      state: "pending";
      orderId: string;
      amountCents: number;
      // What the customer is paying for and to whom, so the pay page is not
      // an amount and a QR with nothing to check them against.
      boothName: string;
      items: { name: string; quantity: number }[];
      checkout: CheckoutView | null;
    }
  | { state: "placed"; orderNumber: string }
  | { state: "cancelled" }
  // Unpaid past the abandoned-payment window: no longer payable.
  | { state: "expired" };

export async function loadPreClaimContext(
  boothId: string,
  token: string,
): Promise<PreClaimContext | null> {
  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok) return null;

  const supabase = await createServiceClient();

  // Unlike the polling reads above, this one makes a real outbound call to
  // paykit (createCheckout) on every invocation — cap page-reload-style
  // abuse tighter than a cheap local-only read.
  const allowed = await rateLimit(
    `pre-claim-context:${boothId}:${token}`,
    20,
    60,
  );
  if (!allowed) return null;

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, total_cents, payment_status, status, order_number, created_at, items",
    )
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return null;
  if (order.status === "cancelled") return { state: "cancelled" };
  if (order.payment_status !== "pending") {
    return order.order_number
      ? { state: "placed", orderNumber: order.order_number }
      : null;
  }
  // Checked before createCheckout, so an expired order mints no payment QR.
  if (isAbandonedPayment(order.created_at, Date.now()))
    return { state: "expired" };

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id, name")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return null;

  const checkout = await createCheckout({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
  });

  return {
    state: "pending",
    orderId: order.id,
    amountCents: order.total_cents,
    boothName: booth.name,
    items: parseOrderItems(order.items).map(({ name, quantity }) => ({
      name,
      quantity,
    })),
    checkout: checkout.ok ? checkout.data : null,
  };
}

function validatePaymentProof(
  photo: File | null,
): ActionResult<{ data: File }> {
  if (!photo)
    return { success: false, error: "A payment screenshot is required." };
  const proof = paymentProofSchema.safeParse(photo);
  if (!proof.success)
    return {
      success: false,
      error: proof.error.issues[0]?.message ?? "Invalid payment screenshot.",
    };
  return { success: true, data: proof.data };
}

/**
 * Why an order cannot take a payment claim right now, or null when it can.
 * The pay page already refuses an expired order; the expiry check here covers
 * a page left open past the window, and a direct call.
 */
function claimRefusal(order: {
  status: string;
  payment_status: string;
  payment_proof_path: string | null;
  created_at: string;
}): string | null {
  if (order.status === "cancelled") return "This order was cancelled.";
  // paykit's callback can mark an order claimed before this action has
  // recorded the screenshot: a first attempt whose paykit answer was slow, or
  // one that died after paykit took the claim. Let the retry through so the
  // screenshot is recorded. paykit's claim and finalizePaidOrder both repeat
  // safely.
  if (order.payment_status === "claimed" && !order.payment_proof_path)
    return null;
  if (order.payment_status !== "pending")
    return "This order isn't awaiting payment.";
  if (isAbandonedPayment(order.created_at, Date.now()))
    return "This order expired before it was paid. Please place a new one.";
  return null;
}

// Customer is anonymous, so this uses the service-role client (same pattern as
// the order status page read). Requires an uploaded payment screenshot — the
// photo upload IS the claim now, not a follow-on step, and doubles as the
// mechanism that finally assigns this order's number (deferred at place_order
// time for any payment-required order — see migration 0087). Payment is
// trust-based: a claim is only a hint — the vendor confirms real receipt on
// the board.
//
// Order of operations is load-bearing: upload the photo + hash it first,
// THEN call paykit's claim, THEN hand the order to finalizePaidOrder, which
// assigns the order number, fires the vendor notifications, and writes the
// local payment_status mirror last. A failed upload never touches
// payment_status or order_number at all (no half-claimed state); a failed
// paykit claim leaves only a harmless orphaned photo in storage; a failed
// mirror write doesn't undo an already-successful paykit claim +
// already-assigned number, so it still reports success.
//
// paykit calls qkit back as soon as its claim commits, so the callback route
// (src/app/api/paykit/payment-status/route.ts) usually runs
// finalizePaidOrder for this same order while this action is still inside
// it. That function is built for it: one number, one vendor alert, one
// label, and the screenshot is kept whichever mirror write lands first.
export async function claimPayment(
  boothId: string,
  token: string,
  photo: File | null,
): Promise<ActionResult<{ orderNumber: string }>> {
  const proof = validatePaymentProof(photo);
  if (!proof.success) return proof;

  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  // Throttle per IP+booth so a script can't enumerate the small sequential
  // order numbers and mass-flip a booth's orders to 'claimed'. Fails open on
  // limiter errors (don't block a real customer on infra hiccups).
  const ip = clientIp(await headers());
  const allowed = await rateLimit(`claim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts. Wait a moment." };

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, total_cents, payment_status, payment_proof_path, status, created_at",
    )
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return { success: false, error: "Invalid order" };
  const refusal = claimRefusal(order);
  if (refusal) return { success: false, error: refusal };

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id, print_enabled")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return { success: false, error: "Invalid order" };

  // No resize here. pay-form.tsx already resized to <=1600px WebP/JPEG in
  // the browser; resizeToWebp needs a <canvas>, so calling it again in this
  // server action only ever threw internally and fell back to the original
  // file. paymentProofSchema above is what bounds the size server-side.
  const contentType = proof.data.type as PaymentProofType;
  const buffer = await proof.data.arrayBuffer();
  const hash = await hashBuffer(buffer);
  const path = `${booth.vendor_id}/${order.id}.${PAYMENT_PROOF_EXTENSIONS[contentType]}`;

  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(path, buffer, { upsert: true, contentType });
  if (uploadError) {
    console.error("claimPayment: proof upload failed", uploadError.message);
    return { success: false, error: "Could not upload photo. Try again." };
  }

  const transaction = await transactionIdForOrder({
    vendorId: booth.vendor_id,
    amountCents: order.total_cents,
    orderRef: order.id,
  });
  if (!transaction.ok) {
    console.error(
      "claimPayment: paykit transaction lookup failed",
      transaction.error,
    );
    return { success: false, error: "Could not record payment. Try again." };
  }
  const claim = await claimCheckout(transaction.data);
  if (!claim.ok) {
    console.error("claimPayment: paykit claim failed", claim.error);
    return { success: false, error: "Could not record payment. Try again." };
  }
  if (claim.data.status === "pending")
    return { success: false, error: "Could not record payment. Try again." };

  const finalized = await finalizePaidOrder(
    { id: order.id, boothId },
    {
      status: claim.data.status,
      confirmedAt: claim.data.confirmedAt,
      proof: { path, hash },
    },
  );
  if (!finalized.ok)
    return { success: false, error: "Could not finalize order. Try again." };

  return { success: true, orderNumber: finalized.orderNumber };
}

// Undo an accidental "I've paid" tap: revert a still-unverified 'claimed'
// order back to 'pending'. Mirror of claimPayment, same idempotency shape.
//
// There's no stored paykit transaction id for an order, so it is looked up
// by the order's id (transactionIdForOrder), the same way claimPayment above
// and confirmOrderPayment (dashboard/order-actions.ts) reach it.
// `unclaimCheckout` is paykit's own authority on whether a revert is still
// allowed — it refuses to revert a 'confirmed' transaction and just echoes
// that status back, so the pre-check below (against the local mirror) is a
// fast path, not the only guard against un-confirming real money.
export async function unclaimPayment(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(`unclaim:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts. Wait a moment." };

  const ctx = await loadCheckoutContext(supabase, boothId, orderNumber, token);
  if (!ctx) return { success: false, error: "Invalid order" };
  if (ctx.paymentStatus === "pending") return { success: true };
  if (ctx.paymentStatus === "confirmed")
    return {
      success: false,
      error: "The stall already confirmed your payment.",
    };
  if (ctx.paymentStatus === "not_required")
    return { success: false, error: "This order doesn't take payment." };

  const transaction = await transactionIdForOrder({
    vendorId: ctx.vendorId,
    amountCents: ctx.totalCents,
    orderRef: ctx.orderId,
  });
  if (!transaction.ok) {
    console.error(
      "unclaimPayment: paykit transaction lookup failed",
      transaction.error,
    );
    return { success: false, error: "Could not undo. Try again." };
  }

  const unclaim = await unclaimCheckout(transaction.data);
  if (!unclaim.ok) {
    console.error("unclaimPayment: paykit unclaim failed", unclaim.error);
    return { success: false, error: "Could not undo. Try again." };
  }
  if (unclaim.data.status === "confirmed")
    return {
      success: false,
      error: "The stall already confirmed your payment.",
    };
  if (unclaim.data.status !== "pending")
    return { success: false, error: "Could not undo. Try again." };

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "pending" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("payment_status", "claimed")
    .neq("status", "cancelled")
    .select("id");
  if (error)
    console.error("unclaimPayment: local mirror update failed", error.message);

  return { success: true };
}
