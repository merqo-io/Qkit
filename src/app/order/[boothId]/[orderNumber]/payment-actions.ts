"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseOrderRef, parsePreClaimRef } from "@/lib/schemas";
import { createCheckout, unclaimCheckout } from "@/lib/paykit/client";
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
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
 * *succeeded* (see dashboard/order-actions.ts's
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
 * What the pay step needs for a payment-required order that has no
 * order_number yet (numbering is deferred to a successful claim). The
 * customer pays on paykit's page, so the only thing to hand back for a
 * pending order is where that page is.
 */
type PreClaimContext =
  | { state: "pay"; payUrl: string }
  | { state: "placed"; orderNumber: string }
  | { state: "cancelled" }
  // Unpaid past the abandoned-payment window: no longer payable.
  | { state: "expired" }
  // paykit could not be reached, or did not answer with a pay page.
  | { state: "unavailable" };

// paykit shows this above the amount; its own limit is 120 characters.
const PAY_TITLE_MAX = 120;

type PayStepInput = {
  vendorId: string;
  boothName: string;
  order: { id: string; total_cents: number };
  boothId: string;
  token: string;
  origin: string;
};

// Ask paykit for the order's checkout, then either send the customer to its
// pay page or, when paykit already holds the payment, finish the order.
async function payStep(input: PayStepInput): Promise<PreClaimContext> {
  const { order, boothId, token } = input;
  const checkout = await createCheckout({
    vendorId: input.vendorId,
    amountCents: order.total_cents,
    orderRef: order.id,
    returnUrl: `${input.origin}/order/${boothId}/pay?t=${token}`,
    title: input.boothName.slice(0, PAY_TITLE_MAX),
  });
  if (!checkout.ok) return { state: "unavailable" };

  if (checkout.data.status && checkout.data.status !== "pending") {
    const finalized = await finalizePaidOrder(
      { id: order.id, boothId },
      { status: checkout.data.status },
    );
    return finalized.ok
      ? { state: "placed", orderNumber: finalized.orderNumber }
      : { state: "unavailable" };
  }
  return checkout.data.payUrl
    ? { state: "pay", payUrl: checkout.data.payUrl }
    : { state: "unavailable" };
}

/**
 * Decide what the pay step does for one order: send the customer to
 * paykit's pay page, or, when the customer has already paid and is coming
 * back from it, give the order its number.
 *
 * `origin` is this app's own origin, which paykit compares with the one
 * registered for qkit before it will send a customer back to it. The pay link
 * is minted on every call (paykit retires the previous one), so the caller
 * redirects to it at once.
 *
 * Coming back, paykit may have claimed the payment before its callback
 * reached `/api/paykit/payment-status`. The answer to `createCheckout` says
 * where the payment stands, so this finalizes the order itself in that case;
 * `finalizePaidOrder` repeats safely when the callback arrives as well.
 */
export async function loadPreClaimContext(
  boothId: string,
  token: string,
  origin: string,
): Promise<PreClaimContext | null> {
  const parsed = parsePreClaimRef(boothId, token);
  if (!parsed.ok) return null;

  const supabase = await createServiceClient();

  // This one makes a real outbound call to paykit (createCheckout) on every
  // invocation, so page-reload-style abuse is capped tighter than a cheap
  // local read.
  const allowed = await rateLimit(
    `pre-claim-context:${boothId}:${token}`,
    20,
    60,
  );
  if (!allowed) return null;

  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, payment_status, status, order_number, created_at")
    .eq("booth_id", boothId)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return null;
  if (order.status === "cancelled") return { state: "cancelled" };

  // A claimed or confirmed order with no number is one whose finalizing did
  // not finish: it goes on to the checkout below, which finishes it.
  const paidWithoutNumber =
    !order.order_number &&
    (order.payment_status === "claimed" ||
      order.payment_status === "confirmed");
  if (order.payment_status !== "pending" && !paidWithoutNumber)
    return order.order_number
      ? { state: "placed", orderNumber: order.order_number }
      : null;
  // Checked before createCheckout, so an expired order mints no pay link.
  if (
    order.payment_status === "pending" &&
    isAbandonedPayment(order.created_at, Date.now())
  )
    return { state: "expired" };

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id, name")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.vendor_id) return null;

  return payStep({
    vendorId: booth.vendor_id,
    boothName: booth.name,
    order,
    boothId,
    token,
    origin,
  });
}

// Undo an accidental "I've paid" tap: revert a still-unverified 'claimed'
// order back to 'pending'. Same idempotency shape as the claim on paykit's page.
//
// There's no stored paykit transaction id for an order, so it is looked up
// by the order's id (transactionIdForOrder), the same way confirmOrderPayment (dashboard/order-actions.ts) reaches it.
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
