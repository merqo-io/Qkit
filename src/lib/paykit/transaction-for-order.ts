import {
  createCheckout,
  getCheckoutByOrderRef,
  type PaykitResult,
} from "./client";

// 404: paykit has no transaction for this order (a walk-up order whose pay
// step never reached paykit). 405: that paykit deployment has no lookup
// route. Both fall back to creating the checkout, which is idempotent on the
// order reference.
const FALL_BACK_TO_CREATE = new Set<number | null>([404, 405]);

/**
 * The paykit transaction id for one of qkit's orders. Looks it up, and only
 * creates a checkout when paykit has none. A found transaction is refused
 * when it belongs to another vendor or its amount differs from the order's.
 * Looking up first matters: creating re-renders from the vendor's current
 * payment config and is refused once that config has changed, which would
 * leave an order already awaiting payment impossible to confirm, claim or
 * undo.
 */
export async function transactionIdForOrder(args: {
  vendorId: string;
  amountCents: number;
  orderRef: string;
}): Promise<PaykitResult<string>> {
  const found = await getCheckoutByOrderRef(args.orderRef);
  if (found.ok) {
    // This 409 is chosen by qkit, not sent by paykit: do not read it as a paykit status.
    if (found.data.vendorId !== args.vendorId)
      return {
        ok: false,
        status: 409,
        error: "Checkout belongs to a different vendor",
      };
    if (found.data.amountCents !== args.amountCents)
      return {
        ok: false,
        status: 409,
        error: "Checkout amount does not match this order",
      };
    return { ok: true, data: found.data.transactionId };
  }
  if (!FALL_BACK_TO_CREATE.has(found.status)) return found;

  const created = await createCheckout(args);
  return created.ok ? { ok: true, data: created.data.transactionId } : created;
}
