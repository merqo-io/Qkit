// Deliberately NOT a "use server" file, for the reason at the top of
// src/app/o/[code]/notify.ts: every export of one is a client-callable Server
// Action. Called only by loadPreClaimContext (./payment-actions.ts) and the paykit
// callback route (src/app/api/paykit/payment-status/route.ts), each of which
// has already established that paykit holds the payment being recorded.

// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { notifyVendorTelegram, notifyPrintkit } from "@/app/o/[code]/notify";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export type PaidOrderPayment = {
  status: "claimed" | "confirmed";
  confirmedAt?: string | null;
};

export type FinalizeResult = { ok: true; orderNumber: string } | { ok: false };

// A fixed clock hour, and no longer: the limiter's cleanup deletes any row
// whose window began over an hour ago, so a longer window would be forgotten
// early. The customer's claim and paykit's callback arrive within the same
// second, so they share a window unless the hour turns between them.
const ALERT_ONCE_WINDOW_SECONDS = 3_600;

function writeForward(
  supabase: ServiceClient,
  orderId: string,
  payment: PaidOrderPayment,
) {
  if (payment.status === "confirmed")
    return supabase
      .from("orders")
      .update({
        payment_status: "confirmed",
        paid_at: payment.confirmedAt ?? new Date().toISOString(),
      })
      .eq("id", orderId)
      .neq("payment_status", "not_required")
      .or("payment_status.neq.confirmed,paid_at.is.null")
      .select("id");
  return supabase
    .from("orders")
    .update({ payment_status: "claimed" })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id");
}

/**
 * Moves an order's local payment mirror forward to the status paykit holds.
 * Forward only: `claimed` never overwrites `confirmed`, and nothing here ever
 * returns an order to `pending`. Safe to repeat. Failures are logged, not
 * thrown: paykit already holds the payment, so a missed mirror write must not
 * fail the caller.
 *
 * The payment screenshot is not part of the mirror. paykit holds it with the
 * transaction, and `orders.payment_proof_path` / `payment_proof_hash` are
 * written by nothing: they remain only on orders claimed before that moved.
 */
export async function writePaidMirror(
  supabase: ServiceClient,
  orderId: string,
  payment: PaidOrderPayment,
): Promise<void> {
  const { error } = await writeForward(supabase, orderId, payment);
  if (error)
    console.error("writePaidMirror: mirror update failed", error.message);
}

/**
 * Assigns the order number before writing the payment mirror. Claims alert
 * the vendor but do not print. Confirmed payments print after the mirror;
 * notifyPrintkit rechecks the stored payment and fulfillment state.
 * Number assignment and printkit's order key make retries idempotent.
 */
export async function finalizePaidOrder(
  order: { id: string; boothId: string },
  payment: PaidOrderPayment,
): Promise<FinalizeResult> {
  const supabase = await createServiceClient();

  const { data: orderNumber, error: assignError } = await supabase.rpc(
    "assign_order_number",
    { p_order_id: order.id },
  );
  if (assignError || !orderNumber) {
    console.error(
      "finalizePaidOrder: assign_order_number failed",
      assignError?.message,
    );
    return { ok: false };
  }

  const firstAlert = await rateLimit(
    `paid-order-alert:${order.id}`,
    1,
    ALERT_ONCE_WINDOW_SECONDS,
  );
  if (firstAlert) await notifyVendorTelegram(order.boothId, orderNumber);

  await writePaidMirror(supabase, order.id, payment);
  if (payment.status === "confirmed")
    await notifyPrintkit(order.boothId, orderNumber);

  return { ok: true, orderNumber };
}
