# icon-512

## Purpose

Serves the 512×512 PWA/manifest icon at a stable URL (app-dir generated icon
routes carry a content hash in their URL, which `manifest.ts` can't reference).

## Contents

- `route.tsx` — `GET()` route handler: returns `new ImageResponse(qkitBrandIcon(512),
{ width: 512, height: 512 })`, rendering the shared `brandIcon` JSX
  (`qkitBrandIcon` from `@/lib/brand`) to a PNG via `next/og`.

## Connectivity

Referenced by the web app manifest as the 512×512 icon entry; renders the same
`qkitBrandIcon()` helper used by `icon-192/route.tsx` at a different size, so both
stay visually identical.

## Parent

[app](../README.md)
