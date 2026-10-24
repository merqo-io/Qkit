"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import type { ActionResult } from "@/lib/action-result";

const renameSchema = z.object({
  licenseId: z.uuid(),
  // Empty clears the label (reverts to the dated default).
  label: z.string().trim().max(80),
});

/**
 * Rename a paid pass to the vendor's event-day name. Authorization is enforced
 * twice: the action requires a signed-in vendor, and `set_license_label`
 * (SECURITY DEFINER) only updates a license whose `vendor_id = auth.uid()`.
 */
export async function renameEvent(input: {
  licenseId: string;
  label: string;
}): Promise<ActionResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid name" };

  const { user, vendor } = await loadEntitlement();
  if (!user || !vendor) return { success: false, error: "Not signed in" };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_license_label", {
    p_license_id: parsed.data.licenseId,
    p_label: parsed.data.label || null,
  });
  if (error) {
    console.error("renameEvent failed", error.message);
    return { success: false, error: "Could not rename. Please try again." };
  }

  revalidatePath("/dashboard/stats");
  return { success: true };
}
