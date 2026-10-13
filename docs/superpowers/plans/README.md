# plans

## Purpose

Step-by-step implementation plans, one per feature, each derived from the matching design spec in `../specs/`. These are historical build records (task breakdowns, file maps, self-review notes) — kept as project history, not living docs.

## Contents

- `2026-06-05-qkit-core.md` — "qkit Core Implementation Plan": the original MVP build — shadcn install, DB schema + RLS, Supabase clients/middleware, auth pages, order-status badge/card components, the realtime orders hook, the vendor dashboard, and the customer ordering + order-status pages.
- `2026-06-08-google-auth.md` — "Google-primary Auth Implementation Plan": adds Google OAuth as the primary sign-in method with email/password fallback and the `/auth/callback` handler.
- `2026-06-09-booth-menu-management.md` — "Booth & Menu Management Implementation Plan": lets vendors edit their booth name and menu items, including optional per-item pricing.
- `2026-06-09-drink-customization.md` — "Drink Customization Implementation Plan": seed-only customization (e.g. milk choice) via a bottom-sheet picker, plus cart keying so different option selections are distinct line items.
- `2026-06-09-menu-photos-mobile-coffee-seed.md` — "Per-item Photos, Mobile, Coffee-Cart Seed — Implementation Plan": per-item menu photos, mobile layout polish, and the "Kopitiam Cart" coffee-cart seed data.
- `2026-06-24-service-speed-stats.md` — "Service-speed stats Implementation Plan": adds time-to-ready service-speed metrics to the vendor stats page.
- `2026-06-28-payments-seam.md` — "qkit Payments Seam Implementation Plan": the PayNow payment connector interface, booth payment-method field, and the customer "I've paid" claim flow.
- `2026-07-01-booth-qr-token.md` — "Rotatable Booth QR Token — Implementation Plan": booth QR/order links carry a rotatable token instead of a bare booth id, so a leaked or reprinted poster can be invalidated.
- `2026-07-01-order-path-hardening.md` — "Order Path Hardening — Implementation Plan (Phase A)": moves order-path invariants into DB-enforced constraints and adds short order-entry codes, closing the anon-role PostgREST bypass the 2026-07-01 audit found.
- `2026-07-06-hero-ticket-carousel.md` — "Hero Ticket Carousel + Avatar Fix Implementation Plan": the rotating hero-ticket carousel on the customer order page, plus an avatar rendering fix.
- `2026-07-06-public-to-qkit-schema.md` — "public → qkit Schema Namespace — Implementation Plan": migrates all tables from Postgres's `public` schema into a dedicated `qkit` schema.
- `2026-07-09-qkit-vendor-status-endpoint.md` — "qkit Vendor-Status Endpoint Implementation Plan": adds an API endpoint exposing a vendor's plan/entitlement status.
- `2026-07-10-qkit-downgrade-request-endpoint.md` — "qkit Downgrade-Request Endpoint Implementation Plan": adds an endpoint for a vendor to request a plan downgrade.
- `2026-07-10-qkit-upgrade-request-endpoint.md` — "qkit Upgrade-Request Endpoint Implementation Plan": adds an endpoint for a vendor to request a plan upgrade.
- `2026-07-14-booth-form-ticket-cards.md` — "Booth Form Ticket Cards Implementation Plan": reworks the booth-editing form to render menu items as ticket-style cards.
- `2026-07-14-nav-plan-to-dropdown.md` — "Nav Plan-to-Dropdown Implementation Plan": moves the "Plan" nav link into the account dropdown menu and reorders the dropdown's items.
- `2026-07-14-tablet-two-column-layout.md` — "Tablet+ Two-Column Layout Implementation Plan": adds a two-column layout for tablet-and-larger viewports.
- `2026-07-16-vendor-social-links.md` — "Vendor Social & Website Links Implementation Plan": lets a vendor set website/Instagram/Facebook/TikTok links once on their profile (with an optional whole-object per-booth override), shown to a customer on the order-status page footer after they've placed an order.
- `2026-07-21-arrival-confirmation-and-auto-clear.md` — "Arrival Confirmation + Ready-Order Auto-Clear Implementation Plan": ships (1) arrival confirmation ("scan-to-start") that holds prep for perishable-item booths until the customer taps arrival, (2) an auto-clear sweep that flips a `ready` order to `completed` after a vendor-configurable timeout, and (3) a "Restore to ready" undo action for a premature auto-clear.
- `2026-07-21-drop-vendor-identity-columns.md` — "Drop Stale Vendor Identity Columns Implementation Plan": drops the stale `qkit.vendors.name`/`social_links` columns (superseded by `merqo.vendor_profile`) and migrates onboarding's write plus four admin pages' raw reads onto the shared profile instead.
- `2026-08-16-telegram-order-alerts.md` — "Telegram Order Alerts Implementation Plan": adds `vendor_telegram`/`telegram_link_tokens` tables, a signature-verified webhook route, a dashboard "Connect Telegram" section, and wires a fire-and-forget alert into `placeOrder` — a failed/missing link never affects order placement itself.
- `2026-08-16-customer-telegram-connect.md` — "Customer Telegram Connect Implementation Plan": adds a `TelegramConnect` order-status component calling merqo's `customer-connect-token` endpoint, and wires `advanceOrder`'s `ready` transition to merqo's `notify-customer` endpoint. No new qkit table or webhook — depends on merqo's own plan shipping first.
- `2026-08-16-customer-notify-vendor-toggle.md` — "Customer Notify Vendor Toggle Implementation Plan": adds `customer_telegram_notify_enabled` to `board_settings` (default true) and gates `advanceOrder`'s `notifyCustomer` call on it, plus a settings-page switch. Depends on the customer Telegram connect plan already being on `main`.
- `2026-08-16-vendor-telegram-connect.md` — "Vendor Telegram Connect (Phase A2) Implementation Plan": deletes qkit's own Telegram bot/tables/webhook/settings section and rewires `notifyVendorTelegram` to call merqo's `notify-vendor` endpoint. Depends on merqo's own Phase A2 plan shipping first.
- `2026-08-16-shared-plan-comparison-table.md` — "Shared Plan Comparison Table Implementation Plan": builds `@merqo/ui`'s new `PlanComparisonTable` component and migrates qkit's own `/dashboard/plan` page onto it.

