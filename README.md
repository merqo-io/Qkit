# qkit

Vendor booth ordering for the Merqo platform. Vendors manage menus and live
orders; customers scan a booth QR, place an order, pay when required, and track
pickup status.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind v4, shadcn/Radix,
React Hook Form, Zod, Supabase Auth/Postgres/Realtime, and the shared `@merqo/ui`
package. Use `package.json` and `pnpm-lock.yaml` for exact versions.

The shared UI dependency is pinned to a reviewed immutable Git commit. Its
exact archive identity is approved for package preparation in
`pnpm-workspace.yaml`; update that permission alongside the dependency and
lockfile when adopting a new shared UI revision. The current revision is the
commit tagged `v0.34.2`, which treats a Next.js `redirect()` from a server
action as navigation, so the dashboard's Sign out no longer flashes
"NEXT_REDIRECT". Since `v0.34.0` it has `DataCollectionNotice`, the PDPA
point-of-collection line the customer order form shows above its submit button
(`phoneOptional`, because the phone field can be left blank).
Since `v0.32.3`, `Section` title tooltips and default-mode `InfoTooltip`s open
on a tap as well as on hover and keyboard focus, and every info icon takes taps
through a 44px touch area on touch devices. That area comes from `@merqo/ui`
itself, not from this app's CSS. A long tooltip wraps inside the viewport.

qkit uses Supabase, **not** templateCentral's better-auth/Drizzle data layer.
Database authorization is enforced through RLS and SQL privileges. Service-role
operations must remain server-only and explicitly constrain their target.

## Getting started

Use Node 24 and the pnpm version declared in `package.json`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Populate the template locally through your secret-management workflow. Never
commit environment files. Public Supabase values are inlined at build time;
rebuild after changing them.

