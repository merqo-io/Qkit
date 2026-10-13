"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import type { Entitlement } from "@/lib/plan";
import {
  boothFormSchema,
  menuCategoriesSchema,
  menuItemsInputSchema,
  type BoothFormInput,
  type MenuItemFormInput,
} from "@/lib/schemas";
import type { MenuCategory } from "@/lib/types";
import {
  boothImagePaths,
  orphanedImagePaths,
  failedSaveUploadPaths,
} from "@/lib/booth/images";
import { setupKind, vendorPaymentSetup } from "@/lib/paykit/payment-setup";
import { registerPrintLocation } from "@/lib/printkit/client";
import { sweepUnsavedUploads } from "./sweep-unsaved-uploads";
import type { ActionResult } from "@/lib/action-result";
import type { Database, PaymentKind } from "@/lib/types";
import { paymentMarker } from "@/lib/payment-marker";

type BoothRow = Database["qkit"]["Tables"]["booths"]["Update"] & {
  name: string;
};

// Best-effort removal of orphaned booth-image objects. Never fails the caller —
// a leaked object is cost creep, not a correctness problem, whereas failing the
// save/delete over it would be worse. RLS scopes deletes to the vendor's folder.
async function removeBoothImages(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  paths: string[],
  context: string,
) {
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from("booth-images").remove(paths);
    if (error) console.error(`${context} image cleanup failed`, error.message);
  } catch (error) {
    console.error(`${context} image cleanup failed`, error);
  }
}

// Tells printkit whether this booth prints. Best-effort, same contract as
// notifyPrintkit: a failure is logged and never fails the caller. printkit
// keys the location on the booth id, so nothing from its answer is stored.
async function syncPrintLocation(
  vendorId: string,
  boothId: string,
  label: string,
  active: boolean,
  context: string,
) {
  try {
    const result = await registerPrintLocation({
      vendorId,
      sourceRef: boothId,
      label,
      active,
    });
    if (!result.ok)
      console.error(
        `${context}: registerPrintLocation failed`,
        result.status,
        result.error,
      );
  } catch (err) {
    console.error(`${context}: registerPrintLocation failed`, err);
  }
}

/**
 * Menu-item and option-group count caps (saveBooth's write-path guard).
 * Count caps reject (don't silently drop content — that would lose the
 * vendor's work). Returns an error message, or null when within plan limits.
 */
function validateMenuCaps(
  menuItems: MenuItemFormInput[],
  entitlement: Pick<Entitlement, "maxMenuItems" | "maxOptionGroupsPerItem">,
): string | null {
  if (
    entitlement.maxMenuItems !== null &&
    menuItems.length > entitlement.maxMenuItems
  )
    return `Your plan allows up to ${entitlement.maxMenuItems} menu items. Remove some or upgrade.`;

  const maxGroups = entitlement.maxOptionGroupsPerItem;
  if (
    maxGroups !== null &&
    menuItems.some((it) => (it.option_groups?.length ?? 0) > maxGroups)
  )
    return `Your plan allows up to ${maxGroups} customization groups per item. Upgrade for more.`;

  return null;
}

/**
 * Persist a booth row: UPDATE (reclaiming orphaned images afterward) when
 * `boothId` is set, INSERT otherwise. Isolated from saveBooth's validation/
 * gating phases above it — this is purely the write.
 */
async function upsertBoothRow(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  row: BoothRow,
  boothId: string | undefined,
  vendorId: string,
): Promise<SaveBoothResult> {
  if (boothId) {
    // Capture the currently-stored images before overwriting, to reclaim any
    // the new version no longer references (a replaced banner or a removed
    // item photo).
    const { data: prev } = await supabase
      .from("booths")
      .select("image_url, menu_items")
      .eq("id", boothId)
      .maybeSingle();

    // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
    const { data: updated, error } = await supabase
      .from("booths")
      .update(row)
      .eq("id", boothId)
      .select("id")
      .maybeSingle();
    if (error || !updated)
      return { success: false, error: "Could not save booth" };

    if (prev)
      await removeBoothImages(
        supabase,
        orphanedImagePaths(prev, row),
        "saveBooth",
      );
    return { success: true, boothId: updated.id };
  }

  const { data: inserted, error } = await supabase
    .from("booths")
    .insert({ ...row, vendor_id: vendorId })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("createBooth failed", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { success: false, error: "Could not create booth" };
  }
  return { success: true, boothId: inserted.id };
}

