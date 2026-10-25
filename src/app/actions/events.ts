"use server";

import { z } from "zod";
import { headers } from "next/headers";
// eslint-disable-next-line no-restricted-imports -- event rows have no client write policy; input is validated first
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Json } from "@/lib/types";

// Allowlist of trackable events. Reject anything else so the table can't be
// stuffed with arbitrary types from the client.
// - landing_cta / upgrade_cta: marketing-funnel CTA clicks.
// - booth_view / order_placed: the customer ordering funnel — a QR landing
//   (OrderForm mount) and a successful order. Their ratio is the scan→order
//   conversion the pilot measures. Both carry `{ boothId }` in metadata.
const eventTypeSchema = z.enum([
  "landing_cta",
  "upgrade_cta",
  "booth_view",
  "order_placed",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * Best-effort analytics. Fire-and-forget: validates the type, inserts via the
 * service client after validation, and never throws to the caller — analytics
 * must not disrupt the user flow.
 *
 * `metadata` (e.g. `{ feature: "stock" }` on an upgrade_cta) is best-effort too:
 * a non-object or oversized value is dropped rather than risking the insert.
 */
export async function logEvent(
  type: EventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const parsed = eventTypeSchema.safeParse(type);
  if (!parsed.success) return;
  // Drop a non-object OR an oversized/unserializable metadata blob so a caller
  // can't stuff the events table.
  let safeMeta: Record<string, unknown> | undefined;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    try {
      if (JSON.stringify(metadata).length <= 1000) safeMeta = metadata;
    } catch {
      // unserializable (e.g. circular) — drop it
    }
  }
  try {
    const supabase = await createServiceClient();
    // Generous limit — several of these fire per page visit.
    const ip = clientIp(await headers());
    const allowed = await rateLimit(`event:${ip}`, 40, 60);
    if (!allowed) return;
    await supabase.from("events").insert({
      type: parsed.data,
      ...(safeMeta ? { metadata: safeMeta as Json } : {}),
    });
  } catch {
    // swallow — table may not exist yet, or insert may fail; analytics is
    // non-critical.
  }
}