| Configuration                                                                 | Purpose                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | Browser-safe Supabase connection                 |
| `SUPABASE_SECRET_KEY`                                                         | Server-only service-role access                  |
| `MERQO_BASE_URL`, `MERQO_CUSTOMER_SECRET`                                     | Shared legal acceptance and Telegram integration |
| `NEXT_PUBLIC_PAYKIT_URL`, `PAYKIT_KIT_SECRET`, `PAYKIT_CALLBACK_SECRET`       | Vendor payment configuration and checkout        |
| `NEXT_PUBLIC_PRINTKIT_URL`, `PRINTKIT_KIT_SECRET`, `PRINTKIT_CALLBACK_SECRET` | Optional printing integration                    |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`          | Optional order-ready web push                    |

See [.env.example](.env.example) for the full configuration contract and
[deployment notes](docs/DEPLOY.md) for environment scoping. In particular,
`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` is Production-only; setting `.merqo.io` on a
preview hostname breaks authentication. Preview deployments use the staging
Supabase project, not production (see the deployment notes). Missing Merqo legal configuration
prevents signed-in vendors from passing the legal-acceptance gate.

## Database setup

qkit uses the `qkit` schema in a shared Merqo Supabase project. Apply **all**
ordered migrations through the Supabase CLI; applying only
`0001_initial_schema.sql` does not create the current application database.
Review the target environment and [database documentation](supabase/README.md)
before applying changes. Do not reset or seed a production database as part of
routine development.

Local tests require Docker and a running local Supabase stack. The pgTAP suite
creates its own fixtures and rolls them back. Customer E2E tests additionally
need the CI auth bootstrap and coffee-cart seed; the vendor fulfillment E2E
also needs the `e2e-merqo-stub.sql` seed. Some shared Merqo integration paths
require the sibling schema; see [E2E setup](e2e/README.md) and
[test documentation](test/README.md).

```bash
pnpm exec supabase start
pnpm exec supabase test db
```

Schema changes belong in a new migration, with the TypeScript DB contract in
`src/lib/types.ts` kept consistent. Historical migrations are required to rebuild
the schema and must not be deleted merely because a later migration replaces a
function.

## Main routes

| Route                                          | Audience           | Purpose                                              |
| ---------------------------------------------- | ------------------ | ---------------------------------------------------- |
| `/login`                                       | Vendor             | Sign-in and registration; `/register` redirects here |
| `/onboarding`                                  | Signed-in vendor   | Initial vendor setup                                 |
| `/dashboard`                                   | Vendor             | Realtime order board and walk-up orders              |
| `/dashboard/booths`                            | Vendor             | Booth, menu, payment and printing configuration      |
| `/dashboard/stats`                             | Vendor             | Sales, service and review statistics                 |
| `/o/[code]`                                    | Customer           | Current short-QR menu and ordering entry point       |
| `/order/[boothId]`                             | Customer           | Legacy entry-point handling                          |
| `/order/[boothId]/pay?t=…`                     | Customer           | Token-authorized payment submission                  |
| `/order/[boothId]/[orderNumber]?t=…`           | Customer           | Token-authorized order tracking                      |
| `/order/[boothId]/display`                     | Public display     | Queue display                                        |
| `/order/[boothId]/pickup`                      | Pickup kiosk       | Collection scanner                                   |
| `/admin`                                       | qkit administrator | Vendor and platform administration                   |
| `/api/merqo/*`, `/api/printkit/*`, `/api/v1/*` | Integrations       | Independently authenticated endpoints                |

## Payments and notifications

Paykit owns payment configuration and transactions. qkit stores a minimal booth
payment marker and an order payment-status mirror. A vendor enters payment
details in Paykit only: the booth form has a switch for whether that booth
takes payment, names what Paykit has on file, and links to Paykit's setup
page. qkit reads that configuration and never writes it. Customer collection, vendor
pickup and fulfillment undo never confirm or reverse payment. Completed unpaid
orders retain an explicit payment-confirmation action. Payment actions inspect Paykit's returned
state before updating that mirror; a successful HTTP response alone does not
prove the requested transition occurred. Merqo owns shared vendor profiles, legal
acceptance and Telegram connections; printkit owns printer integration.

Booth, menu and payment images upload when the vendor saves. Profile avatars
upload on selection. Cleanup removes replaced or unreferenced uploads while
preserving images still referenced by the vendor's data.

## Verification

```bash
pnpm check          # formatting, ESLint, TypeScript
pnpm test           # unit/component tests; real-DB tests opt in separately
pnpm test:coverage  # v8 coverage across production source, including untested files
pnpm build          # production build
pnpm test:e2e       # Playwright; local Supabase required for order flows
pnpm test:mutation  # advisory mutation analysis of src/lib
pnpm audit --prod --audit-level=high
```

Coverage measures executed code, not security assurance. Mocked tests do not
replace pgTAP isolation tests or the real checkout lifecycle. Real-DB Vitest tests
require `RUN_DB_TESTS=1` plus explicitly supplied `QKIT_TEST_SUPABASE_URL` and
`QKIT_TEST_SUPABASE_SECRET_KEY` for an isolated test database; they never load an
application environment file.

ESLint extends Next and SonarJS recommended rules. Unused TypeScript values,
inline comments in application code, and commented-out code fail the gate.
Underscore-prefixed intentionally unused values and tooling directives remain
supported. Comments explain a durable constraint or reason; change history
belongs in commits and [CHANGELOG.md](CHANGELOG.md).

Husky runs staged formatting/lint, type checks, a conditional lockfile check,
and gitleaks when installed. README and comment-hygiene reminders are advisory.
Pre-push runs the harness integrity check and project checks/tests. Never bypass
hooks to make a failing change pass. CI also runs build, security and database
checks; inspect `.github/workflows/` for the actual job conditions.

## Repository guide

- [src](src/README.md): routes, components, hooks and domain utilities.
- [supabase](supabase/README.md): migrations, seeds and pgTAP checks.
- [test](test/README.md) and [e2e](e2e/README.md): test layers and prerequisites.
- [docs](docs/README.md): operations, design history and audit findings.
- [scripts](scripts/README.md): opt-in demo recording/composition tools and the staging migration loader. `.gitattributes` keeps `*.sh` on LF line endings.
- [public](public/README.md): static assets (seed images and the service worker).
- [AGENTS.md](AGENTS.md) and [constitution](docs/CONSTITUTION.md): project rules.
- [.claude](.claude/README.md) and [.husky](.husky/README.md): agent and Git hooks.
- [October audit](docs/meta/2026-10-07-project-audit.md): findings, verification,
  remaining risks and the tracked-file inventory.

Vercel deployments use the Singapore region (`vercel.json`). Preview and
Production currently share a database; treat preview writes as real data changes.

CSV exports quote embedded line breaks and prefix spreadsheet formula-like text
with an apostrophe. Prices and derived monetary totals remain numeric. Importing
an exported formula-like name retains that protective apostrophe as literal text.

Order-board advance requests include the status shown when staff tapped. If
another device already advanced the order, the stale tap asks for a refresh
instead of advancing it a second time. Bulk Mark Ready applies this same guard
and reports partial failures.

Live queue reads page through the database API limit and reject partial results
when a later page fails. ID cursors prevent earlier orders leaving the queue
from shifting later pages. Dashboard booth filters use bounded batches; optional
cup counters run with bounded concurrency and cannot fail the board.

## Security headers and MFA

`src/proxy.ts` sets a nonce CSP on every page and `X-Robots-Tag` off production. The admin area requires TOTP MFA; see `src/app/mfa/README.md` and `docs/security/`.
