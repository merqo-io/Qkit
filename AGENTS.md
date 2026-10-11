<!-- templateCentral: nextjs@6.0.1 (Supabase variant — NOT better-auth/Drizzle) -->

# AGENTS.md — qkit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What qkit is

Vendor booth ordering system. Vendors sign in to manage menus and watch live
orders; customers order from a QR-linked booth page and track status in realtime.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · React Hook Form · Zod · Supabase (`@supabase/ssr`)
Vitest · pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; ~1 min)
pnpm test:e2e     # playwright e2e smoke (needs local Supabase up — see below)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

E2E (Playwright, `e2e/`) is a small critical-path smoke against a REAL local
Supabase — it covers the `proxy.ts` auth guard and customer checkout through
payment claim and initial numbered tracking. Vendor fulfillment and pickup are
not covered by this smoke suite. To run:

1. Docker running, then `supabase start`
2. apply migrations + the `supabase/seed/coffee-cart.sql` seed
3. `pnpm test:e2e` (auto-starts `pnpm dev`)
   `auth-guard.spec.ts` needs only a booting app; `customer-order.spec.ts` needs
   the coffee-cart seed (the "Kopitiam Cart" booth).

Mutation testing (Stryker) is scoped to `src/lib` — the pure business logic.
Components/actions/supabase clients are excluded (I/O- or DOM-bound, low signal).
**Advisory only** — non-blocking (no CI gate); run on demand when changing
`src/lib` and treat survivors as a review prompt (many remaining are equivalent
mutants). Component behavior is covered by RTL+jsdom tests (`*.dom.test.tsx`),
unit logic by node tests (`*.test.ts`).

## File Layout

```
src/app/                        — app router (pages, layouts, server actions)
src/app/(auth)/                 — login page: email/password sign-in + sign-up; Google OAuth via src/app/auth/callback
src/app/dashboard/              — vendor dashboard (realtime order board)
src/app/order/[boothId]/        — customer menu + cart + placeOrder action
src/app/order/[boothId]/[orderNumber]/ — live order status page
src/app/o/[code]/               — short-QR customer entry point + placeOrder action
src/proxy.ts                    — Supabase session refresh + /dashboard guard (Next 16)
src/lib/supabase/               — browser / server / service clients + mw helper
src/lib/merqo/                  — everything between qkit and merqo, the hub
src/lib/merqo/customer-notify.ts — mintCustomerConnectToken/notifyCustomer/notifyVendor:
                                    HTTP client calling merqo's customer-connect-token/
                                    notify-customer/notify-vendor endpoints (kit → merqo,
                                    the new direction — see below)
src/lib/admin/                  — admin-only logic (access gate, fleet stats, vendor health)
src/lib/booth/                  — booth helpers (access limits, short codes, colours, images)
src/lib/types.ts                — DB types (mirror of supabase/migrations)
src/lib/schemas.ts              — Zod schemas for forms + actions
src/components/ui/              — shadcn primitives (CLI-managed, do not hand-edit)
src/components/widgets/         — presentational pieces used by more than one feature
src/components/layout/          — app-shell pieces mounted once in the root layout
src/components/board/           — the vendor's order ticket and what hangs off it
src/components/order/           — the customer ordering flow
src/components/landing/         — the landing page
src/components/tour/            — the dashboard's guided tours
src/hooks/use-realtime-orders.ts — Supabase realtime subscription
supabase/migrations/            — SQL schema + RLS + realtime publication
```

## Data model

- `vendors` (id = auth.users.id), `booths` (JSONB `menu_items`),
  `orders` (JSONB `items`, `order_status` enum: pending→confirmed→preparing→ready→completed, + cancelled).
- RLS: a vendor sees/edits only their own `vendors` row, their own `booths`,
  and `orders` whose `booth_id` belongs to them. Customer ordering uses constrained SECURITY DEFINER RPCs;
  anon/authenticated callers cannot directly insert orders. Public booth data
  comes from the sanitized ordering RPC. The customer status
  page reads via the **service-role client** (bypasses RLS) — server-only.
