# qkit — Deploy Notes

qkit runs on the **shared Merqo Supabase project** (same one as loopkit/merqo),
in its own `qkit` schema.

## Notes

- **qkit-loopkit auto-award**: apply merqo's `0008_kit_events.sql` first,
  then this repo's `0051_emit_order_completed.sql`. Set
  `NEXT_PUBLIC_LOOPKIT_URL` in Vercel env before deploying the order-status
  page change, or the earn link silently never shows (fails closed).
- **printkit integration**: `NEXT_PUBLIC_PRINTKIT_URL` and `PRINTKIT_KIT_SECRET`
  (outbound, `src/lib/printkit/client.ts`) and `PRINTKIT_CALLBACK_SECRET`
  (inbound, `src/app/api/printkit/print-status/route.ts`) are all required
  for the print-job integration to actually work — every one of them fails
  closed and silently when unset, so a missing var looks like a correctly
  configured feature that just never fires rather than an error. Set all
  three in Vercel env before relying on the "Print failed" dashboard badge.
  See `.env.example` for what each one guards.
- **paykit callback**: `PAYKIT_CALLBACK_SECRET` (inbound,
  `src/app/api/paykit/payment-status/route.ts`) is the secret paykit presents
  when it reports a payment change. It must equal `callback_secret` on qkit's
  row in `paykit.kit_api_keys`, whose `callback_url` is this deployment's
  `/api/paykit/payment-status`. Production only: paykit holds one callback
  address per kit. Unset, the route answers 401 to everything and paykit's
  reports are dropped; ordering and paying still work, because qkit's own
  actions write the same status.
- **Telegram vendor alerts (2026-08-16, Phase A2)**: qkit's own Telegram bot
  (and its one-time `setWebhook` registration) was retired — vendor order
  alerts now route through merqo's shared bot via `notifyVendor`
  (`MERQO_BASE_URL`/`MERQO_CUSTOMER_SECRET`, already set for the customer
  Telegram-connect feature — see `.env.example`). No webhook, no bot token,
  nothing to register on this repo's side anymore. Every vendor who'd
  linked qkit's own bot must
  reconnect once via merqo's `/profile` page — see
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.

## Production vs Preview environment variables

Preview deploys (`*.vercel.app`, one per branch/commit) and Production
(`*.merqo.io`) share the same Vercel project but must **not** share every
env var value — some are Production-only by design:

- **`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`** — set to `.merqo.io` in **Production
  only**. Leave unset for Preview/Development. If set on Preview, the
  Supabase auth cookies (including the PKCE `code_verifier`) get written
  with `Domain=.merqo.io`, which browsers silently reject on a
  `*.vercel.app` host — Google OAuth then fails with `/login?error=oauth`
  on every preview deploy, with no error logged anywhere but a client-side
  `exchangeCodeForSession` failure (zero `/token` requests ever reach
  Supabase — that's the tell if this regresses). Hit and fixed 2026-08-13;
  see `src/app/auth/callback/route.ts` for the (now-logged) failure path.
  Check this env var's environment scoping in the Vercel dashboard whenever
  cross-kit SSO config changes — it's a dashboard setting, not something
  `.env.example` enforces.

**Database**: Preview uses a separate staging Supabase project, not
production. The `staging` branch (kept on `main` by the `staging sync`
workflow) is served at `qkit-staging.merqo.io`, and every per-PR preview
calls merqo's staging host (`staging.merqo.io`). The setup steps, the
full list of `Preview` env vars and the end-to-end check live in merqo's
`docs/STAGING.md`. qkit's `Preview` scope overrides:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`: the staging project.
- `MERQO_BASE_URL`: `https://staging.merqo.io`.
- `NEXT_PUBLIC_PAYKIT_URL`, `NEXT_PUBLIC_PRINTKIT_URL`,
  `NEXT_PUBLIC_LOOPKIT_URL`: each kit's `<kit>-staging.merqo.io` host.
- `MERQO_CUSTOMER_SECRET`, `MERQO_METRICS_SECRET`,
  `MERQO_PROVISION_SECRET`: staging-only values, never the production ones.
- `PAYKIT_KIT_SECRET`, `PAYKIT_CALLBACK_SECRET`, `PRINTKIT_KIT_SECRET`,
  `PRINTKIT_CALLBACK_SECRET`: staging-only values matching qkit's rows in
  the staging `paykit.kit_api_keys` and `printkit.kit_api_keys` (each
  kit's `supabase/seed/staging-kit-keys.sql`). Until paykit or printkit is
  on staging, leave that kit's pair unset on Preview: payment or printing
  then stays off (fails closed).
- `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`: `.merqo.io` for Git branch `staging`
  only, so one sign-in covers the staging hosts. Never on other previews.

Vercel Deployment Protection is off on this project: it still challenged
the branch-assigned staging domain. The `staging sync` workflow also calls
the project's Vercel deploy hook (repo secret `VERCEL_STAGING_DEPLOY_HOOK`),
because Vercel does not git-deploy a commit it already built for
production.

Load staging's schema with `scripts/staging-migrate.sh`, not
`supabase db push`: every kit shares one migration history table and
reuses the same version numbers.
