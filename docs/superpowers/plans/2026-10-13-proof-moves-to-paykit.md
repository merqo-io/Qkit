# Proof and Detection Signals Move to Paykit (Separation P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the payment screenshot, its hash, the duplicate check and the amount check belong to paykit's transaction, and qkit keeps only a forward of the file and a read of what paykit reports.

**Architecture:** paykit's claim endpoint accepts an optional screenshot, stores it in its own private bucket with one `payment_evidence` row, and a new evidence endpoint returns a short-lived link to the photo plus two signals (duplicate, amount match). qkit's `claimPayment` forwards the file with the claim and stops using its own bucket; the board's proof viewer reads through one server action that checks the order under the vendor's session and then asks paykit. Orders that already have a qkit proof path keep reading the old way.

**Tech Stack:** Next.js 16 route handlers and server actions, TypeScript strict, Zod, Supabase (service-role client, Storage, RLS, pgTAP), Vitest, Playwright (qkit e2e with a paykit mock).

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, section "P3. Proof and detection signals move to paykit", read with "Decision 3", "The boundary" and "Working rules for every phase". Builds on P1 (`2026-10-10-paykit-order-ref-lookup.md`) and P2 (`2026-10-12-paykit-status-callback.md`), both merged.

## Global Constraints

- Two repos, two PRs. paykit first (Tasks 1 to 5): additive, a claim with no body answers exactly as today. It is merged, its migration applied by the owner, and deployed. Only then is the qkit PR (Tasks 6 to 10) opened.
- Before starting in a repo: `gh pr list --repo merqo-io/<repo> --state open`. Checked 2026-10-13: none open in either. Never touch a PR that is not from this plan.
- Feature branch per repo, never `main`. No hook bypass.
- Migration: paykit only (bucket, storage policy, one table with RLS). qkit none. The agent does not apply it; the owner gets the full SQL in chat with the paykit PR.
- The bucket is named `paykit-payment-proofs`. qkit's is `payment-proofs` and both kits share one Supabase project, so the names must differ.
- Screenshot limits, the ones qkit enforces today: JPEG, PNG or WebP, more than 0 bytes, at most 1 MB (1,048,576 bytes).
- The signed photo link lasts 300 seconds.
- Never read or write `.env*` or `secrets/**`. `AGENTS.md`, `CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*` are protected: suggested text goes to the owner in chat.
- RLS is the authorization boundary; the service-role client is server-only; every route and action validates with Zod; no secret under `NEXT_PUBLIC_*`; no `any`, no `@ts-ignore`.
- paykit never touches funds and gains no auto-verify. The amount check is a hint shown to a human, never a confirmation.
- paykit CI gates: changed-line coverage at least 80%; `CHANGELOG.md` touched when `src/` changes; the `README.md` of every folder with a changed file (the root one too); no change-narration comments.
- qkit lint gates: no trailing comment on a code line, no commented-out code, no em dash in user-facing copy, `it.each` for three or more near-identical tests. Imports by full path, no barrel files.
- Out of scope: P4, P5, P6, `qkit.place_order`, `qkit.place_walkup_order`, dropping the two qkit proof columns or the old bucket, Telegram.
- One full vitest suite at a time on this machine. A push runs the suite (10 to 16 minutes): run it in the background, keep the whole log, and never switch branches in a checkout whose push is still testing. Commit before ending a turn.
- qkit e2e needs a local Supabase, which this machine does not have. Say so in the PR.
- No QR order on "TEST · Printing". The manual check uses "TEST · PayNow" and is the owner's to run.
- Commit messages follow Conventional Commits, passed with `git commit -F <file>`, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan settles

