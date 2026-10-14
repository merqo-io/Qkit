import type { User } from "@supabase/supabase-js";
import type { createServerClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { getVendorConfig } from "@/lib/paykit/client";
import {
  boothImagePaths,
  unsavedUploadPaths,
  uploadedPaths,
} from "@/lib/booth/images";

const BUCKET = "booth-images";
const PAGE = 1000;
// A vendor folder holds a handful of images; this only bounds a runaway loop.
const MAX_PAGES = 10;

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Deletes images a vendor uploaded into a booth or menu form they never
 * saved. Every upload lands at a fresh path in `booth-images/{vendorId}/`
 * the moment it's picked, so an abandoned form leaves an object nothing points
 * at. Save-time cleanup (orphanedImagePaths) only sees images that were once
 * saved, so it can't catch these.
 *
 * An object is deleted only when it is older than the grace window and is not
 * referenced by any of the vendor's booths (banner, menu photos), their avatar
 * (auth user_metadata.avatar_url, which qkit's profile page also uploads into
 * this bucket) or their paykit payment QR.
 *
 * The booth form no longer uploads a payment QR: that is done in paykit, into
 * paykit's bucket. The paykit read stays because a vendor who uploaded one
 * here earlier still has it in this bucket, and paykit's config still names
 * it until they replace it. It is the only record of that reference, so if
 * paykit can't be read the sweep does nothing: deleting a live QR would break
 * checkout. The read can go once no paykit config names a booth-images URL.
 *
 * Best-effort and never throws; RLS limits the delete to the vendor's own
 * folder.
 */
export async function sweepUnsavedUploads(
  supabase: Supabase,
  user: Pick<User, "id" | "user_metadata">,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    const paykit = await getVendorConfig(user.id);
    if (!paykit.ok) return;

    const booths = await readAllRows((from, to) =>
      supabase
        .from("booths")
        .select("image_url, menu_items")
        .eq("vendor_id", user.id)
        .order("id")
        .range(from, to),
    );

    const objects: { name: string; created_at?: string | null }[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(user.id, { limit: PAGE, offset: page * PAGE });
      if (error || !data) return;
      objects.push(...data);
      if (data.length < PAGE) break;
    }

    const avatar: unknown = user.user_metadata?.avatar_url;
    const referenced = [
      ...booths.flatMap(boothImagePaths),
      ...uploadedPaths([
        typeof avatar === "string" ? avatar : null,
        paykit.data.qrImageUrl,
      ]),
    ];
    const paths = unsavedUploadPaths(user.id, objects, referenced, nowMs);
    if (paths.length === 0) return;

    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.error("sweepUnsavedUploads failed", error.message);
  } catch (err) {
    console.error(
      "sweepUnsavedUploads failed",
      err instanceof Error ? err.message : err,
    );
  }
}
