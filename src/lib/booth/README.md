# booth

## Purpose

Booth helpers with no UI: plan-based access and serve limits, short codes,
per-booth colours and image paths.

## Contents

- `access.test.ts` — tests serveability under free vs. unlimited
  entitlements and the "paused" classification.
- `access.ts` — `servableBoothIds`/`isBoothPaused`: which of a vendor's
  active booths are customer-servable under their entitlement (unlimited plans
  serve all; free serves only the oldest `maxBooths`), mirroring the
  `booth_servable` SQL function so DB and dashboard agree.
- `code.test.ts` — tests URL encoding of the order path.
- `code.ts` — `orderPath(code)`: builds the `/o/{code}` customer entry
  URL from a booth's short code.
- `color.test.ts` — tests that eight booths get eight colours, that colours
  follow list position and survive a newer booth being added.
- `color.ts` — `boothColors(boothIds)`: a map from each booth id to the next
  colour of an 8-colour oklch palette (`BOOTH_COLORS`) by its place in the
  vendor's booth list (oldest first), so up to eight booths never share a dot
  and no DB column is needed. `boothDotTitle(name)` is the dot's hover title.
- `images.test.ts` — tests path extraction, orphan-path diffing, and the
  unsaved-upload selection (grace boundary, referenced objects kept, folders
  and bad timestamps skipped).
- `images.ts` — `boothImagePaths`, `orphanedImagePaths`: extract
  in-bucket storage paths from booth-images public URLs and diff before/after
  booth state to find storage objects safe to delete after an image swap or
  booth deletion. URL-to-path parsing is `@merqo/ui`'s shared
  `storagePathFromPublicUrl` (this file carried its own copy until
  2026-09-22); the shared one also rejects a path with an empty segment.
  `failedSaveUploadPaths(urls, vendorId)` is the filter `saveBooth` uses to
  delete what a failed save uploaded: only objects in the vendor's own
  folder. It takes no "already persisted" set any more, because a booth save
  no longer writes a payment QR to paykit before the booth row.
  `uploadedPaths(urls)` maps any other URLs (avatar, paykit QR) to paths the
  same way, and `unsavedUploadPaths(folder, objects, referenced, nowMs,
graceMs)` picks the objects in a vendor folder that nothing references and
  that are older than `UNSAVED_UPLOAD_GRACE_MS` (24h): uploads from a form the
  vendor never saved. Used by `dashboard/booths/sweep-unsaved-uploads.ts`.

## Parent

[lib](../README.md)