/**
 * Free-plan single-active-booth cap, shared by saveBooth (activating via the
 * full edit form) and toggleBoothActive (the quick pause/resume toggle).
 * Fails open on a count-read error (the DB booth_servable RLS rule is the
 * real backstop) but logs so a persistently-failing count isn't invisible.
 * Returns an error message, or null when the save/toggle may proceed.
 */
async function checkActiveBoothCap(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  vendorId: string,
  maxBooths: number,
  excludeBoothId: string | undefined,
  context: string,
): Promise<string | null> {
  let q = supabase
    .from("booths")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("is_active", true);
  if (excludeBoothId) q = q.neq("id", excludeBoothId);
  const { count, error } = await q;
  if (error) console.error(`${context} active-cap count failed`, error.message);
  if ((count ?? 0) >= maxBooths)
    return `Your plan serves ${maxBooths} open booth at a time. Pause another booth first, or upgrade.`;
  return null;
}

type SaveBoothResult = ActionResult<{ boothId: string }>;
type DeleteBoothResult = ActionResult;

/**
 * Hard-delete a booth and (via ON DELETE CASCADE, migration 0009) all of its
 * orders. RLS (booths_vendor_all) scopes the delete to the caller's own
 * booths, so a non-owner simply deletes zero rows — the 404-style "not found"
 * never reveals another vendor's booth. Also best-effort deregisters the
 * booth's printkit print location (active: false) — otherwise it stays
 * active forever on printkit's side, counting toward the vendor's
 * active-location total and breaking auto-delivery for their real remaining
 * booths. Never blocks the delete itself.
 */
export async function deleteBooth(boothId: string): Promise<DeleteBoothResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Read the referenced images (and the name, for the printkit deregister
  // call below) before the row is gone, so both can proceed after the delete.
  const { data: booth } = await supabase
    .from("booths")
    .select("name, image_url, menu_items")
    .eq("id", boothId)
    .maybeSingle();

  const { count, error } = await supabase
    .from("booths")
    .delete({ count: "exact" })
    .eq("id", boothId);
  if (error) return { success: false, error: "Could not delete booth" };
  if (!count) return { success: false, error: "Booth not found" };

  if (booth) {
    await removeBoothImages(supabase, boothImagePaths(booth), "deleteBooth");
    await syncPrintLocation(user.id, boothId, booth.name, false, "deleteBooth");
  }
  return { success: true };
}

/**
 * Rotate a booth's QR short code. RLS (booths_vendor_update) scopes the update to
 * the caller's own booths, so a non-owner updates zero rows and gets "not found"
 * — no cross-vendor leak. Invalidates every previously printed/saved QR link.
 */
export async function regenerateShortCode(
  boothId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: rows, error } = await supabase.rpc("regenerate_short_code", {
    p_booth_id: boothId,
  });
  if (error) return { success: false, error: "Could not regenerate QR" };
  if (!rows) return { success: false, error: "Booth not found" };

  revalidatePath(`/dashboard/booths/${boothId}/qr`);
  return { success: true };
}

// Bounds the client-supplied list of images a save uploaded. A booth form
// commits at most a banner.
const freshUploadsSchema = z.array(z.string().max(2048)).max(10);

/**
 * Save the booth form. `freshUploads` lists the images the form uploaded for
 * this save (its pending banner, committed on submit); if the save fails,
 * they are deleted here, where the vendor's own folder is known.
 */
