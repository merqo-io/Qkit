# qr

## Purpose

Printable QR-code poster page for one booth, with a token-regenerate action for invalidating old codes.

## Contents

- `booth-qr-poster.tsx` — `BoothQrPoster({ boothId, name, isActive, code })` client component: renders the booth name, an `react-qr-code` `QRCode` for `${origin}${orderPath(code)}` (origin resolved client-side via `useSyncExternalStore` to avoid an SSR hydration mismatch, with a `NEXT_PUBLIC_DEMO_ORIGIN_OVERRIDE` escape hatch for demo recordings so localhost never shows on camera), a fallback link to type manually, a "booth is off" notice when `!isActive`, Print (`window.print()`) and Download PNG (renders the SVG to a 1024px canvas via an offscreen `Image`+`canvas`, downloads as `{slug}-qr.png`) buttons, and embeds `RegenerateButton`.
- `page.tsx` — `BoothQrPage({ params })` (server, `revalidate = 0`): calls `requireVendor()`, loads the booth (`id, name, is_active, short_code`) RLS-scoped (foreign id → `null` → `notFound()`), renders `BoothQrPoster`.
- `regenerate-button.dom.test.tsx` — RTL/jsdom tests for `RegenerateButton`: confirms the modal names the specific booth, calls `regenerateShortCode(boothId)` on confirm, and does not call it when cancelled.
- `regenerate-button.tsx` — `RegenerateButton({ boothId, boothName })` client component: an `AlertDialog`-gated "Regenerate QR" control (rotating the token invalidates every printed/saved QR, so it requires confirming a dialog that names the booth explicitly) that calls `regenerateShortCode` from `../../actions` inside a transition, toasts, and `router.refresh()`s on success.

## Connectivity

Reached from `booth-list.tsx`'s QR button and from `BoothQrPoster`'s own "Back to booths" `BackButton` (`@merqo/ui`). `page.tsx` loads the booth and hands it to `booth-qr-poster.tsx`, which embeds `regenerate-button.tsx`; `regenerate-button.tsx` calls `regenerateShortCode` in `../../actions.ts` (two levels up, the `booths/actions.ts` shared with the booth form), which revalidates this same `qr` page path after rotating the code.

## Parent

[[boothId]](../README.md)
