"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { patchVendorProfile } from "@/lib/merqo/vendor-profile";
import {
  profileNameSchema,
  socialLinksSchema,
  type ProfileNameInput,
  type SocialLinksInput,
} from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * Update the vendor's stall name. Persisted in merqo.vendor_profile (shared
 * across kits, see docs/superpowers/specs/2026-07-16-shared-vendor-profile-design.md)
 * via the patch_vendor_profile RPC — not a local qkit.vendors write.
 */
export async function updateStallName(
  input: ProfileNameInput,
): Promise<ActionResult> {
  const parsed = profileNameSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid stall name");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in");

  try {
    await patchVendorProfile(supabase, user.id, {
      stallName: parsed.data.name,
    });
  } catch (err) {
    console.error(
      "updateStallName failed",
      err instanceof Error ? err.message : err,
    );
    return fail("Could not save stall name");
  }

  // Refresh the layout so the header + account menu pick up the new name.
  revalidatePath("/dashboard", "layout");
  return ok();
}

/**
 * Update the vendor's profile-level default social/website links. Same
 * merqo.vendor_profile write path as updateStallName.
 */
export async function updateSocialLinks(
  input: SocialLinksInput,
): Promise<ActionResult> {
  const parsed = socialLinksSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid links");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in");

  try {
    await patchVendorProfile(supabase, user.id, { socialLinks: parsed.data });
  } catch (err) {
    console.error(
      "updateSocialLinks failed",
      err instanceof Error ? err.message : err,
    );
    return fail("Could not save links");
  }

  revalidatePath("/dashboard", "layout");
  return ok();
}