1. **The screenshot is stored before the claim commits.** paykit uploads the file and writes the evidence row first. If either fails the route answers 503 and the transaction is not claimed, so qkit's order is untouched and the customer can retry.
2. **One screenshot per transaction; a later one replaces it.** The object path is `{vendor_id}/{transaction_id}` with no extension, written with upsert, and the row is upserted on `(transaction_id, kind)`. An undo followed by a second claim therefore leaves one photo, the latest.
3. **A screenshot is accepted while the transaction is `pending` or `claimed`, and ignored once `confirmed`.** Evidence a vendor already confirmed against must not change under them. The claim itself still answers idempotently.
4. **paykit checks the file's first bytes, not only its declared type.** A file whose bytes are not JPEG, PNG or WebP is refused with 400. The vendor opens this file from a paykit link, so paykit does not trust the label the caller sent.
5. **A multipart body must carry exactly one `proof` file.** Zero or several is 400. Any other content type, or no body, is today's claim.
6. **The evidence endpoint reads only the calling kit's own transactions** (404 otherwise). The duplicate search is the one place that looks across kits, as the spec requires, and it is limited to the same vendor.
7. **`duplicate_of` is the oldest other transaction of the same vendor with the same hash.** paykit returns its `order_ref` and `kit_slug`. qkit shows the order number when `kit_slug` is `qkit` and the order is one the signed-in vendor can read; otherwise it says the photo was used for another payment.
8. **Duplicates are not detected across the cutover.** An order paid before this ships has its hash in qkit; one paid after has it in paykit. The two are never compared. Accepted: the window is the orders open on the day of the deploy.
9. **qkit decides old or new by `payment_proof_path`.** An order with a path reads through the existing `proof-actions.ts`. An order without one reads from paykit. The board shows "View payment proof" for every claimed order; when neither side has a photo the viewer says so.
10. **The new qkit action requires the signed-in user to be the booth's vendor**, not only that RLS returned the order. qkit's admin read policy lets an admin account load another vendor's order; the old path was already safe because the storage policy is keyed on the caller's own folder. It also checks that paykit's transaction belongs to that vendor.
11. **A retry of `claimPayment` is allowed while the order is `claimed` and has no number yet.** Before, the test was "claimed and no screenshot recorded". qkit no longer records one, so the equivalent test is "claimed and not finalized".
12. **The multipart claim gets a 15 second timeout in qkit's client.** It carries up to 1 MB through two hops. Every other call keeps 5 seconds.
13. **Decision 3 (where the amount check runs):** see "Spike outcome" below.

## Spike outcome (Decision 3A)

Run 2026-10-13. **It works: 3A.** The owner opened the spike route on the Vercel preview and it answered `{"ok":true,"ms":1366,"text":"Transfer successful
SGD 12.50
...","memoryMb":182}`. paykit now reads the amount on its server after the claim answers and returns `amount_match`; qkit's Tesseract is deleted. The record of how it got there follows; the agent could not read the route itself, so both PRs were first built to work either way.

What was established:

- `tesseract.js@5.1.1` in plain Node read the synthetic screenshot correctly ("SGD 12.50" among the text) in about 0.5 seconds, start-up included.
- A preview-only route, `GET /api/spike-ocr-7f3a` on paykit branch `spike/server-ocr`, built locally and on Vercel. Getting the build to carry the files took three tries: the worker thread loads `bmp-js`, `zlibjs`, `wasm-feature-detect` and `tesseract.js-core` by name at run time, which the build's file trace does not see, so they had to become direct dependencies imported by the helper, plus `outputFileTracingIncludes` for the worker script, the wasm core and the language file. A glob that matched pnpm's linked folders crashed the Windows build ("Access is denied"), so the includes name real package folders only. The final trace lists every file the worker needs.
- The deployed route was never called. paykit previews are behind Vercel's login, and the Chrome profile available to the agent is signed in to an account that is not on the team ("You Need Access"). The agent did not request access or switch accounts.

What shipped as a result:

