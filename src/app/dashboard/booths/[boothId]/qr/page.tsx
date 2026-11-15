import { notFound } from "next/navigation";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { servableBoothIds, isBoothPaused } from "@/lib/booth/access";
import { createServerClient } from "@/lib/supabase/server";
import { BoothQrPoster } from "./booth-qr-poster";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function BoothQrPage({ params }: Props) {
  const { boothId } = await params;
  const { entitlement } = await requireEntitledVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, is_active, short_code, created_at");

  const booth = booths?.find((b) => b.id === boothId);
  if (!booth) notFound();

  const overLimit = isBoothPaused(
    booth,
    servableBoothIds(booths ?? [], entitlement),
  );

  return (
    <BoothQrPoster
      boothId={booth.id}
      name={booth.name}
      isActive={booth.is_active}
      overLimit={overLimit}
      maxBooths={entitlement.maxBooths}
      code={booth.short_code}
    />
  );
}
