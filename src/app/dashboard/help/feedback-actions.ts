"use server";

import { getPublishedArticle } from "@/content/help";
import {
  helpFeedbackSchema,
  type HelpFeedbackInput,
  type HelpFeedbackResult,
} from "@/lib/help/feedback";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Records or changes the signed-in vendor's "Was this helpful?" vote on one
 * article. Runs on the user session, so RLS pins the row to the caller. Never
 * throws: the widget renders the returned error inline.
 */
export async function submitHelpFeedback(
  input: HelpFeedbackInput,
): Promise<HelpFeedbackResult> {
  try {
    const parsed = helpFeedbackSchema.safeParse(input);
    if (!parsed.success || !getPublishedArticle(parsed.data.slug)) {
      return { ok: false, error: "invalid" };
    }
    const { slug, helpful, comment } = parsed.data;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { error } = await supabase
      .from("help_feedback")
      .upsert(
        { article_slug: slug, helpful, comment: comment ?? null },
        { onConflict: "vendor_id,article_slug" },
      );
    if (error) {
      console.error("submitHelpFeedback failed", error.message);
      return { ok: false, error: "failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("submitHelpFeedback threw", err);
    return { ok: false, error: "failed" };
  }
}
