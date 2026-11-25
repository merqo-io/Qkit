"use server";

import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import { createServerClient } from "@/lib/supabase/server";
import { sampleMenuItems } from "@/lib/booth/sample-menu";
import {
  menuItemsInputSchema,
  uuidSchema,
  type MenuItemFormInput,
} from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * One-tap starter menu for a booth with no items. Only writes while the stored
 * menu is empty and guards on `menu_revision`, so a double tap or a second
 * request can never add the drinks twice.
 */
export async function seedSampleMenu(
  boothId: string,
): Promise<ActionResult<{ items: MenuItemFormInput[] }>> {
  if (!uuidSchema.safeParse(boothId).success) return fail("Invalid booth");

  const { user, entitlement } = await loadEntitlement();
  if (!user) return fail("Not authenticated");

  const parsed = menuItemsInputSchema.safeParse(sampleMenuItems());
  if (!parsed.success) return fail("Could not add the sample menu");

  if (
    entitlement.maxMenuItems !== null &&
    parsed.data.length > entitlement.maxMenuItems
  )
    return fail(
      `Your plan allows up to ${entitlement.maxMenuItems} menu items. Remove some to add more.`,
    );

  const supabase = await createServerClient();

  // RLS scopes this to the vendor's own booths; a foreign id reads null.
  const { data: prev } = await supabase
    .from("booths")
    .select("menu_items, menu_revision")
    .eq("id", boothId)
    .maybeSingle();
  if (!prev) return fail("Booth not found");
  if (Array.isArray(prev.menu_items) && prev.menu_items.length > 0)
    return fail("This booth already has menu items");

  const { data: updated, error } = await supabase
    .from("booths")
    .update({ menu_items: parsed.data, menu_revision: prev.menu_revision + 1 })
    .eq("id", boothId)
    .eq("menu_revision", prev.menu_revision)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not add the sample menu");
  if (!updated)
    return fail(
      "This menu changed in another tab or device. Reload the page and try again.",
    );

  return ok({ items: parsed.data });
}
