# e2e

## Purpose

Playwright end-to-end smoke tests, run against a real local Supabase (not mocked) — covers what the mocked unit/component tests can't (RLS, the `proxy.ts` auth guard, the full order lifecycle including payment).

## Contents

- `auth-guard.spec.ts` — exercises `src/proxy.ts` → `updateSession`: an anonymous visitor hitting `/dashboard` or `/onboarding` must be redirected to `/login`. Needs only a booting app, no seed data.
- `smoke.spec.ts` — public smoke: the landing page renders its "Live booth ordering" hero heading, and `/login` renders its "Continue with Google" button. Needs only a booting app, no seed data.
- `customer-order.spec.ts` — the customer checkout against the seeded "Kopitiam Cart" booth (`c0ffee01-0000-4000-8000-000000000001`, entered via short code `e2eKopitiam01`): open the booth, customize a drink, place an order under a name, land on `/order/<booth>/pay?t=<token>`, upload a payment-proof image and confirm "I've paid". Claiming assigns the order number and redirects to `/order/<booth>/<orderNumber>?t=<token>`, showing "payment sent" while vendor acceptance is pending. Requires `supabase/seed/coffee-cart.sql`. The pay panel calls paykit's `/api/v1/checkout*` HTTP API through `src/lib/paykit/client.ts`; this suite uses the Payment mock below. It does not test a vendor's complete acceptance/preparation/completion lifecycle.
- `order-code.spec.ts` — short-code order entry: a valid code (`e2eKopitiam01`) renders the booth's order page ("Kopitiam Cart", a visible "Customize" button); a bogus code hard-blocks with an "this code expired" message. Also requires the coffee-cart seed.
- `paykit-mock.ts` — not a spec; a tiny `http.createServer` stand-in for paykit's checkout/claim/confirm endpoints (see Payment mock below).
- `global-setup.ts` — Playwright `globalSetup`: starts `paykit-mock.ts` and returns its shutdown as the matching teardown.

## Connectivity

Run via `pnpm test:e2e` (auto-starts `pnpm dev`); `auth-guard.spec.ts` and `smoke.spec.ts` need only a booting app, `customer-order.spec.ts` and `order-code.spec.ts` need the coffee-cart seed applied first (Docker + `supabase start` + migrations + `supabase/seed/coffee-cart.sql`). Both order specs hardcode the same `e2eKopitiam01` short code and booth id — no shared fixtures module exists yet for `e2e/`, so keep them in sync with the seed file if either changes.

## Payment mock

qkit's checkout flow calls paykit's real HTTP API (`src/lib/paykit/client.ts`), and no paykit deployment runs alongside e2e (locally or in CI). `global-setup.ts` starts `paykit-mock.ts` — a small `http.createServer` implementing `POST /api/v1/checkout`, `GET /api/v1/checkout?order_ref=`, `POST /api/v1/checkout/:id/claim`, `POST /api/v1/checkout/:id/confirm`, and `GET /api/v1/checkout/:id` with paykit's real response shapes (always returns a PayNow-style `type: "qr"` checkout, deduped per `order_ref` the same way paykit dedupes on `(kit_slug, order_ref)`) — on a fixed local port. `playwright.config.ts`'s `webServer.env` points `NEXT_PUBLIC_PAYKIT_URL`/`PAYKIT_KIT_SECRET` at it, so `pnpm dev`'s server-side paykit calls land on the mock instead of a network call. This only covers the checkout/claim/confirm surface these specs exercise — `GET /api/v1/vendors/{id}/config` (which kind of payment a vendor has on file, read by the booth form) has no e2e coverage and isn't mocked; qkit no longer writes that config at all. The mock also posts paykit's payment-status callback to qkit's own `POST /api/paykit/payment-status` after a claim or a confirm changes a transaction, authenticated with `PAYKIT_CALLBACK_SECRET` from the same `webServer.env`, so the customer's claim and the callback hit one order together as they do in production.

## Parent

[qkit](../README.md)
