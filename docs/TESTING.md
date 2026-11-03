# Testing

Moved from `AGENTS.md` (context diet). The run commands stay in its Commands block.

E2E (Playwright, `e2e/`) is a small critical-path smoke against a REAL local
Supabase — it covers the `proxy.ts` auth guard and customer checkout through
payment claim and initial numbered tracking, and vendor fulfillment on the
board (`vendor-fulfillment.spec.ts`: Mark paid & start, Mark Ready, Mark
Picked Up, with the customer page and the TV screen following). Batch select,
"Mark all ready" and bump are not covered. To run:

1. Docker running, then `supabase start`
2. apply migrations + the `supabase/seed/coffee-cart.sql` seed (CI first
   applies `ci-auth-bootstrap.sql`), and `supabase/seed/e2e-merqo-stub.sql`
   for the vendor spec (qkit's own migrations have no `merqo` schema)
3. export the local `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (from
   `supabase status -o env`, see `e2e/README.md`), then `pnpm test:e2e`
   (auto-starts `pnpm dev`; `E2E_PORT` if 3000 is taken)
   `auth-guard.spec.ts` needs only a booting app; the order specs need the
   coffee-cart seed (the "Kopitiam Cart" booth).

Mutation testing (Stryker) is scoped to `src/lib` — the pure business logic.
Components/actions/supabase clients are excluded (I/O- or DOM-bound, low signal).
**Advisory only** — non-blocking (no CI gate); run on demand when changing
`src/lib` and treat survivors as a review prompt (many remaining are equivalent
mutants). Component behavior is covered by RTL+jsdom tests (`*.dom.test.tsx`),
unit logic by node tests (`*.test.ts`).
