// Helpers for reclaiming orphaned booth-image storage objects. Uploads land at
// a fresh random path each time (via image-upload-adapter.ts, consumed by
// @merqo/ui's ImageUploader), so replacing or removing an image, or deleting
// a booth, leaves the old object behind. saveBooth/deleteBooth use these to
// remove the objects a booth no longer references.

import { storagePathFromPublicUrl } from "@merqo/ui";

// A banner or menu photo that is not an uploaded booth-images object (seed art
// under `/seed/...`, an external URL, junk) maps to null, so it is never
// targeted for deletion.
const BUCKET = "booth-images";

type ImageRow = {
  image_url?: string | null;
  menu_items?: unknown;
};

/**
 * Every uploaded-object path a booth row references: its banner plus each menu
 * item's photo. Deduped; non-uploads (seed/external) are dropped.
 */
export function boothImagePaths(row: ImageRow): string[] {
  const urls: string[] = [];
  if (typeof row.image_url === "string") urls.push(row.image_url);
  if (Array.isArray(row.menu_items)) {
    for (const item of row.menu_items) {
      const u = (item as { image_url?: unknown } | null)?.image_url;
      if (typeof u === "string") urls.push(u);
    }
  }
  const paths = new Set<string>();
  for (const u of urls) {
    const p = storagePathFromPublicUrl(u, BUCKET);
    if (p) paths.add(p);
  }
  return [...paths];
}

/** Paths referenced by `before` but no longer by `after` — safe to delete. */
export function orphanedImagePaths(
  before: ImageRow,
  after: ImageRow,
): string[] {
  const keep = new Set(boothImagePaths(after));
  return boothImagePaths(before).filter((p) => !keep.has(p));
}

/**
 * In-bucket paths of the images a failed save uploaded and nothing now
 * references, so they can be deleted. `urls` comes from the client, so only
 * booth-images objects inside the vendor's own folder are ever returned.
 */
export function failedSaveUploadPaths(
  urls: readonly string[],
  vendorId: string,
): string[] {
  const paths = new Set<string>();
  for (const url of urls) {
    const path = storagePathFromPublicUrl(url, BUCKET);
    if (path && path.split("/")[0] === vendorId) paths.add(path);
  }
  return [...paths];
}

/** Default age before an unreferenced upload counts as abandoned. */
export const UNSAVED_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

type StoredObject = { name: string; created_at?: string | null };

/**
 * Every uploaded-object path the given URLs point at in the booth-images
 * bucket (a vendor's avatar or paykit QR image, say). Non-uploads map to
 * nothing, same as boothImagePaths.
 */
export function uploadedPaths(urls: (string | null | undefined)[]): string[] {
  const paths: string[] = [];
  for (const u of urls) {
    const p = storagePathFromPublicUrl(u, BUCKET);
    if (p) paths.push(p);
  }
  return paths;
}

/**
 * Objects in a vendor's `folder` that nothing references and that are older
 * than `graceMs`: uploads the vendor made in a form they never saved. The
 * grace window keeps an upload sitting in a still-open, unsaved form safe.
 * Sub-folders and objects with no timestamp are never selected.
 */
export function unsavedUploadPaths(
  folder: string,
  objects: StoredObject[],
  referenced: Iterable<string>,
  nowMs: number,
  graceMs: number = UNSAVED_UPLOAD_GRACE_MS,
): string[] {
  const keep = new Set(referenced);
  const out: string[] = [];
  for (const obj of objects) {
    if (!obj.created_at) continue;
    const created = Date.parse(obj.created_at);
    if (Number.isNaN(created) || nowMs - created < graceMs) continue;
    const path = `${folder}/${obj.name}`;
    if (!keep.has(path)) out.push(path);
  }
  return out;
}
