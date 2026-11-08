import { createServiceClient } from "@/lib/supabase/server";

// Payment screenshots are deleted with the order they prove (and only then).
// A database trigger queues each deleted order's object path in
// qkit.proof_storage_deletions, because Postgres cannot remove Storage
// objects; this drains that queue through the Storage API. Callers run it
// after a delete that can cascade to orders. It never throws: a failed drain
// leaves the rows queued for the next call, which is a leaked object, not a
// correctness problem.

const NOT_FOUND = /not.?found|does not exist|404/i;

function isNotFound(error: { message: string; statusCode?: string }): boolean {
  return NOT_FOUND.test(error.message) || error.statusCode === "404";
}

export async function drainProofDeletions(limit = 100): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { data: rows, error } = await supabase
      .from("proof_storage_deletions")
      .select("id, bucket, path, attempts")
      .order("id", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("proof storage drain read failed", error.message);
      return;
    }
    if (!rows || rows.length === 0) return;

    const byBucket = new Map<string, typeof rows>();
    for (const row of rows) {
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);
    }

    for (const [bucket, group] of byBucket) {
      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(group.map((r) => r.path));

      if (!removeError || isNotFound(removeError)) {
        const { error: deleteError } = await supabase
          .from("proof_storage_deletions")
          .delete()
          .in(
            "id",
            group.map((r) => r.id),
          );
        if (deleteError)
          console.error(
            "proof storage queue clear failed",
            deleteError.message,
          );
        continue;
      }

      console.error("proof storage drain failed", removeError.message);
      for (const row of group) {
        await supabase
          .from("proof_storage_deletions")
          .update({
            attempts: row.attempts + 1,
            last_error: removeError.message,
          })
          .eq("id", row.id);
      }
    }
  } catch (error) {
    console.error("proof storage drain failed", error);
  }
}
