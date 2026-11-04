<!-- templateCentral: nextjs@7.2.2 (Supabase variant — NOT better-auth/Drizzle) -->

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
Vitest · pnpm 11 · Node ≥24.22.1 · deploy target: Vercel

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

Gate before a PR: the `next-verify` skill (typecheck + lint + test + build), or
`pnpm check` and `pnpm test`. The full suite takes 9 to 16 minutes and `pre-push`
runs it, so run one suite at a time.
E2E and mutation testing procedure: `docs/TESTING.md`.

## Data model (summary)

- `vendors` (id = auth.users.id), `booths` (JSONB `menu_items`), `orders` (JSONB
  `items`, `order_status` enum: pending→confirmed→preparing→ready→completed, + cancelled).
- RLS: a vendor sees/edits only their own `vendors` row, their own `booths`, and
  `orders` whose `booth_id` belongs to them. Customer ordering uses constrained
  SECURITY DEFINER RPCs; anon/authenticated callers cannot insert orders directly.
  Public booth data comes from the sanitized ordering RPC. The customer status page
  reads through the **service-role client** (server-only).
- **Payments are paykit's** (sibling kit, `../paykit/AGENTS.md`), called through
  `src/lib/paykit/client.ts`. `booths.payment` is only a `{kind}` marker that
  `qkit.place_order`/`place_walkup_order` SQL reads; `orders.payment_status` is a
  local mirror of paykit's state. Fulfillment transitions never mutate payment
  state; only explicit Paykit-backed confirmation does.
- Telegram notifications go through merqo (`src/lib/merqo/customer-notify.ts`),
  fail closed, and must never block order placement or `advanceOrder`.
- Integration history and detail (paykit cutover, `booths.paykit_booking_id`,
  Telegram Phase A→A2, customer connect and notify toggle): `docs/DATA-MODEL.md`.

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
- Never read or write `.env*` (except `.env.example`), secrets or credential files.
- Never bypass hooks (`--no-verify`, `HUSKY=0`, `core.hooksPath=`), commit directly
  to `main`, or force-push a protected branch.
- Ask the owner before editing `AGENTS.md`, `CLAUDE.md`, `docs/CONSTITUTION.md`,
  `.claude/settings.json`, `.claude/harness.json`, `.claude/hooks/*`, `.husky/*`
  or CI workflows.
- Read `docs/CONSTITUTION.md` before changing auth, schema or the harness.

## Gotchas

- UI copy: no em dash (`—`) in `.tsx` text, copy attributes or `toast.*` args; ESLint hard-blocks it.
- Comments: `no-inline-comments` and `sonarjs/no-commented-code` are errors.
- No `src/features/` and no barrel `index.ts`: barrels mix Server and Client
  Components and a Server Component gets a client reference instead of the value
  (the `SOCIAL_LINK_FIELDS` crash).
- Git hooks are husky, not lefthook: Windows Smart App Control blocks the unsigned `lefthook.exe`.
- Hooks stay shell-string form, not exec-form: a bare `bash` can resolve to the WSL launcher.
- Stop hook timeout is 1200s on purpose; the suite is slow.
- No pino, and the login schema keeps its 8-char password minimum (Supabase Auth owns the policy).
- `git commit -m` with a multi-line message that quotes a blocked command is read
  as that command: pass the message with `-F`.
- `cd "$W" && git commit` is judged by the project root's branch: use a bare
  `git commit` or `git -C <literal path>`.
- `Edit(path)` permission rules cover `Write` too; never add separate `Write(path)` rules.
- Preview vs Production `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` must differ in scope; see `docs/DEPLOY.md`.
- Previously reviewed non-adoptions of templateCentral features are listed in
  `docs/meta/templatecentral-adoption-log.md`; do not "fix" them as drift.

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test + build in one pass                  |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |
| `/security-scan`    | local secret scan (gitleaks) + dependency audit before push  |
| `/changelog`        | changelog entry under `[Unreleased]` or bumped version       |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:
| Skill | When to use |
|-------|-------------|
| `templatecentral:standards` | naming/validation/drift-check (expect Supabase-vs-tc drift findings) |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

## AI Harness (summary)

Full text: `docs/meta/ai-harness-reference.md`. Manifest: `.claude/harness.json`.

- PreToolUse `protect-files.sh`: hard-blocks `.env*` (except `.env.example`),
  secrets directories and credential files; asks approval for governance and harness files.
- PreToolUse `block-no-verify.sh`: blocks hook-skipping flags and env bypasses,
  direct commits to `main`, force-push to protected branches, guard-file checkout
  and recursive-force `rm` on source directories.
- UserPromptSubmit `user-prompt-guard.cjs`: advises on injection phrases, blocks embedded credentials.
- PostToolUse: incremental typecheck and comment-hygiene feedback after edits.
- Stop and SubagentStop: run tests or the type gate on uncommitted work; skipped on a clean tree.
- SessionStart `session-context.sh` prints the always-on invariants and
  `docs/CONSTITUTION.md` only; this file is read through `CLAUDE.md`, not printed.
- Permissions: deny rules cover secrets, build artefacts and irreversible ops; they
  are a guardrail, not a sandbox.
- Git hooks (husky): pre-commit format/lint/tsc/gitleaks, commit-msg Conventional
  Commits, pre-push `.claude/verify-harness.sh` + `pnpm run check && pnpm test`.
- RLS isolation tests: `supabase/tests/rls.test.sql` via `supabase test db`.

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Pointers

- Inviolable rules: `docs/CONSTITUTION.md`. Plan of record:
  `docs/superpowers/plans/2026-06-05-qkit-core.md` (specs in `docs/superpowers/specs/`).
- Testing: `docs/TESTING.md`. Data model detail: `docs/DATA-MODEL.md`. Deploy
  and env scoping: `docs/DEPLOY.md`. Layout: browse `src/` (each folder has a README).

<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
