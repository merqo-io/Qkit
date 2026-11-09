"use server";

import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { feedbackSchema, type FeedbackInput } from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * Submit in-product feedback (customer post-order or vendor). Public insert (RLS
 * allows anyone), validated, and rate-limited per IP to stop spam. Vendor source
 * stamps the signed-in vendor id; customer source stays anonymous.
 */
export async function submitFeedback(
  input: FeedbackInput,
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid feedback");
  const d = parsed.data;

  const supabase = await createServerClient();

  // Throttle: 3 submissions / 5 min per IP.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(`feedback:${ip}`, 3, 300);
  if (!allowed) return fail("Thanks, you've already sent feedback.");

  // Insert via a SECURITY DEFINER RPC: the feedback table has no public INSERT
  // policy (a public WITH CHECK(true) would let any JWT forge reviews). The
  // RPC re-derives vendor_id from the caller's own session (auth.uid()) for the
  // vendor source, so it can't be spoofed via a param.
  const { error } = await supabase.rpc("submit_feedback", {
    p_source: d.source,
    p_booth_id: d.boothId ?? undefined,
    p_order_number: d.orderNumber ?? undefined,
    // Customer feedback is authorized by the order's access token; the RPC
    // rejects a customer review whose (booth, order, token) doesn't match.
    p_access_token: d.token ?? undefined,
    p_rating: d.rating ?? undefined,
    p_nps: d.nps ?? undefined,
    p_message: d.message && d.message.length > 0 ? d.message : undefined,
  });
  if (error) {
    console.error("submitFeedback failed", error.message);
    return fail("Could not send feedback");
  }
  return ok();
}
