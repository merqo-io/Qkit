"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimitStrict } from "@/lib/rate-limit";
import { parseAvailability, type Availability } from "@/lib/availability";
import { uuidSchema } from "@/lib/schemas";

// Only what a hold counts: which item and how many. Options and prices are
// irrelevant to stock, which is pooled per menu item.
const holdLinesSchema = z
  .array(
    z.object({
      menuItemId: z.string().min(1).max(64),
      quantity: z.number().int().positive().max(50),
    }),
  )
  .max(50);

export type HoldLine = z.infer<typeof holdLinesSchema>[number];

/**
 * Hold what is in this basket against the booth's stock and return what the
 * customer can still add, net of other baskets (hold_cart, migration 0096).
 * An empty basket releases the hold. Returns null when the call could not be
 * made; the caller keeps whatever it was showing, since a hold is a courtesy
 * to other customers and place_order is the real limit.
 */
export async function holdCart(
  boothId: string,
  session: string,
  lines: HoldLine[],
): Promise<Availability | null> {
  if (!uuidSchema.safeParse(boothId).success) return null;
  if (!uuidSchema.safeParse(session).success) return null;
  const parsed = holdLinesSchema.safeParse(lines);
  if (!parsed.success) return null;

  // The honest-path per-IP guard. Generous, since a venue's shared wifi puts a
  // whole queue behind one address; hold_cart carries its own booth-scoped
  // guard for a direct RPC call that skips this action.
  const ip = clientIp(await headers());
  if (!(await rateLimitStrict(`hold:${boothId}:${ip}`, 240, 60))) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("hold_cart", {
    p_booth_id: boothId,
    p_session: session,
    p_items: parsed.data,
  });
  if (error) {
    console.error("hold_cart failed", error.message);
    return null;
  }
  return parseAvailability(data);
}

/**
 * What the customer can still add, without touching their hold: the menu
 * page's periodic refresh, which must not keep an idle basket's hold alive.
 */
export async function readAvailability(
  boothId: string,
  session: string,
): Promise<Availability | null> {
  if (!uuidSchema.safeParse(boothId).success) return null;
  if (!uuidSchema.safeParse(session).success) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("booth_availability", {
    p_booth_id: boothId,
    p_session: session,
  });
  if (error) {
    console.error("booth_availability failed", error.message);
    return null;
  }
  return parseAvailability(data);
}
