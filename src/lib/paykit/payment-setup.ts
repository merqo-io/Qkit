import { getVendorConfig } from "./client";
import type { PaymentKind } from "@/lib/types";

/**
 * What a vendor has on file in paykit, as much as qkit needs to show: which
 * kind it is and the vendor's own name for it (the PayNow payee name, or the
 * label of a payment link or QR image). The details themselves (UEN, mobile
 * number, link, image) are entered and kept in paykit, and never come here.
 *
 * A config only counts when it can take a payment: PayNow needs a payee name
 * and a UEN or mobile number, a pointer needs a link or QR image. A half-saved
 * config reads as `none`.
 *
 * `unreachable` is a different answer from `none`: paykit did not say, so
 * nothing may be concluded about what is on file.
 */
export type PaymentSetup =
  | { state: "unreachable" }
  | { state: "none" }
  | { state: "paynow"; name: string }
  | { state: "link"; name: string }
  | { state: "image"; name: string };

/** Vendor-wide, not per booth: every booth of a vendor shares one setup. */
export async function vendorPaymentSetup(
  vendorId: string,
): Promise<PaymentSetup> {
  const result = await getVendorConfig(vendorId);
  if (!result.ok) return { state: "unreachable" };

  const d = result.data;
  if (!d.hasConfig) return { state: "none" };
  if (d.kind === "paynow") {
    const usable = Boolean(d.payeeName) && Boolean(d.uen || d.mobile);
    return usable
      ? { state: "paynow", name: d.payeeName ?? "" }
      : { state: "none" };
  }
  if (d.kind !== "pointer") return { state: "none" };
  if (d.url) return { state: "link", name: d.label ?? "" };
  if (d.qrImageUrl) return { state: "image", name: d.label ?? "" };
  return { state: "none" };
}

/**
 * The kind a booth's `{kind}` marker takes from this setup, or null when
 * there is nothing to take payment with (or paykit did not say).
 */
export function setupKind(setup: PaymentSetup): PaymentKind | null {
  if (setup.state === "paynow") return "paynow";
  if (setup.state === "link" || setup.state === "image") return "pointer";
  return null;
}