- paykit: `src/lib/proof-ocr.ts` (`recognizeText`) and `src/lib/proof-amount-check.ts`. The claim route schedules the check with `after()` once the screenshot is stored; the result is written to the evidence row's `detail.amount_match`, matched by the file's hash so a replaced screenshot is not overwritten by a stale read. No migration beyond `0022`.
- The tracing key for the claim route is `"/api/v1/checkout/*/claim"`. The key is a glob: written as `[id]` it matched nothing, the build still passed, and the function would have shipped without the wasm core. A test in `proof-ocr.test.ts` pins the key and the patterns.
- OCR was confirmed locally on PNG, JPEG and WebP encodings of the synthetic screenshot (the WebP and JPEG made by a headless browser's canvas, as a phone would).
- qkit: the viewer shows paykit's reading and has no OCR. `public/tesseract/` (16 MB), `tesseract.js` and `tesseract.js-core` are removed. When paykit has no reading, no amount hint is shown.
- Not verified on Vercel: the real claim route's check, which needs a kit secret to call. The spike proved the runtime; the build trace proves the claim route carries the same files. The owner's manual check (an amount hint under a real screenshot) closes it.
- Cost accepted: paykit gains five pinned dependencies and a 3 MB language file.

## Review Focus

1. **paykit cannot store the screenshot (Storage down, bucket missing because the migration is not applied).** Expected: 503, transaction still `pending`, no callback, qkit order unchanged, customer sees "Could not record payment. Try again." Pinned in Tasks 3 and 7.
2. **A caller that sends no body, or JSON, to the claim endpoint.** Expected: exactly today's answer. This is every deployed qkit until its PR merges. Pinned in Task 3.
3. **A file that lies about its type, is empty, is over 1 MB, or a body with two files.** Expected: 400 or 413, nothing stored, nothing claimed. Pinned in Tasks 2 and 3.
4. **The same photo on two orders of one vendor, and the same photo on two different vendors.** Expected: the first pair reports a duplicate, the second does not. Pinned in Tasks 2 and 4, and in pgTAP for the read side.
5. **An order claimed before the deploy, opened on the board after it.** Expected: the photo still opens, through qkit's old bucket. Pinned in Task 8.

Also pinned: paykit unreachable when the viewer opens (the viewer shows no photo and no error dialog, Task 8); an admin account opening another vendor's order (refused, Task 8).

Known and not changed here:

- paykit's claim, unclaim and confirm routes read a transaction by id alone, although their READMEs say the calling kit's slug is also matched. Reported to the owner in P2; not in this phase.
- Nothing deletes a paykit screenshot. Retention is a policy question for the owner.
- paykit's dashboard does not show the screenshot yet. The RLS and storage policies that would let it are in the migration.

## File Structure

paykit (worktree `paykit/.claude/worktrees/payment-evidence`, branch `feat/payment-evidence`):

| File                                                                      | Responsibility                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/0022_payment_evidence.sql` (create)                  | Bucket, storage policy, table, RLS, grants                     |
| `supabase/tests/payment-evidence.test.sql` (create)                       | pgTAP: cross-vendor isolation for rows and objects             |
| `test/db/payment-evidence-schema.test.ts` (create)                        | Cheap text guard on the migration                              |
| `src/lib/types.ts` (modify)                                               | `PaymentEvidence` row and table types                          |
| `src/lib/proof-file.ts`, `.test.ts` (create)                              | Pure: limits, byte sniffing, reading the file out of a request |
| `src/lib/payment-evidence.ts`, `.test.ts` (create)                        | Store a screenshot; load a transaction's evidence and signals  |
| `src/lib/api-schemas.ts` (modify)                                         | `checkoutEvidenceResponseSchema`                               |
| `src/app/api/v1/checkout/[id]/claim/route.ts`, `route.test.ts` (modify)   | Optional multipart body                                        |
| `src/app/api/v1/checkout/[id]/evidence/route.ts`, `route.test.ts`, README | `GET` evidence                                                 |
| `test/contract/checkout-evidence.sample.json`, contract test              | Saved example of the evidence body                             |
| READMEs, `CHANGELOG.md`                                                   | Required by CI                                                 |

qkit (this worktree, branch `claude/musing-noyce-17bfb8`):

| File                                                                      | Responsibility                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/paykit/client.ts`, test (modify)                                 | `claimCheckout(id, proof?)`, `getCheckoutEvidence(id)`           |
| `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`, test (modify) | Forward the file; no bucket, no hash                             |
| `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.ts`, test      | Drop the `proof` option; the mirror no longer writes the columns |
| `src/app/dashboard/payment-evidence-actions.ts`, test (create)            | `getOrderPaymentProof(orderId)`: the viewer's one read           |
| `src/app/dashboard/proof-actions.ts` (unchanged)                          | Legacy read for orders that have a path                          |
| `src/components/board/payment-proof-viewer.tsx`, dom test (modify)        | One action; paykit's amount signal when present                  |
| `src/components/board/order-card-parts.tsx`, dom test (modify)            | Show the trigger for every claimed order                         |
| `e2e/paykit-mock.ts` (modify)                                             | Multipart claim, evidence route                                  |
| READMEs, `CHANGELOG.md`, this plan, `docs/superpowers/plans/README.md`    | Docs                                                             |

---

## Part 1: paykit

### Task 1: Spike, server-side OCR on Vercel (time-boxed)

Time box: one local run in Node, then at most two preview deployments. Paykit previews sit behind Vercel's login, so the route is opened through the owner's signed-in Chrome.

- [x] Branch `spike/server-ocr` from `origin/main` in the paykit worktree. Add `tesseract.js@5.1.1` (the version qkit pins), a `recognizeText(buffer)` helper, and a throwaway `GET /api/spike-ocr-7f3a` that answers 404 outside a preview deployment and otherwise reads a synthetic screenshot (drawn for the spike, "SGD 12.50", no real data) and returns the text and the time taken.
- [x] Run the same OCR locally in Node. Expected: the text contains `12.50`.
- [x] `pnpm build` locally with CI's dummy Supabase values; read the route's `.nft.json` and confirm the worker script, the wasm core, the language file and the worker's own dependencies are listed.
- [x] Push the branch, wait for the preview, open the route. Success means: `ok: true`, text contains `12.50`, well under the 5 seconds qkit waits for a claim or, failing that, short enough to run after the response.
- [x] Record the result under "Spike outcome". The spike branch is never merged.

If it works (3A): Task 3 also runs the amount check after the response and stores `amount_match` in the evidence row's `detail`; Task 9 deletes Tesseract from qkit.
If it fails (3B): `amount_match` is always `null`; qkit's viewer keeps its browser OCR, reading the photo from paykit's link.

### Task 2: Migration, types, and the evidence library

**Files:** `supabase/migrations/0022_payment_evidence.sql`, `supabase/tests/payment-evidence.test.sql`, `test/db/payment-evidence-schema.test.ts`, `src/lib/types.ts`, `src/lib/proof-file.ts` + test, `src/lib/payment-evidence.ts` + test, `src/lib/api-schemas.ts`.

**Produces:**

```ts
// src/lib/proof-file.ts
export const PROOF_BUCKET = "paykit-payment-proofs";
export const PROOF_MAX_BYTES = 1024 * 1024;
export type ProofMime = "image/jpeg" | "image/png" | "image/webp";
export type ProofFile = { bytes: Buffer; contentType: ProofMime };
export function sniffImageType(bytes: Uint8Array): ProofMime | null;
export type ProofRead =
  | { ok: true; proof: ProofFile | null }
  | { ok: false; status: 400 | 413; error: string };
/** null proof when the request is not multipart. Never throws. */
export async function readProofFromRequest(
  request: Request,
): Promise<ProofRead>;

// src/lib/payment-evidence.ts
export function hashProof(bytes: Buffer): string; // sha256 hex
export function proofPath(tx: { id: string; vendor_id: string }): string;
export async function storeScreenshotEvidence(
  supabase: ServiceClient,
  tx: { id: string; vendor_id: string },
  proof: ProofFile,
): Promise<boolean>;
export async function loadCheckoutEvidence(
  supabase: ServiceClient,
  tx: { id: string; vendor_id: string },
): Promise<CheckoutEvidenceResponse | null>; // null = upstream failure

// src/lib/api-schemas.ts
export const checkoutEvidenceResponseSchema = z.object({
  proof_url: z.string().url().nullable(),
  signals: z.object({
    duplicate_of: z
      .object({ order_ref: z.string(), kit_slug: z.string() })
      .nullable(),
    amount_match: z.boolean().nullable(),
  }),
});
```

Migration (also given to the owner in chat):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paykit-payment-proofs', 'paykit-payment-proofs', false, 1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "paykit_payment_proofs_vendor_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'paykit-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table paykit.payment_evidence (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references paykit.transactions(id) on delete cascade,
  kind           text not null check (kind in ('screenshot')),
  storage_path   text,
  content_hash   text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint payment_evidence_one_per_kind unique (transaction_id, kind),
  constraint payment_evidence_screenshot_shape check (
    kind <> 'screenshot'
    or (storage_path is not null and content_hash ~ '^[0-9a-f]{64}$')
  )
);

create index payment_evidence_hash_idx
  on paykit.payment_evidence (content_hash)
  where content_hash is not null;

alter table paykit.payment_evidence enable row level security;

create policy payment_evidence_vendor_select on paykit.payment_evidence
  for select using (
    transaction_id in (
      select id from paykit.transactions where vendor_id = (select auth.uid())
    )
  );

create policy payment_evidence_admin_select on paykit.payment_evidence
  for select using (paykit.is_admin((select auth.uid())));

revoke all on paykit.payment_evidence from public, anon, authenticated;
grant select on paykit.payment_evidence to authenticated;
grant select, insert, update on paykit.payment_evidence to service_role;
```

Steps (each: failing test, run, implement, run, commit):

- [x] `proof-file.test.ts`: `sniffImageType` for JPEG, PNG, WebP headers, a GIF header, an empty array, a truncated header; `readProofFromRequest` for no content type, JSON, multipart with one valid file, with no `proof` field, with two, with a text field named `proof`, an empty file, a file over the limit (413), a `Content-Length` over the limit (413 before parsing), a PNG declared as JPEG (accepted, stored as PNG: the bytes decide), bytes that are no image (400), a body that fails to parse (400).
- [x] `payment-evidence.test.ts` with a fake client: `storeScreenshotEvidence` uploads to `paykit-payment-proofs` at `{vendor}/{tx}` with `upsert: true` and the sniffed content type, then upserts the row on `transaction_id,kind` with the sha256 hex; returns false and writes no row when the upload fails; returns false when the row write fails; returns false when the client throws. `loadCheckoutEvidence`: no row gives `proof_url: null` and both signals null; a row gives a signed link asked for with 300 seconds; a signing failure gives `proof_url: null` but still the signals; duplicate found on the same vendor; same hash on another vendor only gives null; the transaction's own row is excluded; `amount_match` read from `detail` only when it is a boolean; a failed evidence read gives null.
- [x] pgTAP file (runs in CI's `db` job, not locally): RLS enabled; vendor A reads its own evidence row and not B's; anon reads none; an authenticated insert is refused; service role can insert and update; the bucket is private with the size and type limits; vendor A sees its own object in `storage.objects` for the bucket and not B's.
- [x] `test/db/payment-evidence-schema.test.ts`: text guards for the bucket name, the table, RLS, the unique constraint and the grants.
- [x] `types.ts`: `PaymentEvidence` row; table entry with `Insert` and `Update`.

### Task 3: The claim accepts a screenshot

**Files:** `src/app/api/v1/checkout/[id]/claim/route.ts`, `route.test.ts`, `README.md`.

Order inside the route: auth, rate limit, id check, `readProofFromRequest` (400 or 413 stop here), read the transaction (404), then if a screenshot came and the status is `pending` or `claimed`, `storeScreenshotEvidence` (false means 503 and stop), then today's transition unchanged.

- [x] Tests first. Every existing test stays green untouched (they send no body). New: a multipart claim stores then claims; store is called before the update; a failed store answers 503 with no update, no audit row and no callback; a bad file answers 400 without reading the transaction; an oversized one 413; a screenshot on a `claimed` transaction is stored and the answer is the idempotent echo; on a `confirmed` one it is not stored; a JSON body behaves as no body.
- [x] Implement, update the README, commit.

### Task 4: The evidence endpoint

**Files:** `src/app/api/v1/checkout/[id]/evidence/route.ts`, `route.test.ts`, `README.md`; `test/contract/checkout-evidence.sample.json`; `test/contract/paykit-api.contract.test.ts`.

`GET /api/v1/checkout/{id}/evidence`: `verifyKitAuth` (401), rate limit `evidence:{kit}:{ip}` (429), id check (400), read `id, vendor_id` where `id` and `kit_slug` match (503 on error, 404 when absent), `loadCheckoutEvidence` (503 on null), 200 with the body, `Cache-Control: no-store`.

- [x] Tests first: 401, 429 without a read, 400, 503 on read error, 404 for another kit's transaction (assert the `kit_slug` filter is applied), 503 when the loader fails, 200 body parsed by `checkoutEvidenceResponseSchema`, the no-store header.
- [x] Contract sample and its schema test.
- [x] Implement, README, commit.

### Task 5: paykit docs, gate, PR

- [x] READMEs for every folder touched (root, `src/lib`, `supabase/migrations`, `supabase/tests`, `test/contract`, `test/db`, `src/app/api/v1/checkout`, the two route folders). `CHANGELOG.md` under `[Unreleased]`.
- [x] `pnpm check && pnpm test` in the worktree, nothing else running.
- [x] Push in the background, open the PR, wait for CI including the `db` job (the first real run of the migration and the pgTAP file).
- [ ] Give the owner: the PR link, the full migration SQL, the spike result, and suggested `AGENTS.md` lines. Stop until they merge, apply the migration and the deploy is live.

---

## Part 2: qkit (only after Part 1 is merged, migrated and deployed)

### Task 6: Client

**Files:** `src/lib/paykit/client.ts`, its test.

```ts
export async function claimCheckout(
  transactionId: string,
  proof?: Blob,
): Promise<PaykitResult<TransactionStatus>>;

export type CheckoutEvidence = {
  proofUrl: string | null;
  duplicateOf: { orderRef: string; kitSlug: string } | null;
  amountMatch: boolean | null;
};
export async function getCheckoutEvidence(
  transactionId: string,
): Promise<PaykitResult<CheckoutEvidence>>;
```

`paykitRequest` stops forcing `Content-Type: application/json` when the body is a `FormData` (fetch must write the multipart boundary itself).

- [x] Tests first: a claim with a file sends a `FormData` body with one `proof` part and no JSON content type, with the longer timeout; a claim without one is byte-for-byte today's request; `getCheckoutEvidence` maps the body, and fails on a malformed one.
- [x] Implement, commit.

### Task 7: `claimPayment` forwards the file

**Files:** `payment-actions.ts`, `finalize-paid-order.ts`, their tests.

- [x] Tests first: the action never calls `supabase.storage`; `claimCheckout` receives the validated file; `finalizePaidOrder` is called with no `proof`; a failed lookup or a failed claim returns "Could not record payment. Try again." with no `assign_order_number`, no notification and no order update; a `claimed` order with no number may retry, a `claimed` order with a number may not; `writePaidMirror` never writes `payment_proof_path` or `payment_proof_hash`.
- [x] Implement: remove the hash, the upload, `PAYMENT_PROOF_EXTENSIONS` use and the `proof` option. Commit.

### Task 8: The viewer reads through one action

**Files:** `src/app/dashboard/payment-evidence-actions.ts` + test, `payment-proof-viewer.tsx` + dom test, `order-card-parts.tsx` + dom test.

```ts
export type OrderPaymentProof = {
  url: string | null;
  duplicateOrderNumber: string | null;
  duplicateElsewhere: boolean;
  amountMatch: boolean | null;
};
export async function getOrderPaymentProof(
  orderId: string,
): Promise<OrderPaymentProof | null>;
```

Flow: validate the id; read the signed-in user; read the order and its booth's `vendor_id` with the session client; refuse unless the booth's vendor is the user; if the order has `payment_proof_path`, answer from `getProofPhotoUrl` and `findDuplicateProofOrder`; otherwise `getCheckoutByOrderRef(order.id)`, refuse a transaction of another vendor, `getCheckoutEvidence`, and resolve a `qkit` duplicate's `order_ref` to an order number with the session client.

- [x] Action tests first: invalid id; no session; an order RLS does not return; an admin's view of another vendor's order; the legacy path (path present: old functions called, paykit not called); the paykit path; paykit lookup 404; lookup of another vendor's transaction; evidence call failing; a duplicate in `qkit` the vendor can read; a duplicate in `qkit` they cannot; a duplicate in another kit.
- [x] Viewer dom tests: renders the photo from the one action; duplicate copy for a numbered order and for "another payment"; paykit's `amountMatch` shown without starting OCR; no photo shows "No payment screenshot on file."; per the spike outcome, either OCR still runs when `amountMatch` is null, or no OCR code remains.
- [x] `order-card-parts.tsx`: the trigger shows for a claimed, non-cancelled order whether or not it has a path. Dom test for both.
- [x] Commit.

### Task 9: Tesseract, per the spike

- [x] 3A only: delete `public/tesseract/`, `tesseract.js`, `tesseract.js-core`, and their references in `eslint.config.mjs`, `vitest.config.ts`, `.prettierignore`, `pnpm-workspace.yaml`, `package.json`, `order-card-parts.tsx`, the viewer and its dom test. 3B: nothing to do; say so in the PR.

### Task 10: Mock, docs, gate, PR

- [x] `e2e/paykit-mock.ts`: the claim reads and discards a multipart body and remembers that a proof came; `GET /api/v1/checkout/{id}/evidence` answers the contract shape.
- [x] READMEs for touched folders, `CHANGELOG.md`, this plan's checkboxes, `docs/superpowers/plans/README.md`.
- [ ] `pnpm check && pnpm test`. Push in the background. Open the PR against the live endpoint, wait for green including `e2e (order lifecycle)`.
- [ ] Hand the owner the manual check: on a preview with "TEST · PayNow", upload a screenshot, open it on the board, upload the same file on a second order and see the duplicate warning. No QR order on "TEST · Printing".
