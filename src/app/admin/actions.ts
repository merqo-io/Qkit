"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/access";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bannerFormSchema,
  grantPassSchema,
  pricingFormSchema,
  MAX_MONEY_CENTS,
  type BannerFormInput,
  type GrantPassInput,
  type PricingFormInput,
} from "@/lib/schemas";
import { MS_PER_DAY } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { forgetPlatformSettings } from "@/lib/platform-settings";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";

const setPlanSchema = z.object({
  vendorId: z.uuid(),
  plan: z.enum(["free", "pro"]),
  // When flipping to pro against a real (non-comp) payment, record it.
  amountCents: z.number().int().nonnegative().max(MAX_MONEY_CENTS).optional(),
  note: z.string().max(200).optional(),
});

/**
 * Flip a vendor's plan. Admin-only: requireAdmin() 404s non-admins before any
 * write. Uses the service-role client (allowed in Server Actions) because RLS
 * scopes vendor UPDATE to self — an admin edits other vendors' rows.
 */
export async function setVendorPlan(
  input: z.infer<typeof setPlanSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = setPlanSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();

  // Read the current plan first, so we only record a payment on an actual
  // free→pro transition. Re-submitting (or double-clicking) an already-pro
  // vendor is idempotent for the plan, and must not append a second payment row
  // — that would double-count subscription revenue.
  const { data: current } = await supabase
    .from("vendors")
    .select("plan")
    .eq("id", parsed.data.vendorId)
    .maybeSingle();
  const wasAlreadyPro = current?.plan === "pro";

  const { data: updated, error } = await supabase
    .from("vendors")
    .update({ plan: parsed.data.plan })
    .eq("id", parsed.data.vendorId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("setVendorPlan failed", error?.message ?? "no row updated");
    return { success: false, error: "Could not update plan" };
  }

  // Record subscription revenue when flipping to pro against a real payment
  // (blank/0 = a comp, no ledger row). Only on a genuine transition.
  const amount = parsed.data.amountCents ?? 0;
  let paymentFailed = false;
  if (parsed.data.plan === "pro" && amount > 0 && !wasAlreadyPro) {
    const { error: payError } = await supabase.from("payments").insert({
      vendor_id: parsed.data.vendorId,
      kind: "subscription",
      amount_cents: amount,
      source: "paynow",
      note: parsed.data.note ?? null,
    });
    if (payError) {
      console.error("payment insert failed", payError.message);
      paymentFailed = true;
    }
  }

  // Audit trail of who changed what (records the change regardless).
  await recordAudit({
    admin_id: user.id,
    action: "set_plan",
    target_id: parsed.data.vendorId,
    detail: { to: parsed.data.plan, amount_cents: amount },
  });

  // Upgrading clears any pending request the vendor filed (best-effort).
  if (parsed.data.plan === "pro")
    await resolveVendorRequests(supabase, parsed.data.vendorId);

  revalidatePath("/admin");
  // The plan flip succeeded but the ledger row didn't land — surface it rather
  // than returning success and letting the payments ledger silently diverge from
  // the audit trail (the admin can add the row manually).
  if (paymentFailed)
    return {
      success: false,
      error:
        "Plan updated, but recording the payment failed. Add it to the ledger manually.",
    };
  return { success: true };
}

// Mark a vendor's pending upgrade requests resolved — called when an admin
// fulfils them by granting a pass / Pro. Best-effort, never blocks the action.
async function resolveVendorRequests(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status: "resolved" })
      .eq("vendor_id", vendorId)
      .eq("status", "pending");
    if (error) console.error("resolveVendorRequests failed", error.message);
  } catch (error) {
    console.error("resolveVendorRequests failed", error);
  }
}

/**
 * Mint a time-boxed Pro pass for a vendor (manual fulfilment of a PayNow/cash
 * payment — Stripe is deferred until ACRA/UEN). Service-role insert; RLS blocks
 * client writes to licenses. Admin-only.
 */
export async function grantPass(input: GrantPassInput): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = grantPassSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  // The pass is a window: starts at validFrom (or now) and runs `days`.
  const validFrom = parsed.data.validFromIso ?? new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(validFrom) + parsed.data.days * MS_PER_DAY,
  ).toISOString();

  const supabase = await createServiceClient();
  const { data: license, error } = await supabase
    .from("licenses")
    .insert({
      vendor_id: parsed.data.vendorId,
      valid_from: validFrom,
      expires_at: expiresAt,
      source: "admin_manual",
      note: parsed.data.note ?? null,
    })
    .select("id")
    .single();
  if (error || !license) {
    console.error("grantPass failed", error?.message ?? "no row");
    return { success: false, error: "Could not grant pass" };
  }

  // Record the money separately in the revenue ledger (0 = free comp → no row).
  const amount = parsed.data.amountCents ?? 0;
  let paymentFailed = false;
  if (amount > 0) {
    const { error: payError } = await supabase.from("payments").insert({
      vendor_id: parsed.data.vendorId,
      kind: "pass",
      amount_cents: amount,
      source: "paynow",
      note: parsed.data.note ?? null,
      license_id: license.id,
    });
    if (payError) {
      console.error("payment insert failed", payError.message);
      paymentFailed = true;
    }
  }

  await recordAudit({
    admin_id: user.id,
    action: "grant_pass",
    target_id: parsed.data.vendorId,
    detail: {
      days: parsed.data.days,
      valid_from: validFrom,
      note: parsed.data.note ?? null,
      amount_cents: parsed.data.amountCents ?? 0,
    },
  });

  await resolveVendorRequests(supabase, parsed.data.vendorId);

  revalidatePath("/admin");
  // Pass granted but the ledger row didn't land — surface it rather than
  // silently diverging the ledger from the audit trail.
  if (paymentFailed)
    return {
      success: false,
      error:
        "Pass granted, but recording the payment failed. Add it to the ledger manually.",
    };
  return { success: true };
}

