// Deliberately NOT a "use server" file, for the reason at the top of
// src/app/o/[code]/notify.ts: every export of one is a client-callable Server
// Action. Called only by claimPayment (./payment-actions.ts) and the paykit
// callback route (src/app/api/paykit/payment-status/route.ts), each of which
// has already established that paykit holds the payment being recorded.

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
 * Everything an order needs once paykit holds a payment for it: its number,
 * the vendor's alert, the print job, and the local mirror. In that order, and
 * the order matters: the mirror is written last so the customer's pay page
 * never sees "paid" on an order that has no number yet.
 *
 * Safe to run more than once for one order, including at the same moment,
 * which is the normal case: paykit's callback arrives while the customer's
 * own claim is still running.
 *  - The number: qkit.assign_order_number returns the existing one.
 *  - The vendor alert: sent only by the run the limiter allows, once per
 *    order per clock hour. The limiter fails open, so a limiter outage can
 *    repeat an alert. The run that is allowed is the only one that tries: if
 *    its send fails, no later run retries it.
 *  - The print job: printkit keeps one per order, so notifyPrintkit is
 *    attempted every time and prints once.
 *  - The mirror: see writePaidMirror.
 *
 * It does not check that the order is still live. Callers do that before
 * they ask paykit for anything.
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
  await Promise.all([
    firstAlert
      ? notifyVendorTelegram(order.boothId, orderNumber)
      : Promise.resolve(),
    notifyPrintkit(order.boothId, orderNumber),
  ]);

  await writePaidMirror(supabase, order.id, payment);

  return { ok: true, orderNumber };
}
