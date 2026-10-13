"use server";

import { createServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/schemas";
import {
  getCheckoutByOrderRef,
  getCheckoutEvidence,
} from "@/lib/paykit/client";
import { getProofPhotoUrl, findDuplicateProofOrder } from "./proof-actions";

export type OrderPaymentProof = {
  /** A link to the screenshot that expires after 300 seconds, or null. */
  url: string | null;
  /** The number of another of this vendor's orders that used the same file. */
  duplicateOrderNumber: string | null;
  /** The same file was used for a payment this board cannot name. */
  duplicateElsewhere: boolean;
  /** paykit's own reading of the amount; null when it did not check. */
  amountMatch: boolean | null;
};

type SessionClient = Awaited<ReturnType<typeof createServerClient>>;

const NOTHING: OrderPaymentProof = {
  url: null,
  duplicateOrderNumber: null,
  duplicateElsewhere: false,
  amountMatch: null,
};

/**
 * An order claimed before screenshots moved to paykit: the file is in qkit's
 * own `payment-proofs` bucket and its hash on the order row. Both reads are
 * scoped by RLS and by the bucket's own-folder policy.
 */
async function legacyProof(orderId: string): Promise<OrderPaymentProof> {
  const [url, duplicateOrderNumber] = await Promise.all([
    getProofPhotoUrl(orderId),
    findDuplicateProofOrder(orderId),
  ]);
  return { ...NOTHING, url, duplicateOrderNumber };
}

/**
 * paykit names a duplicate by the other transaction's kit and order
 * reference. A qkit reference is an order id, so it resolves to a number
 * when the signed-in vendor can read that order (RLS decides). Anything else
 * is reported without a number.
 */
async function resolveDuplicate(
  supabase: SessionClient,
  duplicate: { orderRef: string; kitSlug: string } | null,
): Promise<
  Pick<OrderPaymentProof, "duplicateOrderNumber" | "duplicateElsewhere">
> {
  if (!duplicate)
    return { duplicateOrderNumber: null, duplicateElsewhere: false };
  if (
    duplicate.kitSlug === "qkit" &&
    uuidSchema.safeParse(duplicate.orderRef).success
  ) {
    const { data: other } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", duplicate.orderRef)
      .maybeSingle();
    if (other?.order_number)
      return {
        duplicateOrderNumber: other.order_number,
        duplicateElsewhere: false,
      };
  }
  return { duplicateOrderNumber: null, duplicateElsewhere: true };
}

/**
 * The payment screenshot for one order and what is known about it, for the
 * board's proof viewer. This is the viewer's only read.
 *
 * Ownership is settled here, with the vendor's own session, before paykit is
 * asked anything: RLS has to return the order, and the order's booth has to
 * belong to the signed-in user. The second check is not redundant. An admin
 * account can read every vendor's orders, and paykit trusts the calling kit,
 * so without it an admin could open another vendor's payment screenshot.
 * paykit's transaction must then belong to that same vendor.
 *
 * Returns null when the caller may not see this order's proof or the order
 * does not exist, and an answer with `url: null` when there is no screenshot
 * or paykit could not be reached.
 */
export async function getOrderPaymentProof(
  orderId: string,
): Promise<OrderPaymentProof | null> {
  if (!uuidSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: order } = await supabase
    .from("orders")
    .select("id, booth_id, payment_proof_path")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", order.booth_id)
    .maybeSingle();
  if (!booth || booth.vendor_id !== user.id) return null;

  if (order.payment_proof_path) return legacyProof(order.id);

  const transaction = await getCheckoutByOrderRef(order.id);
  if (!transaction.ok) {
    if (transaction.status !== 404)
      console.error(
        "getOrderPaymentProof: paykit lookup failed",
        transaction.error,
      );
    return NOTHING;
  }
  if (transaction.data.vendorId !== user.id) {
    console.error("getOrderPaymentProof: transaction of another vendor");
    return null;
  }

  const evidence = await getCheckoutEvidence(transaction.data.transactionId);
  if (!evidence.ok) {
    console.error(
      "getOrderPaymentProof: paykit evidence failed",
      evidence.error,
    );
    return NOTHING;
  }

  return {
    url: evidence.data.proofUrl,
    amountMatch: evidence.data.amountMatch,
    ...(await resolveDuplicate(supabase, evidence.data.duplicateOf)),
  };
}
