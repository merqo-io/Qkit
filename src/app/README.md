# app

## Purpose

Next.js App Router tree — every page, layout, route handler, and PWA manifest file for this project.

## Contents

- `(auth)/` — vendor login and password-reset pages (route group, no URL segment).
- `about/` — `AboutPage`, the public "Why Merqo" page. The story itself is
  `@merqo/ui`'s shared `AboutMerqo` component (one source, reused by
  merqo's own `/about` and every other kit's); this page supplies only
  `Nav`/`Footer` and a "See how qkit works" CTA. Linked from `Nav` and
  `Footer`.
- `actions/` — server actions shared across routes: analytics events, feedback, purchase (upgrade) requests, support messages.
- `admin/` — internal admin dashboard (vendor management, pricing, feedback, support inbox).
- `api/` — route-handler API endpoints: the Merqo cross-product integration and qkit's own `v1` public API.
- `apple-icon.tsx` — `AppleIcon` route handler; renders `brandIcon(180)` (from `@/lib/brand-icon`) as a 180×180 PNG `ImageResponse` for iOS home-screen touch icons.
- `auth/` — Supabase auth callback route (OAuth/recovery code exchange).
- `dashboard/` — authenticated vendor area (realtime order board, booth/menu management, stats).
- `error.tsx` — `Error` client component, the root React error boundary; replaces the Next dev overlay in production, logs via `console.error`, shows a "Try again" button calling `reset()`.
- `global-error.tsx` — `GlobalError` client component; the boundary Next renders only when the **root layout itself** throws, so it ships its own `<html>/<body>` with inline styles (no Tailwind, since `globals.css` may not have loaded).
- `globals.css` — Tailwind v4 entry point: `@import "tailwindcss"`, `@import "tw-animate-css"`, and `@source "../../node_modules/@merqo/ui/dist"` (tells Tailwind to scan the built `@merqo/ui` package for utility classes to generate, since it lives outside `src/` and wouldn't otherwise be picked up by Tailwind's default content scan); theme tokens (OKLCH colors, `--font-*` variables), base layer, and custom utility classes (`.ticket`, `.perforation`, `.fade-rise`, `.undo-bar` — the left-to-right drain on `OrderCard`'s advance-undo affordance; the 4s here is only a fallback, `OrderCard` sets an inline `animation-duration` matching its vendor-configurable `undoMs` prop — `.autoclear-bar` — the same drain (reuses `.undo-bar`'s `undo-drain` keyframe) on `OrderCard`'s "Mark Picked Up" button while a ready order is counting down to `sweepReadyOrders`' auto-clear, duration set inline per order — `.hold-fill-bar` — the fill on `CloseBoothControl`'s 3-second hold-to-close button (`src/app/dashboard/booths/close-booth-control.tsx`), visual only, the real timing is a JS `setTimeout` — status colors) used across the app. `--card`/`--popover` were fixed to differ from `--background` in light mode after the Market Ochre rebrand had accidentally collapsed them to the same value (dark mode was already correct). Colour tokens come in pairs where a colour is used both as a fill and as text: `--status-*`, `--primary`, `--destructive`, `--success` and `--warning` are fills, and each has a darker `-text` twin that the `text-*` utilities resolve to (`--text-color-*` in `@theme`), because a colour strong enough for a badge fill is too light to read on the cream paper. The three brand anchors (Khaki, Deep Grayish Olive, Diamine Green) are combination 146 of Sanzo Wada's "A Dictionary of Color Combinations". A `body:has([data-selection-bar])` rule hides `@merqo/ui`'s floating tour replay button (`[data-tour="tour-replay"]`) while the board's selection bar is open, since on a phone it sits on the bar's right-hand action. Its `pointer: coarse` block sizes touch targets; the hint icon's 44px touch area is not in it, because `@merqo/ui`'s `InfoTooltip` provides that itself.
- `icon-192/`, `icon-512/` — PWA icon route folders (each renders a sized PNG, referenced by `manifest.ts`).
- `legal/` — public `terms/` + `privacy/` document pages (each a one-line Server Component rendering `@merqo/ui`'s `LegalDocument`), plus `accept/`, the interstitial the legal-acceptance gate (`requireCurrentLegalAcceptance`, `@/lib/legal-gate`) bounces a signed-in vendor to when their accepted terms/privacy versions are stale.
- `icon.tsx` — `Icon` route handler; renders `brandIcon(32)` as a 32×32 PNG favicon.
- `layout.tsx` — `RootLayout`. Loads `Fraunces`, `Hanken_Grotesk`, `Space_Mono` via `next/font/google`, sets `metadata`/`viewport` (PWA `appleWebApp`, `themeColor` from `BRAND_KHAKI`). Fetches the single `platform_settings` row (`banner_enabled`/`banner_message`) via an anonymous-safe `createServerClient()` read, falling back to `DEFAULT_PLATFORM_SETTINGS` (`@/lib/platform-settings`) on error so a read failure never breaks every page load; renders `ServiceWorkerRegistrar` and `MaintenanceBanner` (the site-wide banner, toggled from `/admin`), and wraps `Providers`/children in next-themes' `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) so the manual Light/Dark/System control in `@merqo/ui`'s `AccountMenu` can toggle the `.dark` class in `globals.css`, replacing the previous hand-rolled OS-only `<Script>` toggle.
- `manifest.ts` — `manifest()` returns the `MetadataRoute.Manifest` (name, `display: "standalone"`, `background_color`/`theme_color` from `@/lib/brand-icon`, icon list pointing at `/icon-192`/`/icon-512`).
- `not-found.tsx` — `NotFound` component; branded 404 shown e.g. for a stale/mistyped order URL, links back to `/`.
- `o/` — short-code customer ordering entry point.
- `onboarding/` — post-signup vendor onboarding flow.
- `order/` — legacy booth-id-based customer ordering route.
- `page.tsx` — `LandingPage` async server component, the marketing home page. Fetches the signed-in user and the single `pricing` row via `createServerClient()`, falls back to `DEFAULT_PRICING` (from `@/lib/pricing`) when prices are unset (pre-Stripe beta framing). Renders hero, trust strip, "how it works" steps, "why qkit" cards, a pricing teaser (Free / Event pass / Monthly Pro), two FAQ columns (`FAQ` for prospects, `VENDOR_FAQ` for signed-up vendors troubleshooting real product behavior — QR regeneration, stock caps, SGT-scheduled hours, rate limits, etc.), and `Footer` (`src/components/landing/footer.tsx`, own README). CTA target and label switch based on whether `user` is signed in.

## Connectivity

`(auth)/` is the vendor login/reset flow; `dashboard/` is the authenticated vendor area; `legal/` holds the public document pages and the acceptance interstitial the dashboard gate redirects to. `o/` and `order/` are the two customer-facing ordering surfaces (the current short-code entry point and the legacy booth-id route). `admin/` and `api/` are internal/ops surfaces; `actions/` holds server actions shared across routes rather than colocated with one page. `layout.tsx` is the ancestor of every route below; `page.tsx` (the landing page) is the only route directly under `app/` besides the special Next.js files.

## Shared package note

`page.tsx` now imports `BackToTop` from `@merqo/ui` (v0.31.0) rather than a qkit-local copy.

## Parent

[src](../README.md)
