import { getEarnOffer } from "@/lib/loopkit/earn-offer";

export async function EarnLink({
  orderId,
  vendorId,
  loopkitBaseUrl = process.env.NEXT_PUBLIC_LOOPKIT_URL,
}: {
  orderId: string;
  vendorId: string;
  loopkitBaseUrl?: string;
}) {
  // No fallback host: unset means loopkit isn't configured, so no link.
  if (!loopkitBaseUrl) return null;
  const offer = await getEarnOffer(vendorId);
  if (!offer.enabled) return null;

  return (
    <a
      href={`${loopkitBaseUrl}/earn?order=${encodeURIComponent(orderId)}`}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Earn a stamp{offer.program_name ? `, ${offer.program_name}` : ""} →
    </a>
  );
}
