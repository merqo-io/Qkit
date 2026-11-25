import { notFound } from "next/navigation";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { servableBoothIds, isBoothPaused } from "@/lib/booth/access";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { vendorPaymentSetup } from "@/lib/paykit/payment-setup";
import { BoothQrPoster } from "./booth-qr-poster";
import { GoLiveCard, type PaymentStep } from "./go-live-card";

const PAYKIT_FALLBACK_URL = "https://paykit.merqo.io";

function paymentStepOf(
  state: Awaited<ReturnType<typeof vendorPaymentSetup>>["state"],
): PaymentStep {
  if (state === "unreachable") return "unknown";
  return state === "none" ? "missing" : "ready";
}

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function BoothQrPage({ params }: Props) {
  const { boothId } = await params;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, is_active, short_code, created_at, menu_items");

  const booth = booths?.find((b) => b.id === boothId);
  if (!booth) notFound();

  const overLimit = isBoothPaused(
    booth,
    servableBoothIds(booths ?? [], entitlement),
  );

  const menuReady = parseMenuItems(booth.menu_items).some((m) => m.available);
  const paymentSetup = await vendorPaymentSetup(vendor.id);
  const paykitBase = process.env.NEXT_PUBLIC_PAYKIT_URL ?? PAYKIT_FALLBACK_URL;

  return (
    <BoothQrPoster
      boothId={booth.id}
      name={booth.name}
      isActive={booth.is_active}
      overLimit={overLimit}
      maxBooths={entitlement.maxBooths}
      code={booth.short_code}
      goLive={
        <GoLiveCard
          boothId={booth.id}
          code={booth.short_code}
          menuReady={menuReady}
          payment={paymentStepOf(paymentSetup.state)}
          paymentUrl={new URL("/dashboard/config", paykitBase).href}
        />
      }
    />
  );
}
