# The Customer Pays on a Paykit Page (Separation P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the customer's pay step (amount, QR, link or image, screenshot, "I've paid") is a public page hosted by paykit, and qkit keeps only a redirect to it and the handling of the customer's return.

**Architecture:** paykit's create-checkout accepts a return address and a title and answers with a `pay_url` that carries a random token; paykit stores only the token's hash. The page at `/pay/{transaction_id}?k=<token>` reads the transaction through the service role after the token matches, claims through the same code path as the claim endpoint, and sends the customer back to the return address. qkit's `/order/{boothId}/pay` creates the checkout, redirects to `pay_url` while the payment is pending, and finalizes the order itself when paykit already holds the payment.

**Tech Stack:** Next.js 16 server components, server actions and route handlers, TypeScript strict, Zod, Supabase (service-role client, Storage), Vitest with jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, section "P5. The customer pays on a paykit page", read with "Decision 2" (option A, chosen 2026-10-10), "P2", "P3", "Migrations at a glance" and "Working rules for every phase". Builds on P1 to P3, all merged (paykit#126, #130, #132; qkit#215, #223, #225).

## State when this plan was written (2026-10-13)

- P3 is merged in both repos. Its OCR spike succeeded: qkit has no Tesseract; paykit reads the amount after a claim.
- P4 is half merged: paykit#131 is in; qkit#224 ("payment setup lives in paykit") is open from another session. It is not touched here. It edits `src/lib/paykit/client.ts`, `src/lib/schemas.ts` and `CHANGELOG.md`, which the qkit half of this plan also edits, so expect merge conflicts in whichever lands second.
- No open PR on paykit.

## Global Constraints

- Two repos, two PRs. paykit first (Tasks 1 to 6): additive, a create-checkout without `return_url` answers as today plus one new field. It is merged, its migration applied by the owner, `kit_api_keys.return_origin` set for qkit, and deployed. Only then is the qkit PR (Tasks 7 to 10) opened.
- Feature branch per repo, never `main`. No hook bypass. Never read or write `.env*` or `secrets/**`.
- `AGENTS.md`, `CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*` are protected: suggested text goes to the owner in chat.
- Migration: paykit only. qkit none. The agent applies nothing; the owner gets the full SQL in chat with the paykit PR.
- Screenshot limits are P3's, unchanged: JPEG, PNG or WebP by first bytes, more than 0 bytes, at most 1 MB (1,048,576 bytes).
- The service-role client is server-only; every route and action validates with Zod; no secret under `NEXT_PUBLIC_*`; no `any`, no `@ts-ignore`.
- paykit never touches funds and gains no auto-verify. A claim on the page is the customer's word, exactly as before.
- No em dash in user-facing copy, in either repo. Imports by full path, no barrel files. No function or component reference passed from a Server Component to a `@merqo/ui` component.
- paykit CI gates: changed-line coverage at least 80%; `CHANGELOG.md` touched when `src/` changes; the `README.md` of every folder with a changed file (the root one too); no change-narration comments.
- qkit lint gates: no trailing comment on a code line, no commented-out code, `it.each` for three or more near-identical tests.
- Out of scope: P6, `walkup-pay-step.tsx`, `qkit.place_order`, `qkit.place_walkup_order`, dropping qkit's proof columns, Telegram, a paykit-side expiry for a checkout (P6 prerequisite).
- One full vitest suite at a time on this machine. A push runs the suite (10 to 16 minutes): run it in the background, keep the whole log, never switch branches in a checkout whose push is still testing. Commit before ending a turn.
- Commit messages follow Conventional Commits, passed with `git commit -F <file>`, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan settles

1. **The token is 32 random bytes, sent as 43 base64url characters; paykit stores its sha256 as hex.** The comparison is `timingSafeEqual` over the two hex digests. The raw token is never stored, logged, or used as a rate-limit key.
2. **A token is minted only when the request carries `return_url`, and each such request mints a new one.** paykit cannot hand back a token it only holds the hash of, and create-checkout is replayed for the same order, so a replay replaces the hash. The previous link stops working. qkit redirects on every visit to its pay step, so the customer always holds the newest link; a second tab left on an older link shows "This payment link is no longer valid". A request without `return_url` (the walk-up dialog, paykit's own bookings) mints nothing and changes nothing.
3. **`pay_url` is returned only with a token**, so only when `return_url` was sent. Every create-checkout answer gains `status`, so the caller learns in one call whether the payment is already held.
4. **`return_url` is checked by parsed origin, not by text.** It must parse as a URL, carry no credentials, be at most 2000 characters, be `https:` (or `http:` on `localhost` / `127.0.0.1` outside production), and its `origin` must equal the `origin` of the calling kit's `kit_api_keys.return_origin`. paykit stores and redirects to the parsed URL's own serialisation, never the raw text. A kit with no `return_origin`, or a value that fails the check, gets 400 and no transaction change.
5. **A wrong token, a missing token, an unknown id and a transaction with no token all answer the same 404.** There is no way to learn that an id exists.
6. **The page shows the title, the amount, the payment code, and the state. Nothing else about the vendor or the order.** No vendor id, no order reference, no kit name reaches the browser. A PayNow QR necessarily encodes the vendor's UEN or mobile; that is what the customer needs to pay.
7. **The screenshot stays required on the page**, as it is in qkit today.
8. **The page's claim runs the same function as `POST /api/v1/checkout/{id}/claim`.** That route's body moves into `src/lib/claim.ts` and both call it, so storing the screenshot before the claim commits, the audit row, the amount check and the callback cannot drift apart. The audit row for a page claim carries the transaction's own `kit_slug` and `detail: { via: "pay_page" }`.
9. **Rate limits use the existing database limiter, fail open as it does everywhere else, and are keyed by IP and by the first 16 hex characters of the token's hash.** Page view: 60 a minute per IP. Status poll: 30 a minute per token, 120 per IP. Claim: 10 a minute per token, 20 per IP. The IP check runs before the database read.
10. **A page opened on a payment that is already claimed or confirmed redirects to the return address at once.** The open page also polls every 5 seconds and leaves when the status is no longer `pending`, so a confirmation that arrives another way (the vendor's board today, a detector in P6) moves the customer on.
11. **qkit never redirects to `pay_url` unless paykit says `pending`.** When create-checkout answers `claimed` or `confirmed`, qkit runs `finalizePaidOrder` and sends the customer to the numbered order. This is the "callback has not arrived yet" path, and it is also what prevents a redirect loop between the two apps.
12. **qkit's `claimPayment` action is deleted, not thinned.** The spec deletes its file handling; after that nothing in qkit calls it (the status page's panel only undoes). A server action with no caller is still a public endpoint, so it goes. What it did for the order now lives in the pay step's return handling.
13. **qkit builds `return_url` from the request's own host.** A preview then returns to the preview. `kit_api_keys.return_origin` holds one origin, so the owner's manual check on a preview needs it set to that preview's origin for the test and back to production before the qkit PR merges.

## Review Focus

1. **A token for one transaction used on another id, a token of the wrong length, and a token that is right except for its last character.** Expected: 404 each time, the same body, no transaction data. Pinned in Task 2 and Task 4.
2. **`return_url` values built to look like the registered origin**: `https://qkit.merqo.io.evil.com/`, `https://qkit.merqo.io@evil.com/`, `https://evil.com/?https://qkit.merqo.io`, `//qkit.merqo.io/x`, `javascript:alert(1)`, a different port, `http:` in production, a trailing dot on the host. Expected: 400, nothing stored. Pinned in Task 2 and Task 3.
3. **A caller that sends no `return_url`.** Expected: today's answer plus `status`, no `pay_url`, no token written. This is every deployed qkit until its PR merges, and the walk-up dialog for good. Pinned in Task 3.
4. **The screenshot cannot be stored, or is not an image, or is over 1 MB.** Expected: the customer sees an error and can retry; the transaction is still `pending`; no callback fires. Pinned in Task 4.
5. **The customer pays, then closes the tab before returning.** Expected: the P2 callback numbers the order. And the reverse: the customer returns before the callback lands. Expected: qkit finalizes from the pay step. Pinned in Task 8; the first half is the owner's manual check.

Also pinned: a replayed create-checkout replaces the token (Task 3); the page renders nothing but a retry notice when the database cannot be read (Task 4); a cancelled or expired qkit order never reaches paykit (Task 8).

Known and not changed here:

- paykit does not know qkit's 30 minute payment window. A customer who leaves the pay page open past it can still pay and claim; qkit's callback handler leaves a cancelled order unchanged and logs it. The old in-app page showed the same QR for as long as it stayed open. `transactions.expires_at` is a P6 prerequisite in the spec.
- A vendor who changes payment details while an order is unpaid makes create-checkout answer 409 for that order, as today. The customer sees "Couldn't load payment right now".
- The token travels in the query string, as the spec writes it. The page sends `Referrer-Policy: no-referrer` and is marked `noindex`.

## File Structure

paykit (worktree `paykit/.claude/worktrees/customer-pay-page`, branch `feat/customer-pay-page`):

| File                                                       | Responsibility                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `supabase/migrations/0023_hosted_pay_page.sql` (create)    | Three columns on `transactions`, one on `kit_api_keys`                  |
| `test/db/hosted-pay-page-schema.test.ts` (create)          | Text guard on the migration                                             |
| `src/lib/types.ts` (modify)                                | The four columns                                                        |
| `src/lib/pay-token.ts`, `.test.ts` (create)                | Mint, hash, shape, constant-time match, rate-limit key part             |
| `src/lib/return-url.ts`, `.test.ts` (create)               | `kitReturnUrl(raw, registeredOrigin)`                                   |
| `src/lib/api-schemas.ts` (modify)                          | Request gains `return_url`, `title`; response gains `status`, `pay_url` |
| `src/lib/checkout.ts`, test (modify)                       | Stores title, return address and token hash; reports `status`           |
| `src/app/api/v1/checkout/route.ts`, test (modify)          | Validates `return_url` against the kit's origin; builds `pay_url`       |
| `src/lib/claim.ts`, `.test.ts` (create)                    | The claim, shared by the endpoint and the page                          |
| `src/app/api/v1/checkout/[id]/claim/route.ts` (modify)     | Calls `claimTransaction`; answers unchanged                             |
| `src/lib/hosted-pay.ts`, `.test.ts` (create)               | Token-gated read of one transaction for the page                        |
| `src/app/pay/[id]/page.tsx`, `page.dom.test.tsx` (create)  | The public page (server)                                                |
| `src/app/pay/[id]/pay-panel.tsx`, `.dom.test.tsx` (create) | The interactive part (client)                                           |
| `src/app/pay/[id]/actions.ts`, `.test.ts` (create)         | `claimHostedPayment`, `getHostedPaymentStatus`                          |
| `src/app/pay/[id]/qr-image.ts` (create)                    | SVG to PNG for "Save QR image", ported from qkit                        |
| `next.config.ts` (modify)                                  | Action body limit for a 1 MB file; `no-referrer` on `/pay/*`            |
| `e2e/pay-page.spec.ts` (create)                            | Public smoke                                                            |
| `test/contract/*` (modify)                                 | Saved example of the new create-checkout body                           |
| READMEs, `CHANGELOG.md`                                    | Required by CI                                                          |

qkit (this worktree, branch `claude/serene-feistel-23a30a`):

| File                                                                      | Responsibility                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/paykit/client.ts`, test (modify)                                 | `createCheckout` sends `return_url`, `title`; reads `pay_url`, `status`; `claimCheckout` loses the file |
| `src/app/order/[boothId]/pay/page.tsx`, dom test (modify)                 | Redirect to `pay_url`, or finalize and go to the numbered order                                         |
| `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`, test (modify) | `loadPreClaimContext` returns the pay address; `claimPayment` deleted                                   |
| `src/app/order/[boothId]/pay/pay-form.tsx`, dom test (delete)             |                                                                                                         |
| `src/app/order/[boothId]/[orderNumber]/qr-image.ts` (delete)              |                                                                                                         |
| `src/lib/schemas.ts`, test (modify)                                       | `paymentProofSchema` and its constants deleted                                                          |
| `e2e/paykit-mock.ts` (modify)                                             | `pay_url`, `status`, a stub pay page                                                                    |
| `e2e/customer-order.spec.ts` (modify)                                     | Rewritten around the redirect                                                                           |
| READMEs, `CHANGELOG.md`, this plan, `docs/superpowers/plans/README.md`    | Docs                                                                                                    |

---

## Part 1: paykit

### Task 1: Migration and types

**Files:** `supabase/migrations/0023_hosted_pay_page.sql`, `test/db/hosted-pay-page-schema.test.ts`, `src/lib/types.ts`, `supabase/migrations/README.md`.

```sql
alter table paykit.transactions
  add column pay_token_hash text
    constraint transactions_pay_token_hash_shape
    check (pay_token_hash is null or pay_token_hash ~ '^[0-9a-f]{64}$'),
  add column return_url text
    constraint transactions_return_url_length
    check (return_url is null or length(return_url) between 1 and 2000),
  add column pay_title text
    constraint transactions_pay_title_length
    check (pay_title is null or length(pay_title) between 1 and 120);

alter table paykit.kit_api_keys
  add column return_origin text;
```

- [ ] Write the text guard test first (the three columns, their checks, the `kit_api_keys` column, no new grant and no new policy); run it red.
- [ ] Write the migration; test green. Confirm from `0001` and later grants that `authenticated` cannot update `transactions` and that a vendor reading their own row sees only a hash.
- [ ] Add the columns to `Transaction`, its `Insert` and `Update`, and `kit_api_keys` in `src/lib/types.ts`. `pnpm exec tsc --noEmit`.
- [ ] Commit.

### Task 2: Token and return-address libraries

**Produces:**

```ts
// src/lib/pay-token.ts
export const payTokenSchema: z.ZodString; // /^[A-Za-z0-9_-]{43}$/
export function mintPayToken(): { token: string; hash: string };
export function hashPayToken(token: string): string; // sha256 hex
/** Constant time. False for a null hash. */
export function payTokenMatches(
  token: string,
  storedHash: string | null,
): boolean;
/** First 16 hex characters of the token's hash, for rate-limit keys. */
export function payTokenKey(token: string): string;

// src/lib/return-url.ts
/** The address to store and redirect to, or null. */
export function kitReturnUrl(
  raw: unknown,
  registeredOrigin: string | null,
): string | null;
```

- [ ] Tests first. `pay-token`: 43 characters of the base64url alphabet; two mints differ; the hash is 64 hex and is not the token; a match; one character off; wrong length; null and malformed stored hash. `return-url`: the accepted case returns `url.href`; every value in Review Focus 2 returns null (`it.each`); null or unparsable registered origin; over 2000 characters; localhost over http accepted outside production and refused in it.
- [ ] Implement; green. Commit.

### Task 3: Create-checkout takes `return_url` and `title`, answers `status` and `pay_url`

**Files:** `src/lib/api-schemas.ts`, `src/lib/checkout.ts` + test, `src/app/api/v1/checkout/route.ts` + test, `test/contract/*`, route README.

Contract:

```
POST /api/v1/checkout
{ vendor_id, amount_cents, order_ref,
  return_url?: string (<= 2000),  title?: string (trimmed, 1..120) }
200 { type, transaction_id, ...view fields,
      status: "pending"|"claimed"|"confirmed",
      pay_url?: "<paykit origin>/pay/<transaction_id>?k=<token>" }
400 { error: "return_url is not allowed for this kit" }
```

- `checkoutRequestSchema` gains the two optional fields; `checkoutResponseSchema` variants gain `status` and optional `pay_url`.
- `createCheckout` input gains `hostedPay?: { returnUrl: string; title: string | null }`. With it: mint a token; a fresh insert carries `pay_token_hash`, `return_url`, `pay_title`; a replay updates those three on the existing row after `replayConflict` passes. A failed update is 503. The result gains `status` and `payToken?`.
- The route reads the kit's `return_origin`, runs `kitReturnUrl`, answers 400 before `createCheckout` when it returns null, and builds `pay_url` from the request's own origin.

- [ ] Tests first: no `return_url` (answer has `status`, no `pay_url`, the insert carries no token column, a replay runs no update); with `return_url` (hash stored is the hash of the token in `pay_url`, title and parsed address stored); replay replaces the hash and returns the row's real status; kit with no origin and a foreign origin are 400 with no insert; title of 121 characters is 400; `pay_url` uses the request origin; update failure is 503.
- [ ] Implement; green. Update the contract sample and its test. Commit.

### Task 4: The claim as one function, and the token-gated read

**Produces:**

```ts
// src/lib/claim.ts
export type ClaimOutcome =
  | { ok: true; row: Transaction }
  | { ok: false; status: 404 | 503; error: string };
export async function claimTransaction(
  supabase: ServiceClient,
  current: Transaction,
  proof: ProofFile | null,
  audit: { kitSlug: string; detail?: Json },
): Promise<ClaimOutcome>;

// src/lib/proof-file.ts (added)
/** The same checks as readProofFromRequest, for a file already in hand. */
export async function readProofFile(file: unknown): Promise<ProofRead>;

// src/lib/hosted-pay.ts
export type HostedPayment = {
  id: string;
  status: TxStatus;
  amountCents: number;
  title: string | null;
  returnUrl: string | null;
  view:
    | { type: "qr"; payload: string }
    | { type: "link"; url: string; label: string }
    | { type: "image"; url: string }
    | null;
};
export type HostedPaymentRead =
  | { ok: true; payment: HostedPayment; row: Transaction }
  | { ok: false; reason: "not_found" | "unavailable" };
export async function loadHostedPayment(
  supabase: ServiceClient,
  id: string,
  token: string,
): Promise<HostedPaymentRead>;
```

- [ ] Move the claim route's body from "store the screenshot" to "schedule the callback" into `claimTransaction`. The existing route test file must pass unchanged: that is the proof the endpoint answers as before.
- [ ] `claim.test.ts`: screenshot stored before the update; storage failure is 503 with no update and no callback; a confirmed transaction keeps its evidence; a lost update re-reads; the audit detail is passed through.
- [ ] `hosted-pay.test.ts` first: malformed id or token makes no database call; unknown id, null hash, wrong token and another transaction's token are all `not_found`; a read error is `unavailable`; the returned `payment` has no `vendor_id`, `order_ref` or `kit_slug` key.
- [ ] Implement; green. Commit.

### Task 5: The public page

**Files:** `src/app/pay/[id]/page.tsx`, `pay-panel.tsx`, `actions.ts`, `qr-image.ts`, their tests, README, `next.config.ts`.

Behaviour:

- `page.tsx` (server, `revalidate = 0`, metadata `robots: noindex`): rate limit by IP, `loadHostedPayment`, `notFound()` on `not_found`, a retry notice on `unavailable`, `redirect(returnUrl)` when the status is not `pending` and a return address exists, a "Payment recorded" notice when it is not `pending` and there is none, otherwise `<PayPanel>` with plain data props only.
- `pay-panel.tsx` (client): title, amount, the code by `view.type` (QR with "Save QR image", image with a load-failure notice, link as a button opening a new tab with `rel="noopener noreferrer"`), the screenshot input (resized in the browser with `resizeToWebp`, then checked for type and size), "I've paid", "Back to your order". Polls `getHostedPaymentStatus` every 5 seconds and leaves through `window.location.assign` when it reports a return address.
- `actions.ts`: `claimHostedPayment(id, token, formData)` and `getHostedPaymentStatus(id, token)`. Each: Zod on its arguments, rate limits by IP then token, `loadHostedPayment`. The claim reads the file with `readProofFile`, requires it, runs `claimTransaction` with `{ kitSlug: row.kit_slug, detail: { via: "pay_page" } }`, and answers `{ success: true, returnUrl }` or `{ success: false, error }`. Neither returns anything about the transaction beyond status and return address.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit` sized for a 1 MB file plus form overhead; `Referrer-Policy: no-referrer` for `/pay/:path*`.

- [ ] `actions.test.ts` first: bad arguments; rate limit refusal; wrong token is the same generic error as an unknown id; no file; a file that is not an image; over 1 MB; storage failure leaves `pending`; success returns the stored return address; a second claim is idempotent; status for a pending and a claimed transaction.
- [ ] `page.dom.test.tsx` and `pay-panel.dom.test.tsx` first: the three view types; the amount and title; no vendor id or order reference in the rendered markup; "I've paid" without a file shows the required error and calls nothing; a successful claim navigates to the return address; the poll navigates when the status changes; a not-found read calls `notFound`; a claimed transaction calls `redirect` with the stored address.
- [ ] Implement; green. `pnpm build` locally with CI's dummy Supabase values to catch a client/server boundary error.
- [ ] `e2e/pay-page.spec.ts`: no token is 404; a malformed token is 404; a malformed id is 404; a well-formed id and token (no database behind the smoke run) shows the retry notice and no payment data. Commit.

### Task 6: Docs, gates, security review, PR

- [ ] READMEs for every touched folder (root included), `supabase/migrations/README.md`, `CHANGELOG.md` under `[Unreleased]`.
- [ ] `pnpm check && pnpm test` (nothing else heavy running). `pnpm test:e2e`.
- [ ] `/security-review` on the branch; fix what it finds; re-run the gates.
- [ ] Push (background, full log kept), open the PR, bind it, read CI.
- [ ] Give the owner in chat: the migration SQL, the `return_origin` statement for qkit's row, and suggested `AGENTS.md` text for paykit (the `/pay` page, the four columns, the rule that `/pay` is the one route that reads a transaction without a bearer secret or a session).
- [ ] **Stop.** The qkit half starts only after the owner merges, applies the migration and sets `return_origin`.

---

## Part 2: qkit (after the paykit page is live)

Before starting: `gh pr list` on both repos; merge current `main` into this branch; re-read `src/lib/paykit/client.ts` and `src/lib/schemas.ts`, which qkit#224 may have changed.

### Task 7: Client

- `createCheckout(input)` gains `returnUrl?` and `title?`, sends them as `return_url` and `title`, and returns the view plus `status` and `payUrl: string | null`. `payUrl` is accepted only when it parses as a URL whose origin is the configured paykit origin; anything else is treated as absent.
- `claimCheckout(id)` loses its `proof` parameter and the 15 second timeout that existed for it.

- [ ] Tests first (request body carries both fields only when given; `pay_url` on another origin is dropped; an answer without `status` from an older paykit reads as `pending`); implement; commit.

### Task 8: The pay step redirects, and handles the return

`loadPreClaimContext(boothId, token, origin)` keeps its states and its order of checks (cancelled, already numbered, expired, all before any call to paykit) and changes its `pending` branch:

1. `createCheckout` with `returnUrl = ${origin}/order/${boothId}/pay?t=${token}` and `title = "Order from <booth name>"` (cut to 120 characters).
2. Answer `pending` with a `payUrl`: state `{ state: "pay", payUrl }`. The page redirects there.
3. Answer `claimed` or `confirmed`: `finalizePaidOrder`, then state `placed` with the number. The page redirects to the numbered order.
4. Create-checkout failed: `getCheckoutByOrderRef`. If paykit holds the payment for this vendor and amount as `claimed` or `confirmed`, finalize as in 3. Otherwise state `unavailable`: the page shows "Couldn't load payment right now" with a refresh link and the way back to the menu.

The page gets `origin` from the request's `host` and `x-forwarded-proto` headers.

- [ ] Tests first, action level: each of the four branches; a cancelled and an expired order make no paykit call; the vendor or amount mismatch on the lookup path does not finalize; `finalizePaidOrder` failing gives `unavailable`, never a redirect to `pay_url`. Page level: `redirect` is called with `payUrl`; with the numbered order; the unavailable notice renders.
- [ ] Implement; delete `claimPayment`, `validatePaymentProof`, `claimRefusal`; fix the comments in `finalize-paid-order.ts` and `dashboard/order-actions.ts` that name `claimPayment`; commit.

### Task 9: Deletions, mock, e2e

- [ ] Delete `pay-form.tsx`, `pay-form.dom.test.tsx`, `qr-image.ts`; delete `paymentProofSchema`, `PAYMENT_PROOF_MAX_BYTES`, `PAYMENT_PROOF_EXTENSIONS`, `PaymentProofType` and their tests. Grep for each name; `pnpm check`.
- [ ] `e2e/paykit-mock.ts`: create-checkout answers `status` and, when `return_url` is sent, a `pay_url` on the mock's own origin; a stub pay page there with one button that marks the transaction claimed and navigates to the stored `return_url`.
- [ ] `e2e/customer-order.spec.ts`: order, land on the stub page, press the button, arrive on the numbered order. Not run locally (no local Supabase on this machine); say so in the PR.
- [ ] Commit.

### Task 10: Docs, gates, PR

- [ ] READMEs (`src/app/order/[boothId]/pay/`, `[orderNumber]/`, `src/lib/paykit/`, `e2e/`), `CHANGELOG.md`, this plan's checkboxes, `docs/superpowers/plans/README.md`.
- [ ] `pnpm check && pnpm test`; `/security-review`; push; PR; read CI including `e2e (order lifecycle)`, which is not a required check.
- [ ] Hand the owner the manual check and suggested `AGENTS.md` text for qkit.

## Manual check (the owner's, on a preview, phone-sized)

Set `kit_api_keys.return_origin` for `qkit` to the preview's origin first, and back to production afterwards.

1. On "TEST · PayNow": place an order. The browser lands on paykit's page with the amount and the booth's name. Attach a screenshot, press "I've paid". The browser returns to qkit and shows the numbered order.
2. Place another order. On paykit's page attach a screenshot and press "I've paid", then close the tab before it returns. The order appears on the board with its number.
3. Open the first order's pay link again from history. It goes straight back to the numbered order.

No QR order on "TEST · Printing": it sends a real print job.
