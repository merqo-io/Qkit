"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  boardSettingsPatchSchema,
  type BoardSettingsPatch,
} from "@/lib/schemas";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * Update the vendor's live-order-board preferences (vendors.board_settings).
 * The invoker RPC locks and merges the caller's vendor row under existing RLS.
 */
export async function updateBoardSettings(
  input: BoardSettingsPatch,
): Promise<ActionResult> {
  const parsed = boardSettingsPatchSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid settings");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in");

  const { error } = await supabase.rpc("patch_board_settings", {
    p_patch: parsed.data,
  });

  if (error) {
    console.error("updateBoardSettings failed", error.message);
    return fail("Could not save settings");
  }

  revalidatePath("/dashboard", "layout");
  return ok();
}
