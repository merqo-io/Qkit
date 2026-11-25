import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { servableBoothIds, isBoothPaused } from "@/lib/booth/access";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { vendorPaymentSetup } from "@/lib/paykit/payment-setup";
import { BoothQrPoster } from "./booth-qr-poster";
import { paykitSetupUrl } from "@/lib/paykit/setup-url";
import { requestOrigin } from "@/lib/request-origin";
import { GoLiveCard, PaymentRow } from "./go-live-card";
import { paymentStepOf } from "./payment-step";

export const revalidate = 0;

async function LivePaymentRow({
  vendorId,
  paymentUrl,
}: {
  vendorId: string;
  paymentUrl: string;
}) {
  const setup = await vendorPaymentSetup(vendorId);
  return (
    <PaymentRow payment={paymentStepOf(setup.state)} paymentUrl={paymentUrl} />
  );
}

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
  const origin = await requestOrigin();
  const paymentUrl = paykitSetupUrl(
    origin ? `${origin}/dashboard/booths/${booth.id}/qr` : null,
  );

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
          paymentRow={
            <Suspense
              fallback={
                <PaymentRow payment="checking" paymentUrl={paymentUrl} />
              }
            >
              <LivePaymentRow vendorId={vendor.id} paymentUrl={paymentUrl} />
            </Suspense>
          }
        />
      }
    />
  );
}
