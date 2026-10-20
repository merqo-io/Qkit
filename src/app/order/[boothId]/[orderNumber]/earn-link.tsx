import { z } from "zod";

const MERQO_METRICS_SECRET = process.env.MERQO_METRICS_SECRET ?? "";

const earnConfigSchema = z.object({
  enabled: z.boolean(),
  program_name: z.string().max(200).optional(),
});
type EarnConfig = z.infer<typeof earnConfigSchema>;

async function fetchEarnConfig(
  loopkitUrl: string,
  vendorId: string,
): Promise<EarnConfig> {
  try {
    const res = await fetch(
      `${loopkitUrl}/api/merqo/qkit-earn-config?vendor_id=${encodeURIComponent(vendorId)}`,
      {
        headers: { Authorization: `Bearer ${MERQO_METRICS_SECRET}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return { enabled: false };
    const parsed = earnConfigSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : { enabled: false };
  } catch {
    // Fail closed: never blocks the order page, the link just doesn't show.
    return { enabled: false };
  }
}

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
  const config = await fetchEarnConfig(loopkitBaseUrl, vendorId);
  if (!config.enabled) return null;

  return (
    <a
      href={`${loopkitBaseUrl}/earn?order=${encodeURIComponent(orderId)}`}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Earn a stamp{config.program_name ? `, ${config.program_name}` : ""} →
    </a>
  );
}