export async function saveBooth(
  input: BoothFormInput,
  freshUploads: string[] = [],
): Promise<SaveBoothResult> {
  const result = await persistBooth(input);
  if (!result.success) await discardUnsavedUploads(freshUploads);
  return result;
}

async function discardUnsavedUploads(freshUploads: unknown) {
  const parsed = freshUploadsSchema.safeParse(freshUploads);
  if (!parsed.success || parsed.data.length === 0) return;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await removeBoothImages(
      supabase,
      failedSaveUploadPaths(parsed.data, user.id),
      "saveBooth",
    );
  } catch (error) {
    console.error("saveBooth image cleanup failed", error);
  }
}

// The booth-wide daily total is a stock cap, the same entitlement as the
// per-item sold-out limit, so a plan without it cannot set one. A limit
// already stored is left alone, though: the key is left out of the update
// rather than nulled, so saving a booth's name does not silently switch off
// a limit the stall is relying on. Removing it is always allowed, so a vendor
// is never stuck with a limit they cannot change. The per-order limit is for
// every tier.
function dailyCapPatch(
  entitlement: { stockCaps: boolean },
  cap: number | null,
  creating: boolean,
): { daily_cup_cap?: number | null } {
  if (entitlement.stockCaps) return { daily_cup_cap: cap };
  if (cap === null || creating) return { daily_cup_cap: null };
  return {};
}

/**
 * The booth's `{kind}` marker, from the form's switch and the kind paykit
 * holds for the vendor right now. The payment details are entered in paykit
 * and are vendor-wide, so the kind is read there at save time rather than
 * trusted from the form: a vendor who changed method in paykit gets the new
 * kind on the next save of each booth.
 *
 * Switch off: no payment, and paykit is not asked. Switch on with nothing on
 * file: no payment, since an order must not owe a payment nobody can make.
 * Switch on and paykit did not answer: the key is left out, so an update
 * keeps the marker the booth already has and the rest of the booth still
 * saves. `qkit.place_order` and `qkit.place_walkup_order` read this marker.
 */
async function paymentPatch(
  vendorId: string,
  takesPayment: boolean,
): Promise<{ payment?: { kind: PaymentKind } | null }> {
  if (!takesPayment) return { payment: null };
  const setup = await vendorPaymentSetup(vendorId);
  if (setup.state === "unreachable") {
    console.error("saveBooth: paykit unreachable, payment marker kept");
    return {};
  }
  return { payment: paymentMarker(setupKind(setup)) };
}

async function persistBooth(input: BoothFormInput): Promise<SaveBoothResult> {
  const parsed = boothFormSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid booth details" };
  const data = parsed.data;

  // Server-side entitlement enforcement (the UI also gates, but never trust it).
  const { user, entitlement } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  // Auto-close hours is Pro/pass — strip for free so a stored value can't
  // keep enforcing after a pass expires.
  const hours = entitlement.autoCloseHours ? data.hours : null;

  const supabase = await createServerClient();

  // Active-booth gate: free vendors serve one live booth at a time. Block
  // activating a second (they swap by deactivating another). RLS booth_servable
  // is the real backstop; this gives a clear error instead of a silent pause.
  if (data.is_active && entitlement.maxBooths !== null) {
    const capError = await checkActiveBoothCap(
      supabase,
      user.id,
      entitlement.maxBooths,
      data.boothId,
      "saveBooth",
    );
    if (capError) return { success: false, error: capError };
  }

  const row = {
    name: data.name,
    image_url: data.image_url,
    is_active: data.is_active,
    hours,
    social_links: data.social_links,
    requires_arrival_confirm: data.requires_arrival_confirm,
    walkup_default: data.walkup_default,
    print_enabled: data.print_enabled,
    paykit_booking_id: data.paykit_booking_id,
    max_items_per_order: data.max_items_per_order,
    ...dailyCapPatch(entitlement, data.daily_cup_cap, !data.boothId),
    ...(await paymentPatch(user.id, data.takes_payment)),
  };

  const result = await upsertBoothRow(supabase, row, data.boothId, user.id);
  if (result.success) {
    await syncPrintLocation(
      user.id,
      result.boothId,
      data.name,
      data.print_enabled,
      "saveBooth",
    );
    // Reclaim uploads from forms this vendor abandoned; runs after the
    // response so the save never waits on it.
    after(() => sweepUnsavedUploads(supabase, user));
  }
  return result;
}

