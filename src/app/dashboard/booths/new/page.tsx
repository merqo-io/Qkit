import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { canAddBooth } from "@/lib/plan";
import { vendorPaymentSetup } from "@/lib/paykit/payment-setup";
import { BoothForm } from "../booth-form";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

export default async function NewBoothPage({ searchParams }: Props) {
  const { vendor, entitlement } = await requireEntitledVendor();
  const { mode } = await searchParams;
  const eventMode = mode === "event";

  // Plan gate: only the qkit tier or a running Event Pass has more than one
  // booth. RLS is the real backstop; this just sends them to the plan page
  // instead of a failed save.
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("booths")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendor.id);
  if (!canAddBooth(entitlement, count ?? 0)) {
    redirect("/dashboard/plan");
  }

  // The Payment section names what the vendor already has on file in
  // paykit. The new booth itself still opens taking no payment.
  const paymentSetup = await vendorPaymentSetup(vendor.id);

  return (
    <div className="mx-auto max-w-lg md:max-w-4xl">
      {eventMode ? (
        <div className="mb-6 space-y-1.5">
          <h1 className="font-display text-3xl font-semibold">
            Set up for an event
          </h1>
          <p className="text-sm text-muted-foreground">
            This booth defaults to staff entering every order at the counter, no
            QR scanning required. To take payments and cover the whole event,
            set up payment in the Payment section below.
          </p>
        </div>
      ) : (
        <h1 className="font-display mb-6 text-3xl font-semibold">New booth</h1>
      )}
      <BoothForm
        vendorId={vendor.id}
        entitlement={entitlement}
        vendorSocialLinks={vendor.social_links}
        paymentSetup={paymentSetup}
        eventMode={eventMode}
      />
    </div>
  );
}
