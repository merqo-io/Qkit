"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServiceClient } from "@/lib/supabase/server";
import {
  bannerFormSchema,
  uuidSchema,
  type BannerFormInput,
} from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { forgetPlatformSettings } from "@/lib/platform-settings";
import { SHOWCASE_TAG } from "@/lib/landing/showcase-tag";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";

const resolveMessageSchema = z.object({ id: uuidSchema });

/** Mark a vendor's help request resolved once handled. Admin-only. */
export async function resolveSupportMessage(
  input: z.infer<typeof resolveMessageSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = resolveMessageSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input");

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
    return fail("Could not resolve");
  }

  await recordAudit({
    admin_id: user.id,
    action: "resolve_support_message",
    target_id: updated.user_id,
    detail: { message_id: parsed.data.id },
  });

  revalidatePath("/admin");
  return ok();
}

/**
 * Update the site-wide maintenance banner (the single `platform_settings`
 * row, id pinned to 1). Informational
 * only: this never blocks any functionality, it just toggles a banner shown
 * in the root layout. Admin-only.
 */
export async function setBanner(input: BannerFormInput): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = bannerFormSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input");

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
    return fail("Could not update banner");
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
  return ok();
}

const showcaseSchema = z.object({ id: uuidSchema, show: z.boolean() });

/**
 * Switch a vendor's presence in the landing page's "Vendors on qkit" showcase.
 * The vendor's permission is collected offline before this is flipped. Written
 * with the service client because the column is in no vendor's UPDATE grant.
 * Admin-only.
 */
export async function setVendorShowcase(
  input: z.infer<typeof showcaseSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = showcaseSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input");

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("vendors")
    .update({ showcase_on_landing: parsed.data.show })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error(
      "setVendorShowcase failed",
      error?.message ?? "no row updated",
    );
    return fail("Could not update the landing page setting");
  }

  await recordAudit({
    admin_id: user.id,
    action: "set_vendor_showcase",
    target_id: parsed.data.id,
    detail: { showcase_on_landing: parsed.data.show },
  });

  updateTag(SHOWCASE_TAG);
  revalidatePath(`/admin/vendors/${parsed.data.id}`);
  revalidatePath("/admin/vendors");
  return ok();
}
