import { createServiceClient } from "@/lib/supabase/server";

// Payment screenshots are deleted with the order they prove (and only then).
// A trigger queues each deleted order's object path because Postgres cannot
// remove Storage objects; this drains that queue. It never throws: a failed
// drain leaves rows queued, a leaked object rather than a correctness problem.
// The returned counts let the cron route surface a failing drain.
// Storage returns no error for a missing object, so only `!error` is success.

// Rows that keep failing stay in the table for manual inspection instead of
// starving newer rows out of each batch.
const MAX_ATTEMPTS = 5;

type Supabase = Awaited<ReturnType<typeof createServiceClient>>;
type QueueRow = { id: number; attempts: number };

async function recordFailedAttempts(
  supabase: Supabase,
  group: QueueRow[],
  message: string,
): Promise<void> {
  for (const row of group) {
    const { error: updateError } = await supabase
      .from("proof_storage_deletions")
      .update({ attempts: row.attempts + 1, last_error: message })
      .eq("id", row.id);
    if (updateError)
      console.error("proof storage attempt update failed", updateError.message);
  }
}

export type DrainResult = { removed: number; failed: number; ok: boolean };

export async function drainProofDeletions(limit = 100): Promise<DrainResult> {
  let removed = 0;
  let failed = 0;
  let ok = true;
  try {
    const supabase = await createServiceClient();
    const { data: rows, error } = await supabase
      .from("proof_storage_deletions")
      .select("id, bucket, path, attempts")
      .lt("attempts", MAX_ATTEMPTS)
      .order("id", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("proof storage drain read failed", error.message);
      return { removed, failed, ok: false };
    }
    if (!rows || rows.length === 0) return { removed, failed, ok };

    const byBucket = new Map<string, typeof rows>();
    for (const row of rows) {
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);
    }

    for (const [bucket, group] of byBucket) {
      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(group.map((r) => r.path));

      if (!removeError) {
        const { error: deleteError } = await supabase
          .from("proof_storage_deletions")
          .delete()
          .in(
            "id",
            group.map((r) => r.id),
          );
        if (deleteError) {
          ok = false;
          console.error(
            "proof storage queue clear failed",
            deleteError.message,
          );
        } else {
          removed += group.length;
        }
        continue;
      }

      console.error("proof storage drain failed", removeError.message);
      failed += group.length;
      await recordFailedAttempts(supabase, group, removeError.message);
    }
  } catch (error) {
    console.error("proof storage drain failed", error);
    ok = false;
  }
  return { removed, failed, ok };
}