- `2026-10-08-merqo-products-audit.md` — Seven-product audit scope, source-inclusive coverage targets, independent review and verification limits. Current completion evidence is in `../../meta/2026-10-08-product-sweep-status.md` and the per-file review ledgers.
- `2026-10-12-paykit-status-callback.md` — Phase P2 of the paykit and printkit separation design: paykit posts a payment-status callback to the kit that owns a transaction after a claim, unclaim or confirm, and qkit's new `POST /api/paykit/payment-status` reads the real status back and applies it through one repeat-safe `finalizePaidOrder`. Two PRs, paykit first; one paykit migration (two nullable columns), none in qkit. Awaiting owner review.
- `2026-10-10-paykit-order-ref-lookup.md` — Phase P1 of the paykit and printkit separation design: paykit gains `GET /api/v1/checkout?order_ref=` and qkit's confirm, claim and undo actions look an order's transaction up instead of creating the checkout again. Two PRs, paykit first; no migration. Awaiting owner review.
- `2026-10-12-printing-goes-thin.md` — Phase R1 of the paykit and printkit separation design: printkit's location status names the printkit page for a booth (`manage_url`), its picker shows the printer advice, and its status callback carries `source_ref`; qkit's Printing section becomes a switch, a badge and that one link, its callback route accepts either field name, and it stops storing printkit's location id. Two PRs, printkit first; no migration. Awaiting owner review.
- `2026-10-13-payment-setup-in-paykit.md` — Phase P4 of the paykit and printkit separation design: paykit's config page accepts a `return_to` on a Merqo family host and offers "Back to your booth" after a save; qkit's booth Payment section becomes a switch, a read-only summary and one link to paykit, `saveBooth` writes the `{kind}` marker from the switch plus the kind paykit reports, and qkit's own payment form, field rules and config write are deleted. Two PRs, paykit first; no migration. Records two findings that differ from the spec: paykit already uploads the QR image to `vendor-images`, and the upload sweep keeps its paykit read so a QR image stored earlier is never deleted. `2026-10-13-payment-setup-in-paykit.agents-md-wording.md` beside it holds the replacement `AGENTS.md` text for the owner to apply.

## Parent

[superpowers](../README.md)
