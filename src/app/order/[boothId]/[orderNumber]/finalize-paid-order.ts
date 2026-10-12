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
  proof?: { path: string; hash: string };
};

export type FinalizeResult = { ok: true; orderNumber: string } | { ok: false };

// A fixed UTC day. Long enough that the customer's own claim and paykit's
// callback, which arrive within the same second, share one window.
const ALERT_ONCE_WINDOW_SECONDS = 86_400;

function proofPatch(payment: PaidOrderPayment) {
  return payment.proof
    ? {
        payment_proof_path: payment.proof.path,
        payment_proof_hash: payment.proof.hash,
      }
    : {};
}

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
        ...proofPatch(payment),
      })
      .eq("id", orderId)
      .neq("payment_status", "not_required")
      .or("payment_status.neq.confirmed,paid_at.is.null")
      .select("id");
  return supabase
    .from("orders")
    .update({ payment_status: "claimed", ...proofPatch(payment) })
    .eq("id", orderId)
    .in("payment_status", payment.proof ? ["pending", "claimed"] : ["pending"])
    .select("id");
}

/**
 * Moves an order's local payment mirror forward to the status paykit holds.
 * Forward only: `claimed` never overwrites `confirmed`, and nothing here ever
 * returns an order to `pending`. Safe to repeat. Failures are logged, not
 * thrown: paykit already holds the payment, so a missed mirror write must not
 * fail the caller.
 *
 * When a screenshot is given and the order is already further along than the
 * status being recorded (paykit's callback got there first), the screenshot
 * is still written, by itself.
 */
export async function writePaidMirror(
  supabase: ServiceClient,
  orderId: string,
  payment: PaidOrderPayment,
): Promise<void> {
  const { data: rows, error } = await writeForward(supabase, orderId, payment);
  if (error) {
    console.error("writePaidMirror: mirror update failed", error.message);
    return;
  }
  if ((rows ?? []).length > 0 || !payment.proof) return;

  const { error: proofError } = await supabase
    .from("orders")
    .update(proofPatch(payment))
    .eq("id", orderId);
  if (proofError)
    console.error("writePaidMirror: proof update failed", proofError.message);
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
 *    order per day. The limiter fails open, so a limiter outage can repeat an
 *    alert and cannot lose one.
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