- **Payments route through paykit** (a sibling kit; see
  `../paykit/AGENTS.md`) as of the 2026-08-11 cutover — see "paykit checkout
  cutover" in Project-Specific Notes below. `booths.payment` (JSONB) and
  `orders.payment_status` (enum) are unchanged schema-wise and still written,
  but `booths.payment` now holds only a minimal `{kind}` marker (the full
  PayNow/pointer config lives in paykit's `vendor_payment_config`, vendor-
  scoped) and `orders.payment_status` is a local mirror of paykit's
  transaction state, not the primary record.
- **`booths.paykit_booking_id`** (migration 0083, 2026-08-26): nullable
  text, event-mode booths only (see `walkup_default`, `0080`) — a vendor-
  pasted link to a booking they created in paykit's own `bookings` table
  (`paykit/AGENTS.md`'s Data model section). Unvalidated at write time,
  same trust level as the "quick add PayNow" config section — no lookup or
  matching by name/phone (qkit stores no customer phone on orders at all).
  Read back read-only via paykit's `GET /api/v1/bookings/{booking_id}`
  (`getBookingStatus`, `src/lib/paykit/client.ts`) to show live deposit/
  balance status on the booth edit page (`BookingStatusSection`).
- **Vendor Telegram alerts, Phase A → A2** (2026-08-16): Phase A shipped
  qkit's own per-kit Telegram bot (`vendor_telegram`/`telegram_link_tokens`
  tables, a webhook route, a dashboard settings section) for vendor
  new-order alerts. Phase A2, shipped the same day, **retires all of it** —
  a vendor shouldn't hold two unrelated "talking to Merqo" bot connections
  once merqo has its own shared bot (`POST /api/merqo/vendor-connect-token`,
  `POST /api/merqo/notify-vendor`). Migration `0077` drops both `0076`
  tables; `placeOrder`'s vendor alert (`notifyVendorTelegram` in
  `src/app/o/[code]/notify.ts`) now calls `notifyVendor` in
  `src/lib/merqo/customer-notify.ts` instead of a local lookup + Bot API
  call — same name, same call site, same never-blocks-order-placement
  guarantee, only the internals changed. No connection data carried over: private chat IDs identify the same
  Telegram user across bots, but the user must initiate a conversation with
  each bot before it can message them. Vendors who linked qkit's retired bot
  must reconnect once via merqo's own `/profile` page. The superseded Phase
  A design lives on as history at
  `docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`; the
  current design is
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.
- **Customer Telegram connect** (2026-08-16, Phase B+D of the cross-kit
  Telegram integration design): a new architectural direction — this is the
  first **kit → merqo** HTTP call in this codebase (every existing cross-kit
  call up to this point flows merqo → kit, e.g. metrics pull,
  vendor-provision). No new qkit table, no new webhook — the customer's
  Telegram connection lives entirely in `merqo.customers`, owned by merqo.
  `src/lib/merqo/customer-notify.ts` calls merqo's bearer-secret
  (`MERQO_CUSTOMER_SECRET`) `POST /api/merqo/customer-connect-token` (mints
  a deep-link token, rendered by the order-status page's `TelegramConnect`
  component while an order isn't yet `ready`) and `POST
/api/merqo/notify-customer` (fired from `advanceOrder`'s `ready`
  transition, `notify_ref` mode, `` `qkit:${order.id}` ``). Both fail
  closed/never throw — a merqo outage never breaks the order-status page or
  changes `advanceOrder`'s own result. See
  `docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`.
- **Customer notify vendor toggle** (2026-08-16, fast-follow on the above):
  `boardSettingsSchema` (`src/lib/schemas.ts`) gained one more
  `board_settings` key, `customer_telegram_notify_enabled:
z.boolean().default(true)` — a vendor-side opt-out for the `ready`-transition
  Telegram ping, distinct from the customer's own consent above (which this
  never touches). `advanceOrder` (`src/app/dashboard/order-actions.ts`)
  reads+parses the vendor's `board_settings` via a new
  `customerNotifyEnabled` helper before firing `notifyCustomer`, skipping
  the call only on an explicit `false`; an unparseable/missing row (every
  vendor whose row predates this key) fails open. Surfaced as a `Switch`
  next to "Auto-clear after" in dashboard settings
  (`src/app/dashboard/settings/settings-form.tsx`). See
  `docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (currently ssr 0.10.x ↔ supabase-js 2.48.x — check package.json, not this
  number, since both get bumped) or every query degrades to `never`.
- After editing the schema, update both `supabase/migrations/` and `src/lib/types.ts`
  (or run `supabase gen types typescript` once the CLI is installed).

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |
| `/security-scan`    | local secret scan (gitleaks) + dependency audit before push  |
| `/changelog`        | append a Keep-a-Changelog entry under `[Unreleased]`         |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

**5.0 → 5.7 review (2026-07-03):** version marker + `harness.json` bumped to 5.7.0.
Deliberately **not** adopted (Supabase-variant / bespoke-harness divergence, each
a conscious choice — don't let a future drift-check "fix" them):

- **pino route-logging enforcement** (5.7) — pino was removed as an unused dep;
  qkit's API surface (one route) logs via `console.error`, not the tc `withLogging`
  wrapper. No `scripts/check-route-logging.mjs` gate.
- ~~**lefthook** (5.2) — qkit uses husky + lint-staged; not migrating the git-hook system.~~
  Superseded — see the 2026-07-24 entry below.
- **tc CI gates + `.harness-base`** (5.2–5.3) — qkit has its own CI
  (`.github/workflows/{ci,security}.yml`); no harness re-sync base exists (seeded
  pre-5.3), so `migrate` Phase-5 3-way merge is N/A. (`verify-harness.sh` itself
  _was_ adopted as part of the 2026-07-24 lefthook migration, without the
  `.harness-base` 3-way-merge machinery.)
- **password min-12 on the login schema** (5.5) — would lock out existing 8-char
  sign-ins; Supabase Auth config owns the real policy.
- **`src/features/<name>/`** (2026-10-09 structure cleanup) — a feature's
  components live beside its routes in `src/app/**`, each folder with its own
  README. Moving them is hundreds of import edits for a layout that reads no
  better. Shared pieces do follow the standard: `src/components/widgets/`,
  `src/components/layout/`, `src/components/ui/`.
- **Barrel `index.ts` files** (same cleanup) — these folders mix Server and
  Client Components. A barrel re-exporting both pulls server code towards
  client bundles, and a Server Component importing a plain value through a
  `"use client"` barrel gets a client reference, not the value (the
  `SOCIAL_LINK_FIELDS` crash of 2026-09-18). Import by full path.

Adopted: build-artefact `Read` denies in `settings.json` (context hygiene, 5.4).

**Cherry-picked 5.8 comment gate (2026-07-10):** not a full 5.7→5.9 re-review,
just this one delta. `no-inline-comments` flipped `warn` → `error` (own-line
comments only, ignore-pattern for `eslint-`/`@ts-`/`prettier-`/coverage
directives) and `sonarjs/no-commented-code` added at `error` (blocks
committing dead commented-out code) — `eslint-plugin-sonarjs` is a new
devDependency. Both hard-block `pnpm check`/CI now. Test files and `scripts/`
keep `no-inline-comments` off (unchanged rationale: table-driven fixtures read
better with a trailing note).

**Unused-vars gate + harness permission fix (2026-07-16):** neither `tsconfig.json`
(no `noUnusedLocals`/`noUnusedParameters`) nor `eslint-config-next`'s own
`next/typescript` block flagged unused vars/imports — a real gap, found by
diffing against templateCentral 5.11's scaffold `eslint.config.mjs`. Added
`@typescript-eslint/no-unused-vars: 'warn'` (`^_`-prefix ignore pattern,
matching this project's existing convention), reusing the `@typescript-eslint`
plugin instance `eslint-config-next` already registers rather than adding a
second direct dependency on it. Caught one real dead import on first run
(`OrderStatusBadge` in the order-status page), now removed.

**Permission-rule correction (2026-07-17):** the 2026-07-16 entry above added
separate `Write(...)` ask-rules alongside `Edit(...)` for the governance files,
believing `Edit`/`Write` were independently matched. Verified this is wrong:
the permission-rule matcher covers `Write(path)` under `Edit(path)` — only
`Edit(...)` is needed. The redundant `Write(...)` entries were removed from
`.claude/settings.json`, back to `Edit(...)`-only.

**Lefthook migration (2026-07-24):** superseded the 2026-06-05 husky decision;
migrated the git-hook layer to lefthook and split the previously-inline
`node -e` one-liners in `.claude/settings.json` into standalone
`.claude/hooks/*` script files, to match the other 3 built-out kits'
(loopkit/stockkit/paykit) and merqo's harness architecture. `husky` +
`lint-staged` and `.husky/` are gone; `scripts/check-readme-freshness.mjs`
was replaced by `.lefthook/readme-coupling.sh` (same non-blocking nudge,
now run as a lefthook pre-commit command instead of a husky script).
Net-new: `lefthook.yml`, `.lefthook/`, `.gitleaks.toml`,
`.claude/verify-harness.sh` (harness integrity sensor, wired into
`pre-push` and CI) and `.claude/regen-harness.sh` (human-run-only baseline
rewrite). This also picks up the security hardening already reflected in
the hook scripts themselves: the `LEFTHOOK=0`/`core.hooksPath=` bypass block,
a broadened `--no-verify` regex, protected-branch/force-push/guard-file-checkout
guards, environment-file write protection, and OWASP LLM02 credential-leak detection in the prompt guard.
`SubagentStop` is a net-new hook (qkit previously had none). `harness.json`'s
`templatecentral_version` marker moved 5.7.0 → 5.11.0 — the 5.8–5.11 feature
deltas (comment gate, README governance/richReadme, unused-vars gate) were
already reviewed in the entries above; this migration closes the one
remaining architectural gap (the git-hook layer + hook-script-file layout).

**husky migration (2026-08-01):** superseded the 2026-07-24 lefthook decision
— lefthook's `lefthook.exe` is unsigned and Windows Smart App Control blocks
it unconditionally on this machine (Code Integrity events, "did not meet the
Enterprise signing level requirements"), which has no signed-binary
workaround (winget's `evilmartians.lefthook` package ships the identical
unsigned upstream binary). husky v9 has no native binary in its execution
path. Same enforcement rigor (every lefthook check ported into `.husky/*`
shell scripts); the Windows-path-with-space workarounds
(`.lefthook/commit-msg/commit-msg.sh`'s argv-rejoin wrapper) are deleted, not
ported — husky has no equivalent templating bug to work around. This was a
cross-repo decision (qkit/loopkit/stockkit/paykit/merqo all made the same
lefthook→husky call, not a qkit-local one) — see the workspace-level design
doc at `../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree, alongside the other cross-kit specs.

**No-em-dash hard gate (2026-09-01):** the house "no em dash in user-facing
copy" convention (already a standing rule, e.g. `[[project_tour_guide_retrigger_fix]]`'s
walk-up-copy fix) kept recurring because nothing actually enforced it — a
memory note isn't a gate. `eslint.config.mjs` now hard-blocks the literal
character (`—`) in `.tsx` `JSXText`, in the handful of JSX attrs that
routinely carry copy (`aria-label`/`title`/`placeholder`/`label`/`content`/
`description`), and in `toast.*` call arguments — scoped narrowly so it
can't false-positive on internal log/error strings or non-UI constants,
and it doesn't touch `.md` files at all (READMEs/CHANGELOG/specs keep
their own em-dash-heavy prose style, unaffected). Test files are excluded,
same as the other UI-only lint gates. Found and fixed 5 pre-existing
violations on first run (`banner-form.tsx` x2, `menu-manager.tsx`,
`settings-form.tsx`, `telegram-connect.tsx`).

**templateCentral 6.0.1 review (2026-10-11):** version marker and
`harness.json` moved 5.15.0 → 6.0.1. 6.0's headline claim, that 5.x hooks
never ran, did not apply here: it concerns an array-valued `command`, and
qkit's were shell strings that did fire. Adopted, each because it fixed
something real in this repo:

- Hook commands anchored on `${CLAUDE_PROJECT_DIR}`, with timeouts. The old
  relative paths resolved against the shell's current directory, so after a
  `cd` they could miss, or pick up another worktree's copy of the scripts.
- `stop-checks.sh` skips the test run on a clean tree; `subagent-stop.sh`
  skips read-only agents; `post-edit-typecheck.sh` reports through
  `additionalContext` (its plain stdout never reached the agent).
- The skill-usage matcher (`Skill__.*` never matched; now `Skill`).
- The per-segment `block-no-verify.sh`, ported to husky: closes a
  hook-skipping flag on push, `--force-with-lease`, `HEAD:main`, deleting a
  protected branch and `bash -c` wrappers, and stops blocking a commit piped
  to `tail -n`. A multi-line `-m "…"` message that quotes a blocked command
  is still read as a command; pass the message with `-F`.
- `protect-files.sh`: symlinked parents resolved, `notebook_path` read,
  relative paths anchored on the project root.
- `verify-harness.sh` fails on an unreadable or empty manifest.
- The commit-msg gate accepts `type(scope)!:` and the messages git writes
  itself (`Revert "…"`, `fixup!`, `squash!`, `amend!`).
- `post-tool-failure.sh` removed (the agent already sees tool errors).

Deliberately **not** adopted:

- **Exec-form hooks** (`"command": "bash", "args": [...]`). On Windows a
  bare `bash` resolved without a shell can be `System32\bash.exe`, the WSL
  launcher, rather than Git Bash, which would silently stop every hook. The
  shell-string form with a quoted `${CLAUDE_PROJECT_DIR:-.}` gets the same
  directory independence and was confirmed firing.
- **Stop timeout 300s.** This suite takes 9 to 16 minutes locally; 1200s.
- **`gitleaks git --pre-commit` and `[[allowlists]]`.** gitleaks is not
  installed on the machine this review ran on and the CI action's bundled
  scanner version is unverified, so neither form could be tested. The
  current `gitleaks protect --staged` and `[allowlist]` still work.
- **Narrowing the prompt guard's "disregard your" / "override your"
  phrases.** They only raise an advisory here, never a block.
- **lefthook, ESLint 10, pnpm 12, the CI gitleaks CLI, `.harness-base`,
  better-auth / Drizzle items.** Unchanged reasons; see the entries above.
- **pnpm ≥ 11.11.0 and `eslint-plugin-sonarjs` 4.2.2** are wanted (pnpm for
  two security advisories) and left for their own dependency PR.

## AI Harness

PreToolUse: `protect-files.sh` normalizes Windows and relative paths and
hard-blocks (exit 2) reads/writes to `.env*` (except `.env.example`/`.env.default`),
secrets directories and cert/credential files, and asks for human approval (via a `permissionDecision`
JSON payload) on other protected files (`AGENTS.md`/`CLAUDE.md`,
`docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*`,
`.claude/agents/*`, `.mcp.json`, the harness manifest/verifier/regen scripts,
`Dockerfile`, `.gitleaks.toml`, `.husky/*`); `block-no-verify.sh`
blocks `--no-verify`/`-n` on `git commit`, `HUSKY=0`/`HUSKY_SKIP_HOOKS`/
`core.hooksPath=` bypasses, direct commits to `main`, force-push to a protected
branch, `git checkout/restore` on guard-layer files, and recursive-force `rm`
on source directories. App code, skills and specs are unrestricted. CI/CD workflow writes ask for
human approval; they are not hard-blocked. Governance reads are permitted.
UserPromptSubmit: `user-prompt-guard.cjs` emits advisory context for injection phrases
(so legitimate security investigation is permitted) and blocks embedded credentials — AWS keys, GitHub PATs,
Anthropic API keys, PEM blocks, DB/broker URLs (OWASP LLM02); exit 2 blocks.
PostToolUse: `post-edit-typecheck.sh` runs incremental `tsc --noEmit` after
every Edit/Write to a `.ts`/`.tsx` file and returns any errors through
`additionalContext` (feedback-only); `skill-usage-log.sh` logs every skill
invocation to `.claude/skill-usage.log`.
Stop: `stop-checks.sh` exits 0 when `stop_hook_active` (no re-entry loop) or
when nothing is uncommitted (no tracked change, no new untracked file); else
runs the test suite, exit 2 feeds failures back, exit 0 on pass.
SubagentStop: `subagent-stop.sh` type-gates a subagent's uncommitted `.ts`/`.tsx`
changes before it can hand back control; read-only `Explore`/`Plan` agents and
clean trees skip it.
Every hook command is anchored on `${CLAUDE_PROJECT_DIR}` and each script
`cd`s there first, so the hooks keep working after the shell changes
directory; each carries a timeout.
SessionStart (startup|resume|clear|compact): `session-context.sh` re-injects
the first 30 lines of this file, all of `docs/CONSTITUTION.md`, and a fixed
list of always-on invariants. PostCompact also fires after compaction and its
stdout is injected as context too — both PostCompact and
`SessionStart(source: compact)` are valid re-injection mechanisms, but
SessionStart also covers session resume and startup, so it stays the single
seeded path here.
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; static `deny` rules cover common secret
filenames and directories. The file-tool hook covers all `.env*` variants
except the blank templates. Static rules also cover build-artefact reads
(`node_modules`, `.next`, `dist`, `coverage`, `.turbo`, `*.tsbuildinfo`, root
and `./**/` forms), and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). `ask`
gates `Edit(...)` (covers both Edit and Write calls) on the medium-security
governance files: `AGENTS.md`,
`CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/harness.json`, `.claude/settings.json`,
`.claude/settings.local.json`. Deny always wins over ask/allow (enforced even
under bypass); it's a guardrail, not a sandbox — prefix-matched and
wrapper-bypassable. CI security: `.github/workflows/security.yml`
(gitleaks v3 + CodeQL + `pnpm audit`) and `.github/dependabot.yml` (security-only).
Git hooks (husky): `pre-commit` runs format/lint (`prettier`+`eslint --fix`
on staged `.ts/.tsx/.js/.mjs/.cjs`), format-docs (`prettier --write` on staged
`.json/.md/.css`), `tsc --noEmit`, a frozen-lockfile install check, a gitleaks
secret-scan on staged files (if gitleaks is installed), and the README-coupling
nudge (`.husky/lib/readme-coupling.sh`); `commit-msg` enforces Conventional
Commits (`.husky/lib/commit-msg-check.sh`); `pre-push` runs
`.claude/verify-harness.sh` (integrity check) plus `pnpm run check && pnpm
test`. The integrity verifier checks committed HEAD blobs; it does not check
uncommitted guard edits and is not currently a CI job. Config: `.husky/` (plain shell hook files, no native binary — migrated
2026-08-01 off lefthook, whose unsigned `lefthook.exe` Windows Smart App
Control blocks unconditionally; a cross-repo decision, see the
workspace-level design doc at
`../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree).
Secret-scan ruleset: `.gitleaks.toml`.
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- **Inviolable rules:** `docs/CONSTITUTION.md` (RLS-is-authz, service-role
  server-only, Zod boundaries, no secrets in `NEXT_PUBLIC_*`, deny-rules are a
  guardrail not a sandbox). Read it before changing auth, schema, or the harness.
- Plan of record: `docs/superpowers/plans/2026-06-05-qkit-core.md` (specs in
  `docs/superpowers/specs/`; roadmap/audit/task-registry meta docs in `docs/meta/`).
- Migrated 15→16 on 2026-06-05 (`middleware.ts`→`proxy.ts`, `next lint`→eslint CLI).

**paykit checkout cutover (2026-08-11):** qkit's local PayNow QR builder and
payment-config UI were previously self-contained (`src/lib/payments/`,
`booths.payment`, `orders.payment_status`); this cutover (explicitly
authorized — see the design precedent in paykit/AGENTS.md's "later, separate
cutover spec" note, now acted on) replaces the actual checkout mechanics with
calls to paykit's `/api/v1/*` HTTP API (`src/lib/paykit/client.ts`):
vendor PayNow/pointer config now saves to paykit's vendor-scoped
`vendor_payment_config` (`dashboard/booths/actions.ts`'s `saveBooth`, still
surfaced through the unchanged `PaymentSection` UI), and the customer
checkout render + claim + vendor confirm (`order/[boothId]/[orderNumber]/
page.tsx`+`payment-actions.ts`, `dashboard/order-actions.ts`'s
`confirmOrderPayment`) call paykit's `createCheckout`/`claimCheckout`/
`confirmCheckout`. `src/lib/payments/` (the local EMVCo QR builder +
render-adapter) is deleted — nothing reads/writes the full `booths.payment`
config shape anymore. Two things deliberately were **not** changed, per this
cutover's own scope:

- `booths.payment` still gets a minimal `{kind}` write (see
  `paymentMarker` in `booths/actions.ts`) — `qkit.place_order` and
  `qkit.place_walkup_order` (SQL, migrations 0056/0060-61, out of scope for
  this cutover) still read `booths.payment->>'kind'` to decide a new order's
  initial `payment_status`, and there's no SQL-side way to ask paykit
  instead without a further migration.
- `orders.payment_status` stays qkit's local mirror, written after a
  successful paykit call, not replaced — the rest of the order-lifecycle
  logic that depends on it (cancel-blocking and explicit payment confirmation in
  `confirmOrderPayment`, the realtime board) is unaffected by this cutover.

**Fulfillment/payment separation (2026-10-09):** the August cutover retained
local auto-confirmation on pickup. The audit supersedes that behavior:
`buildAdvancePatch` and fulfillment undo now modify only fulfillment state.
Only explicit Paykit-backed confirmation updates the payment mirror; completed
unpaid orders retain a settlement action. See
`docs/meta/2026-10-09-qkit-fulfillment-payment-isolation-review.md`.

**Follow-up gaps closed (2026-08-12):** paykit added an unclaim endpoint and
started returning full config fields on its vendor-config GET; qkit's side
of both fixes landed together — the customer's "Tapped by mistake? Undo"
affordance is back on `pay-panel.tsx` (`unclaimPayment`/`unclaimCheckout`,
same paykit-is-source-of-truth pattern as `claimPayment`), and re-opening the
booth-edit Payment section now prefills from paykit's
`GET /api/v1/vendors/{id}/config` (`getVendorConfig` in `paykit/client.ts`)
instead of starting every text field blank — the `{kind}`-only marker is now
only a degrade-path fallback (`initialPaymentFromMarker` in
`dashboard/booths/[boothId]/page.tsx`) for when that call fails.

`PAYKIT_KIT_SECRET` is set on qkit's Production and Preview environments,
matching the key paykit's own `AGENTS.md` records minting for qkit during
this cutover — not independently re-verified against a live checkout
here, so treat a real checkout failure as a genuine regression to
investigate, not evidence the key was never set.

**Preview OAuth break, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` env-scope gap
(2026-08-13):** Google login on preview deploys was failing
(`/login?error=oauth`) because Vercel had `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=
.merqo.io` (from the 2026-08-02 cross-kit SSO work) scoped to Preview as
well as Production, contrary to `.env.example`'s own comment. A
`Domain=.merqo.io` cookie is silently rejected by the browser on a
`*.vercel.app` host, so the PKCE `code_verifier` cookie never got written
and `exchangeCodeForSession` (`src/app/auth/callback/route.ts`) failed
locally with no network call and no log — fixed by adding an error log on
that branch and rescoping the Vercel env var to Production-only. Full
writeup: `docs/DEPLOY.md`'s new "Production vs Preview environment
variables" section. Deliberately **not** doing yet, per user decision same
day: splitting Preview onto a separate staging Supabase project — Preview
and Production still share one Supabase project; revisit later, not
urgent.

**Vendor Telegram alerts, Phase A → A2 (2026-08-16):** Phase A (a vendor
connects qkit's own Telegram bot once via a deep-link QR in dashboard
settings; a webhook route verifies Telegram's
`X-Telegram-Bot-Api-Secret-Token` before touching any data) shipped and was
retired the same day by Phase A2, once the sibling merqo repo shipped a
shared bot every kit calls into instead of running its own. `placeOrder`
(`src/app/o/[code]/notify.ts`'s `notifyVendorTelegram`) still fires a
redundant new-order alert to the booth's vendor, entirely best-effort and
wrapped so a failure can never affect order placement itself (tested
explicitly, not just claimed — see `actions.place-order.test.ts`'s "vendor
alert" block) — only its internals changed, from a local
`vendor_telegram`/Bot API call to `notifyVendor` in
`src/lib/merqo/customer-notify.ts`. See the Data model section above and
`docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.
Distinct from, but sharing the same underlying-bot concept as, the
still-draft customer-facing
`2026-07-18-vendor-notification-channels-design.md` (not built here).

<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
