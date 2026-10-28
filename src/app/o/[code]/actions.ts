"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  placeOrderSchema,
  type PlaceOrderInput,
  uuidSchema,
} from "@/lib/schemas";
import { logEvent } from "@/app/actions/events";
import type { ActionResult } from "@/lib/action-result";
import { notifyVendorTelegram } from "./notify";

type Result = ActionResult<{
  orderNumber: string | null;
  boothId: string;
  accessToken: string;
}>;

const codeSchema = z.string().min(1).max(64);

const GENERIC_FAILURE = "Could not place order. Please try again.";

// Map a place_order RAISE prefix to a customer-facing message.
function messageFor(raw: string): string {
  if (raw.includes("ORDER_EXPIRED")) return "This code expired. Please rescan.";
  if (raw.includes("ORDER_UNSERVABLE"))
    return "This booth isn't taking orders right now";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "Sorry, an item just sold out. Please adjust your order.";
  if (raw.includes("ORDER_CAP_REACHED"))
    return "This stall has served everything it had.";
  if (raw.includes("ORDER_TOO_LARGE"))
    return "That is more than this stall takes in one order. Remove a few items and try again.";
  if (raw.includes("ORDER_RATE_LIMITED"))
    return "Too many orders too fast. Wait a moment and try again.";
  return GENERIC_FAILURE;
}

/**
 * Let go of the basket hold the order came from (qkit.cart_holds, migration
 * 0096): the order now counts against stock itself, and leaving the hold up
 * would count the same items twice for its remaining minutes. Best-effort
 * and never throws; an unreleased hold simply expires.
 */
async function releaseHold(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothId: string,
  holdSession: string | undefined,
): Promise<void> {
  if (!uuidSchema.safeParse(holdSession).success) return;
  try {
    await supabase.rpc("hold_cart", {
      p_booth_id: boothId,
      p_session: holdSession as string,
      p_items: [],
    });
  } catch {
    // The hold lapses by itself within five minutes.
  }
}

export async function placeOrder(
  code: string,
  input: PlaceOrderInput,
  idempotencyKey: string,
  holdSession?: string,
): Promise<Result> {
  if (!codeSchema.safeParse(code).success)
    return { success: false, error: "This code expired. Please rescan." };
  if (!uuidSchema.safeParse(idempotencyKey).success)
    return { success: false, error: "Invalid request" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  // Anti-flood (best-effort). Fails open. This
  // is the honest-path per-IP guard; place_order also carries a booth-scoped
  // limiter so a direct RPC call that skips this action is still bounded.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(`order:${code}:${ip}`, 8, 60);
  if (!allowed)
    return {
      success: false,
      error: "Too many orders too fast. Wait a moment and try again.",
    };

  // Blank ("" or whitespace-only, from a field left empty) is treated the same
  // as omitted — both skip the merqo.customers write. See placeOrderSchema's
  // customerPhone comment for why this normalization lives here, not in the
  // schema itself.
  const phone =
    parsed.data.customerPhone && parsed.data.customerPhone.length > 0
      ? parsed.data.customerPhone
      : undefined;

  const { data, error } = await supabase.rpc("place_order", {
    p_short_code: code,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
    p_idempotency_key: idempotencyKey,
    p_customer_phone: phone,
  });
  if (error) {
    const message = messageFor(error.message);
    // Log only unexpected failures (those that fall through to the generic
    // message). Known business raises — sold out, expired, unservable, rate
    // limited — are normal outcomes, not bugs, so they'd only be log noise.
    if (message === GENERIC_FAILURE)
      console.error("placeOrder failed", error.message);
    return { success: false, error: message };
  }
  const out = z
    .object({
      order_number: z.string().nullable(),
      booth_id: z.string(),
      access_token: z.string(),
    })
    .safeParse(data);
  if (!out.success) {
    // The RPC succeeded but returned an unexpected shape — a real bug worth a log.
    console.error("placeOrder: malformed RPC output");
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }
  // Funnel: an order landed. Paired with booth_view (QR landing) to measure
  // scan→order conversion. logEvent is best-effort and never throws, so awaiting
  // it can't fail a placed order.
  await logEvent("order_placed", { boothId: out.data.booth_id });
  await releaseHold(supabase, out.data.booth_id, holdSession);

  if (out.data.order_number) {
    await notifyVendorTelegram(out.data.booth_id, out.data.order_number);
  }

  return {
    success: true,
    orderNumber: out.data.order_number,
    boothId: out.data.booth_id,
    accessToken: out.data.access_token,
  };
}
