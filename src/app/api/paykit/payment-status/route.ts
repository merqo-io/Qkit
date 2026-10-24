import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { paykitCallbackBearerOk } from "@/lib/qkit-paykit-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCheckoutByOrderRef,
  type CheckoutLookup,
} from "@/lib/paykit/client";
import {
  finalizePaidOrder,
  writePaidMirror,
} from "@/app/order/[boothId]/[orderNumber]/finalize-paid-order";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

// Only order_ref is read. paykit also sends transaction_id and status, and
// both are ignored on purpose: the status applied below is the one paykit
// answers with when asked, so a forged, replayed or out-of-order body can
// never set a status paykit does not hold. The uuid check also keeps the
// value safe to use as a filter.
const bodySchema = z.object({ order_ref: z.uuid() });

type CallbackOrder = {
  id: string;
  booth_id: string;
  status: string;
  order_number: string | null;
  payment_status: string;
  total_cents: number;
};

function unavailable() {
  return NextResponse.json({ error: "Upstream unavailable" }, { status: 503 });
}

function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

/**
 * Applies the status paykit holds to one live, payment-taking order.
 *  - claimed or confirmed, no number yet: finalizePaidOrder (number, alert,
 *    print job, mirror).
 *  - claimed or confirmed, already numbered: the mirror only. Finalizing
 *    again would alert and could print for an order that was announced long
 *    ago.
 *  - pending: a claimed mirror goes back to pending, the same write the
 *    customer's own undo makes.
 */
async function applyPaykitStatus(
  supabase: ServiceClient,
  order: CallbackOrder,
  held: CheckoutLookup,
) {
  if (held.status === "pending") {
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "pending" })
      .eq("id", order.id)
      .eq("payment_status", "claimed")
      .neq("status", "cancelled");
    if (error) {
      console.error(
        "paykit payment-status callback: revert failed",
        error.message,
      );
      return unavailable();
    }
    return NextResponse.json({ ok: true });
  }

  const payment = { status: held.status, confirmedAt: held.confirmedAt };
  if (order.order_number) {
    await writePaidMirror(supabase, order.id, payment);
    return NextResponse.json({ ok: true });
  }

  const finalized = await finalizePaidOrder(
    { id: order.id, boothId: order.booth_id },
    payment,
  );
  return finalized.ok ? NextResponse.json({ ok: true }) : unavailable();
}

/**
 * paykit calls this after a payment's status changes. The body is a hint
 * that something changed for one order; what changed is read back from
 * paykit. Nothing is applied unless paykit can be reached and the
 * transaction it holds matches this order's vendor and total.
 */
export async function POST(request: Request) {
  if (!paykitCallbackBearerOk(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The secret is the real gate. This blunts a leaked one: every accepted
  // call costs a request to paykit.
  const allowed = await rateLimit(
    `paykit-payment-status:${clientIp(request.headers)}`,
    120,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid order_ref" }, { status: 400 });

  const supabase = await createServiceClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, booth_id, status, order_number, payment_status, total_cents")
    .eq("id", parsed.data.order_ref)
    .maybeSingle();
  if (orderError) {
    console.error(
      "paykit payment-status callback: order read failed",
      orderError.message,
    );
    return unavailable();
  }
  if (!order)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // No vendor is signed in here, so the vendor of record is the owner of the
  // order's own booth.
  const { data: booth, error: boothError } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", order.booth_id)
    .maybeSingle();
  if (boothError) {
    console.error(
      "paykit payment-status callback: booth read failed",
      boothError.message,
    );
    return unavailable();
  }
  if (!booth?.vendor_id)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // A plain lookup, never transactionIdForOrder: that helper creates a
  // checkout when paykit has none, and a callback must not create anything.
  const held = await getCheckoutByOrderRef(order.id);
  if (!held.ok) {
    console.error(
      "paykit payment-status callback: lookup failed",
      held.status,
      held.error,
    );
    return held.status === 404
      ? conflict("paykit holds no payment for this order")
      : unavailable();
  }
  if (
    held.data.vendorId !== booth.vendor_id ||
    held.data.amountCents !== order.total_cents
  ) {
    console.error(
      "paykit payment-status callback: transaction does not match the order",
      order.id,
    );
    return conflict("Payment does not match this order");
  }

  if (order.status === "cancelled") {
    console.error(
      "paykit payment-status callback: cancelled order left unchanged",
      order.id,
      held.data.status,
    );
    return NextResponse.json({ ok: true, ignored: "cancelled" });
  }
  if (order.payment_status === "not_required") {
    console.error(
      "paykit payment-status callback: order does not take payment",
      order.id,
      held.data.status,
    );
    return NextResponse.json({ ok: true, ignored: "not_required" });
  }

  return applyPaykitStatus(supabase, order, held.data);
}
