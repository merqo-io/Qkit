import { redirect, notFound } from "next/navigation";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/schemas";

interface Props {
  params: Promise<{ boothId: string }>;
}

// Compatibility shim for the /order/{boothId} route: three callers only know the
// booth id — the reorder button, the status page's "Order again" link, and any
// shared/printed /order/{boothId} URL. Resolve the booth's short code and redirect
// to /o/{short_code} so those links keep working and the reorder handoff
// (sessionStorage keyed by boothId, read on the menu page) survives the hop.
// Service client: the customer is anonymous and anon cannot read booths directly.
export default async function OrderBoothRedirect({ params }: Props) {
  const { boothId } = await params;
  if (!uuidSchema.safeParse(boothId).success) notFound();

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("booths")
    .select("short_code")
    .eq("id", boothId)
    .single();

  if (!data?.short_code) notFound();
  redirect(`/o/${data.short_code}`);
}