const resolveRequestSchema = z.object({ id: z.uuid() });

/** Dismiss a vendor's upgrade request once handled. Admin-only. */
export async function resolvePurchaseRequest(
  input: z.infer<typeof resolveRequestSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = resolveRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { data: updated, error } = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("id", parsed.data.id)
    .select("vendor_id")
    .maybeSingle();
  if (error) {
    console.error("resolvePurchaseRequest failed", error.message);
    return { success: false, error: "Could not resolve" };
  }

  if (updated)
    await recordAudit({
      admin_id: user.id,
      action: "resolve_purchase_request",
      target_id: updated.vendor_id,
      detail: { request_id: parsed.data.id },
    });

  revalidatePath("/admin");
  return { success: true };
}

const resolveMessageSchema = z.object({ id: z.uuid() });

/** Mark a vendor's help request resolved once handled. Admin-only. */
export async function resolveSupportMessage(
  input: z.infer<typeof resolveMessageSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = resolveMessageSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const merqoClient =
    supabase as unknown as SupabaseClient<MerqoSupportMessagesSchema>;
  const { data: updated, error } = await merqoClient
    .schema("merqo")
    .from("support_messages")
    .update({ status: "resolved" })
    .eq("id", parsed.data.id)
    .eq("kit_slug", "qkit")
    .select("user_id")
    .maybeSingle();
  if (error || !updated) {
    console.error(
      "resolveSupportMessage failed",
      error?.message ?? "no row updated",
    );
    return { success: false, error: "Could not resolve" };
  }

  await recordAudit({
    admin_id: user.id,
    action: "resolve_support_message",
    target_id: updated.user_id,
    detail: { message_id: parsed.data.id },
  });

  revalidatePath("/admin");
  return { success: true };
}

const revokePassSchema = z.object({ vendorId: z.uuid() });

/**
 * Revoke a vendor's live pass(es): end the window now (set expires_at = now)
 * rather than delete, so the record + its payment + audit trail survive. Revoke
 * removes access only — it is not a refund. Admin-only, service-role.
 */
export async function revokePass(
  input: z.infer<typeof revokePassSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = revokePassSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const nowIso = new Date().toISOString();
  const supabase = await createServiceClient();
  const { data: ended, error } = await supabase
    .from("licenses")
    .update({ expires_at: nowIso })
    .eq("vendor_id", parsed.data.vendorId)
    .gt("expires_at", nowIso)
    .select("id");
  if (error) {
    console.error("revokePass failed", error.message);
    return { success: false, error: "Could not revoke pass" };
  }

  await recordAudit({
    admin_id: user.id,
    action: "revoke_pass",
    target_id: parsed.data.vendorId,
    detail: { ended: ended?.length ?? 0 },
  });

  revalidatePath("/admin");
  return { success: true };
}

/** Update the single pricing row shown on the offer page. Admin-only. */
export async function setPricing(
  input: PricingFormInput,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = pricingFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const updated_at = new Date().toISOString();

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pricing")
    .update({
      event_pass_cents: parsed.data.event_pass_cents,
      monthly_cents: parsed.data.monthly_cents,
      updated_at,
    })
    .eq("id", 1);
  if (error) {
    console.error("setPricing failed", error.message);
    return { success: false, error: "Could not update pricing" };
  }

  await recordAudit({
    admin_id: user.id,
    action: "set_pricing",
    detail: {
      event_pass_cents: parsed.data.event_pass_cents,
      monthly_cents: parsed.data.monthly_cents,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard/plan");
  return { success: true };
}

/**
 * Update the site-wide maintenance banner (the single `platform_settings`
 * row, id pinned to 1 — same singleton shape as `pricing`). Informational
 * only: this never blocks any functionality, it just toggles a banner shown
 * in the root layout. Admin-only.
 */
export async function setBanner(input: BannerFormInput): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = bannerFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      banner_enabled: parsed.data.banner_enabled,
      banner_message: parsed.data.banner_message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("setBanner failed", error.message);
    return { success: false, error: "Could not update banner" };
  }

  await recordAudit({
    admin_id: user.id,
    action: "set_banner",
    detail: {
      banner_enabled: parsed.data.banner_enabled,
      banner_message: parsed.data.banner_message,
    },
  });

  forgetPlatformSettings();
  revalidatePath("/admin");
  return { success: true };
}
