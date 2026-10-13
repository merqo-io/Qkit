import { paymentMarkerSchema } from "@/lib/schemas";
import type { PaymentKind } from "@/lib/types";

/**
 * `booths.payment` holds only a `{kind}` marker. The full payment details
 * (payee, UEN, link, QR image) live in paykit, vendor-wide. The marker stays
 * because `qkit.place_order` and `qkit.place_walkup_order` read
 * `booths.payment->>'kind'` to decide whether a new order starts out owing
 * payment, and SQL has no way to ask paykit.
 *
 * Everything that reads or writes the marker goes through this file, so the
 * app cannot disagree with itself about what a stored value means.
 */

/**
 * The kind stored on a booth, or null for a booth with no payment set up or
 * a value that is not a marker at all. Reads only the discriminant, so a row
 * that still holds a whole config from before the details moved to paykit
 * reads as its kind. `stripe`, which SQL's check still allows and nothing
 * ever stored, reads as none: the same answer `place_walkup_order` gives.
 */
export function paymentKindOf(data: unknown): PaymentKind | null {
  const parsed = paymentMarkerSchema.safeParse(data);
  return parsed.success ? parsed.data.kind : null;
}

/** Whether orders at a booth of this kind start out owing payment. */
export function expectsPayment(kind: PaymentKind | null): boolean {
  return kind !== null;
}

/** The marker to store for a booth of this kind, or null for no payment. */
export function paymentMarker(
  kind: PaymentKind | null,
): { kind: PaymentKind } | null {
  return kind ? { kind } : null;
}
