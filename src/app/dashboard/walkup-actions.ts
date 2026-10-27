"use server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import {
  placeOrderSchema,
  type PlaceOrderInput,
  uuidSchema,
} from "@/lib/schemas";
import { createCheckout, type CheckoutView } from "@/lib/paykit/client";
import { notifyPrintkit } from "@/app/o/[code]/notify";
import { paymentDeadline } from "@/lib/orders";
import type { ActionResult } from "@/lib/action-result";

/**
 * What the walk-up dialog needs to collect payment for an order it has just
 * placed unpaid: the order to confirm, the server-priced amount, and the
 * booth's own payment view (PayNow QR with that amount filled in, payment
 * link, or QR image). `checkout` is null when paykit could not be reached;
 * the order is still payable, staff just take the money another way.
 */
export interface WalkupPayment {
  orderId: string;
  amountCents: number;
  checkout: CheckoutView | null;
}

type Result = ActionResult<{
  orderNumber: string;
  accessToken: string;
  payment: WalkupPayment | null;
}>;

/**
 * The payment still owed on a walk-up order that was just placed, or null
 * when there is nothing to collect (the booth takes no payment, the order is
 * free, or staff already marked it paid). Runs after the order exists, so it
 * never throws and never fails the placement: a miss here only means the
 * dialog skips its payment step and the ticket keeps its own "Mark as paid".
 */
async function pendingPayment(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothId: string,
  accessToken: string,
): Promise<WalkupPayment | null> {
  try {
    // RLS scopes this to the caller's own orders. The token is the one the
    // RPC handed back a moment ago, so it names exactly this order.
    const { data: order } = await supabase
      .from("orders")
      .select("id, total_cents, payment_status, created_at")
      .eq("booth_id", boothId)
      .eq("access_token", accessToken)
      .maybeSingle();
    if (!order || order.payment_status !== "pending") return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Same order reference, so the same paykit transaction that
    // confirmOrderPayment later finds (order_ref is the idempotency key).
    const checkout = await createCheckout({
      vendorId: user.id,
      amountCents: order.total_cents,
      orderRef: order.id,
      expiresAt: paymentDeadline(order.created_at),
    });
    return {
      orderId: order.id,
      amountCents: order.total_cents,
      checkout: checkout.ok ? checkout.data : null,
    };
  } catch (err) {
    console.error("placeWalkupOrder: payment lookup failed", err);
    return null;
  }
}

// Map a place_walkup_order RAISE prefix to a vendor-facing message. Mirrors
// o/[code]/actions.ts#messageFor, minus the customer-only cases (ORDER_
// EXPIRED, ORDER_UNSERVABLE) that don't apply here — staff standing at the
// counter is the authority on whether they can take this order, not the
// booth's schedule/serviceability (see migration 0060's comment).
function messageFor(raw: string): string {
  if (raw.includes("ORDER_UNAUTHORIZED")) return "Not your booth.";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "An item just sold out. Adjust the order.";
  if (raw.includes("ORDER_CAP_REACHED"))
    return "This booth has hit its item limit for today. Raise or clear the limit in booth settings to keep serving.";
  if (raw.includes("ORDER_RATE_LIMITED"))
    return "Too many orders too fast. Wait a moment and try again.";
  return "Could not place order. Please try again.";
}

/**
 * Staff-entered order from the dashboard live board, for a customer at the
 * counter (no QR/phone). Goes through place_walkup_order (migration 0061,
 * originally 0060) — a SECURITY DEFINER RPC that checks the caller owns
 * boothId, reprices every line from the stored menu (same trust boundary as
 * the customer path: a client-sent price is never trusted), and stamps
 * source='walkup'. Reuses placeOrderSchema: identical item shape to the
 * customer cart. `paid` places the order already settled; it's a no-op when
 * the booth doesn't take payment at all (place_walkup_order ignores it for a
 * not_required order). The dialog always passes false and collects payment
 * afterwards instead: an unpaid order comes back with `payment`, which is
 * what its payment step shows the customer.
 */
export async function placeWalkupOrder(
  boothId: string,
  input: PlaceOrderInput,
  paid: boolean,
): Promise<Result> {
  if (!uuidSchema.safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  if (!z.boolean().safeParse(paid).success)
    return { success: false, error: "Invalid payment state" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("place_walkup_order", {
    p_booth_id: boothId,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
    p_paid: paid,
  });
  if (error) {
    const message = messageFor(error.message);
    if (message === "Could not place order. Please try again.")
      console.error("placeWalkupOrder failed", error.message);
    return { success: false, error: message };
  }

  const out = z
    .object({ order_number: z.string(), access_token: z.string() })
    .safeParse(data);
  if (!out.success) {
    console.error("placeWalkupOrder: malformed RPC output");
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }

  if (paid) await notifyPrintkit(boothId, out.data.order_number);

  return {
    success: true,
    orderNumber: out.data.order_number,
    accessToken: out.data.access_token,
    payment: paid
      ? null
      : await pendingPayment(supabase, boothId, out.data.access_token),
  };
}
