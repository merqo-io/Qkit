import { notFound } from "next/navigation";
import { orderBoothIdSchema } from "@/lib/schemas";
// eslint-disable-next-line no-restricted-imports -- anonymous kiosk page; reads one public flag by booth id, server-only
import { createServiceClient } from "@/lib/supabase/server";
import { PickupScanner } from "./pickup-scanner";

interface Props {
  params: Promise<{ boothId: string }>;
}

export const revalidate = 0;

/**
 * Public, unattended self-checkout pickup kiosk — see ./README.md. No login,
 * no per-order secret in the URL: authorization lives in the token the
 * scanned QR carries, checked by confirmCollection.
 */
export default async function PickupPage({ params }: Props) {
  const { boothId } = await params;
  if (!orderBoothIdSchema.safeParse(boothId).success) notFound();

  const supabase = await createServiceClient();
  const { data: booth } = await supabase
    .from("booths")
    .select("pickup_scan_enabled")
    .eq("id", boothId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      {booth?.pickup_scan_enabled === true ? (
        <PickupScanner boothId={boothId} />
      ) : (
        <p className="max-w-md text-center text-lg text-muted-foreground">
          Self-checkout pickup is off for this booth. Ask staff for your order.
        </p>
      )}
    </div>
  );
}
