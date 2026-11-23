import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { HelpVote } from "./feedback";

type Client = SupabaseClient<Database, "qkit">;

export type MyHelpVote =
  | { available: true; vote: HelpVote | null }
  | { available: false };

/**
 * The signed-in vendor's own vote on one article. RLS limits the read to their
 * rows. Any error (including the table not existing yet) reports
 * `available: false`, so the widget hides instead of breaking the article.
 */
export async function loadMyHelpVote(
  supabase: Client,
  slug: string,
): Promise<MyHelpVote> {
  const { data, error } = await supabase
    .from("help_feedback")
    .select("helpful, comment")
    .eq("article_slug", slug)
    .maybeSingle();
  if (error) return { available: false };
  return { available: true, vote: data ?? null };
}
