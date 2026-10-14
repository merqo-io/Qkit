"use server";

import { createServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/schemas";

// Both queries run on the authenticated client, not service-role — RLS's
// existing orders_vendor_select policy and the payment_proofs_vendor_select
// storage policy (migration 0087) already scope both reads to the caller's
// own vendor, so no extra vendor check is needed here.

export async function getProofPhotoUrl(
  orderId: string,
): Promise<string | null> {
  if (!uuidSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_path")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_path) return null;

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(order.payment_proof_path, 300);
  if (error || !data) {
    console.error("getProofPhotoUrl failed", error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Another order of this vendor's claimed with the same screenshot file. It
 * returns the row, not a number: the vendor knows that order by the number on
 * its board card, which can be the day's rank rather than `order_number`.
 */
export async function findDuplicateProofOrder(orderId: string): Promise<{
  booth_id: string;
  order_number: string | null;
  created_at: string;
} | null> {
  if (!uuidSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_hash")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_hash) return null;

  const { data: match } = await supabase
    .from("orders")
    .select("booth_id, order_number, created_at")
    .eq("payment_proof_hash", order.payment_proof_hash)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();

  return match ?? null;
}