/** Menu-manager page's own write path. Owns `menu_items` exclusively. */
export async function saveMenuItems(
  boothId: string,
  items: MenuItemFormInput[],
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  const parsed = menuItemsInputSchema.safeParse(items);
  if (!parsed.success) return { success: false, error: "Invalid menu items" };

  const { user, entitlement } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  const menuCapError = validateMenuCaps(parsed.data, entitlement);
  if (menuCapError) return { success: false, error: menuCapError };

  // Same stock-cap stripping rule saveBooth used to apply.
  const menu_items = entitlement.stockCaps
    ? parsed.data
    : parsed.data.map(({ stock: _stock, ...rest }) => rest);

  const supabase = await createServerClient();

  // RLS scopes this to the vendor's own booths; a foreign id reads null.
  const { data: prev } = await supabase
    .from("booths")
    .select("menu_items")
    .eq("id", boothId)
    .maybeSingle();
  if (!prev) return { success: false, error: "Booth not found" };

  const { data: updated, error } = await supabase
    .from("booths")
    .update({ menu_items })
    .eq("id", boothId)
    .select("id")
    .maybeSingle();
  if (error || !updated)
    return { success: false, error: "Could not save menu" };

  await removeBoothImages(
    supabase,
    orphanedImagePaths(prev, { menu_items }),
    "saveMenuItems",
  );
  after(() => sweepUnsavedUploads(supabase, user));
  return { success: true };
}

/** Exclusive write path for `booths.menu_categories`, `saveBooth`'s row
 * never touches it. No cascade-clear on delete — `groupByCategory` already
 * buckets a dangling `category` id into "Other". */
export async function saveMenuCategories(
  boothId: string,
  categories: MenuCategory[],
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  const parsed = menuCategoriesSchema.safeParse(categories);
  if (!parsed.success) return { success: false, error: "Invalid categories" };

  const { user } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createServerClient();
  const { data: updated, error } = await supabase
    .from("booths")
    .update({ menu_categories: parsed.data })
    .eq("id", boothId)
    .select("id")
    .maybeSingle();
  if (error || !updated)
    return { success: false, error: "Could not save categories" };
  return { success: true };
}

/**
 * Flip a single booth's is_active without going through the full booth-edit
 * form — a quick pause/resume for a vendor managing rush-hour pace (toggle
 * off to let a backlog clear, back on once caught up), not a booth-details
 * edit. Same free-plan single-active-booth cap as saveBooth when turning ON;
 * turning OFF is always allowed (never blocks giving yourself a breather).
 */
export async function toggleBoothActive(
  boothId: string,
  active: boolean,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  if (!z.boolean().safeParse(active).success)
    return { success: false, error: "Invalid active state" };

  const { user, entitlement } = await loadEntitlement();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createServerClient();

  if (active && entitlement.maxBooths !== null) {
    const capError = await checkActiveBoothCap(
      supabase,
      user.id,
      entitlement.maxBooths,
      boothId,
      "toggleBoothActive",
    );
    if (capError) return { success: false, error: capError };
  }

  // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
  const { data: updated, error } = await supabase
    .from("booths")
    .update({ is_active: active })
    .eq("id", boothId)
    .select("id")
    .maybeSingle();
  if (error || !updated)
    return { success: false, error: "Could not update booth" };

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
