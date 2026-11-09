"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateVendorProfile } from "@/lib/merqo/vendor-profile";
import { vendorSchema, type VendorInput } from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";

type CreateVendorResult = ActionResult;

export async function createVendor(
  input: VendorInput,
): Promise<CreateVendorResult> {
  const parsed = vendorSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid stall name");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not authenticated");

  const { error } = await supabase.from("vendors").insert({ id: user.id });

  // 23505 = unique violation: the row already exists, treat as success.
  if (error && error.code !== "23505") {
    console.error("createVendor failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return fail("Could not create vendor");
  }

  // Seed the shared merqo profile with the chosen stall name — qkit.vendors
  // has nowhere to put it since migration 0069. get_or_create_vendor_profile
  // is idempotent, so this is safe even on the 23505 (row-already-exists) path.
  try {
    await getOrCreateVendorProfile(supabase, user.id, parsed.data.name);
  } catch (err) {
    console.error(
      "createVendor: seeding merqo profile failed",
      err instanceof Error ? err.message : err,
    );
    return fail("Could not create vendor");
  }

  return ok();
}
