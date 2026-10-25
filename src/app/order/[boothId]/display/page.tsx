import { notFound } from "next/navigation";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { getBoothQueueDisplay } from "./actions";
import { QueueDisplay } from "./queue-display";
import { uuidSchema } from "@/lib/schemas";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

/**
 * Public, unauthenticated TV/second-screen view of one booth's live queue —
 * meant to run on a screen near the booth, not a customer's own phone (see
 * ./README.md). No token, same trust model as the public /order/{boothId}
 * menu route: the booth id in the URL isn't a secret.
 */
export default async function BoothQueueDisplayPage({ params }: Props) {
  const { boothId } = await params;
  if (!uuidSchema.safeParse(boothId).success) notFound();

  const supabase = await createServiceClient();
  const { data: booth } = await supabase
    .from("booths")
    .select("name")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth) notFound();

  const initialOrders = (await getBoothQueueDisplay(boothId)) ?? [];

  return (
    <QueueDisplay
      boothId={boothId}
      boothName={booth.name}
      initialOrders={initialOrders}
    />
  );
}
