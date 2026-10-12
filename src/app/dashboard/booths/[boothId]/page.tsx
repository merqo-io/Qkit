import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import {
  parseMenuItems,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import { getBookingStatus, type BookingStatus } from "@/lib/paykit/client";
import { savedVendorPayment } from "@/lib/paykit/saved-vendor-payment";
import { BoothForm } from "../booth-form";
import type { PaymentConfig } from "@/lib/types";
import { paymentKindOf } from "@/lib/payment-marker";

/**
 * The booth's payment method with every detail blank, from its `{kind}`
 * marker alone (see `@/lib/payment-marker`). Used when paykit's
 * `getVendorConfig` call fails or reports nothing (e.g. `PAYKIT_KIT_SECRET`
 * unset in this environment): it can only re-select the right radio option.
 */
function initialPaymentFromMarker(data: unknown): PaymentConfig | null {
  const kind = paymentKindOf(data);
  if (kind === "paynow") return { kind: "paynow", payee_name: "" };
  if (kind === "pointer") return { kind: "pointer", label: "" };
  return null;
}

/**
 * What the Payment section opens on. The booth's own marker decides whether
 * this booth takes payment at all; paykit's details only fill the fields in.
 * Those details are vendor-wide, so reading them alone opened every booth as
 * "PayNow", including one saved with no online payment, and the next save of
 * anything on the page then switched payment on for it.
 */
function initialPayment(
  boothPayment: unknown,
  saved: PaymentConfig | null,
): PaymentConfig | null {
  const marker = initialPaymentFromMarker(boothPayment);
  if (!marker) return null;
  return saved ?? marker;
}

/**
 * Read-only booking-status prefill for `BookingStatusSection`. `null` when
 * no `paykit_booking_id` is set (nothing to fetch — the section then shows
 * only the input field) or when paykit's read fails/degrades (unreachable,
 * `PAYKIT_KIT_SECRET` unset) — a degrade here never blocks the rest of the
 * page from rendering.
 */
async function initialBookingStatus(
  paykitBookingId: string | null,
): Promise<BookingStatus | null> {
  if (!paykitBookingId) return null;
  const result = await getBookingStatus(paykitBookingId);
  return result.ok ? result.data : null;
}

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function EditBoothPage({ params }: Props) {
  const { boothId } = await params;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select(
      "id, name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm, walkup_default, print_enabled, paykit_booking_id, daily_cup_cap, max_items_per_order",
    )
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  const menuItemCount = parseMenuItems(booth.menu_items).length;

  const [savedPayment, bookingStatus] = await Promise.all([
    savedVendorPayment(vendor.id),
    initialBookingStatus(booth.paykit_booking_id),
  ]);
  const payment = initialPayment(booth.payment, savedPayment);

  return (
    <div className="mx-auto max-w-lg md:max-w-4xl">
      <h1 className="font-display mb-6 text-3xl font-semibold">Edit booth</h1>
      <BoothForm
        vendorId={vendor.id}
        entitlement={entitlement}
        vendorSocialLinks={vendor.social_links}
        savedPayment={savedPayment}
        initial={{
          boothId: booth.id,
          name: booth.name,
          image_url: booth.image_url,
          is_active: booth.is_active,
          hours: parseBoothHours(booth.hours),
          menuItemCount,
          payment,
          social_links: booth.social_links
            ? parseSocialLinks(booth.social_links)
            : null,
          requires_arrival_confirm: booth.requires_arrival_confirm,
          walkup_default: booth.walkup_default,
          print_enabled: booth.print_enabled,
          paykit_booking_id: booth.paykit_booking_id,
          daily_cup_cap: booth.daily_cup_cap,
          max_items_per_order: booth.max_items_per_order,
          bookingStatus,
        }}
      />
    </div>
  );
}
