# Paykit Payment-Status Callback (Separation P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** paykit tells qkit whenever a payment changes, and qkit applies the status it then reads back from paykit, so a payment change qkit did not cause itself still numbers, announces and mirrors the order.

**Architecture:** paykit stores an optional callback address and secret per calling kit and, after a claim, unclaim or confirm commits, posts a small hint to it without waiting. qkit's new route treats that body as a hint only: it takes `order_ref`, reads the real status with P1's lookup, checks vendor and amount, and applies it. The order half of `claimPayment` moves into one function, `finalizePaidOrder`, that the action and the route both call and that is safe to run twice at the same moment.

**Tech Stack:** Next.js 16 route handlers and server actions (`after` from `next/server`), TypeScript strict, Zod, Supabase service-role client, Vitest, Playwright (qkit e2e with a paykit mock).

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, section "P2. paykit tells qkit when a payment changes", read with "The boundary" and "P6. Bank auto detect, in paykit only". Builds on `docs/superpowers/plans/2026-10-10-paykit-order-ref-lookup.md` (P1, merged as merqo-io/Paykit#126 and merqo-io/Qkit#215).

## Global Constraints

- Two repos, two PRs. paykit first (Tasks 1 to 3), merged, its migration applied by the owner, deployed. Then qkit (Tasks 4 to 9). The qkit PR is safe to merge before the owner sets the callback row: with no row, paykit sends nothing.
- Before starting work in a repo, run `gh pr list --repo merqo-io/<repo> --state open`. Never edit, rebase or merge a PR that is not from this plan. If another PR touches the same files, stop and tell the owner. Checked 2026-10-12: paykit has no open PR; qkit has #218 (the spec file only) and #219 (board and menu splits, plus `CHANGELOG.md`). Neither touches a file below except `CHANGELOG.md`.
- Feature branch per repo, never `main`. No `--no-verify`, no hook bypass.
- Migration: paykit only, two nullable columns. qkit none. The agent does not apply it; the owner gets the SQL in chat and runs it by hand.
- Never read or write `.env*` or `secrets/**`. That includes `.env.example`: the owner adds the new variable's line themselves (Task 9 gives the exact text).
- `AGENTS.md`, `CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*`, `Dockerfile` are protected. This plan does not edit them. Tasks 3 and 9 hand the owner suggested `AGENTS.md` lines.
- No bank or payment detection. paykit's rule against "a real auto-verify integration" stands; this plan only reports transitions a human caused.
- TypeScript strict: no `any`, no `@ts-ignore`. Zod at every boundary. The service-role client is used only in route handlers, server actions and server-only modules.
- No secret under `NEXT_PUBLIC_*`.
- paykit CI gates: changed-line coverage at least 80%; `CHANGELOG.md` touched when `src/` changes; the `README.md` of every folder with a changed file touched (the root `README.md` too, because `CHANGELOG.md` is at the root); no change-narration comments (a comment must not open with "was", "added", "removed", "changed", "updated", "renamed", "moved", "refactored", a date or a ticket reference).
- qkit lint gates: no trailing comments on a code line, no commented-out code, no em dash in user-facing copy.
- Commit messages follow Conventional Commits and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  Pass messages with `git commit -F <file>` when they span lines.
- `pnpm check && pnpm test` must pass in a repo before its PR is opened.
- One full test suite at a time on this machine. qkit's takes about 13 minutes, paykit's about 10. The Stop hook and the pre-push hook each run it. A push takes 13 to 16 minutes: run it in the background with a 600000 ms timeout and keep the whole log. Commit before ending a turn so the Stop hook sees a clean tree.
- qkit e2e needs a local Supabase, which this machine does not have. Say so in the PR; do not claim it passed.
- No QR order on the production booth "TEST · Printing". Manual checks use "TEST · PayNow" only, and only on the owner's go-ahead. The agent types no payment identifier into any form. Telegram is not wired and is not something to test.
- Until 2026-10-15, subagents use Haiku for implementers and Opus for reviewers.

## Decisions this plan settles

Each was open in the spec or the brief. They are stated here so a reviewer can reject one without reading the tasks.

1. **`finalizePaidOrder` keeps `claimPayment`'s order: assign the number, notify, write the mirror last.** Upload and the paykit claim stay in the action, before it.
2. **The vendor alert fires once per order, guarded by the existing limiter.** `finalizePaidOrder` asks `rateLimit("paid-order-alert:<orderId>", 1, 86400)` and sends the alert only when it is allowed. The limiter's SQL is one atomic insert-or-increment, so two runs in the same instant get different answers. This needs no migration, which the spec requires. Its limits are stated, not hidden: the window is a fixed UTC day, so an undo and a second claim on the next day alert again; and the limiter fails open, so during a limiter outage a duplicate alert is possible and a lost one is not. The exact alternative is a `finalized_at` column on `orders`, which is a qkit migration the spec rules out.
3. **The print job is not guarded in qkit, because printkit already refuses a second job for the same order.** printkit keeps one job per `(source_kit, source_ref)` and answers 409 on a repeat. `notifyPrintkit` learns that 409 means "already queued" and stops logging it as a failure. A print job is therefore attempted on every run and printed once, so a run that dies midway is repaired by the next one.
4. **A numbered order is never finalized again.** For an order that already has a number the callback only moves the mirror. Otherwise a confirm that arrives a day later would send a "new order" alert and could print a label for an order that never printed.
5. **The callback compares paykit's transaction against the order's booth's vendor and the order's total.** No vendor is signed in, so `booths.vendor_id` for `orders.booth_id` is the vendor of record. A mismatch on either changes nothing and answers 409.
6. **When paykit's lookup fails or times out, the callback changes nothing and answers 503.** paykit does not retry. The order is repaired by the next callback, by the action that caused the change (it writes its own mirror), or by the vendor's confirm button. Guessing from the body is the one thing the route must never do.
7. **The route does not use `transactionIdForOrder`.** That helper creates a checkout when paykit has none. A callback about an order paykit has no transaction for is refused (409), never answered by creating one.
8. **paykit sends the callback with `after()`, not a detached promise.** On Vercel a promise left running after the response can be frozen with the function. `after` keeps it alive without delaying the response. Awaiting it instead would be wrong: qkit's handler calls paykit back and can take seconds, and qkit's paykit client gives up after 5 seconds.
9. **The callback goes to the kit that owns the transaction (`transactions.kit_slug`), not the caller.** They are the same today. P6 needs the first: paykit itself will confirm, with no calling kit.
10. **`finalizePaidOrder` takes the payment it is recording, not only the order id.** The spec writes `finalizePaidOrder(orderId)`. Writing the mirror needs the status, paykit's `confirmed_at`, and (until P3) the screenshot path and hash, so those are passed in.
11. **The route validates only `order_ref`.** `transaction_id` and `status` are in the contract and ignored on purpose. Rejecting a body over a field the route never reads would only add ways to lose a callback.

## Review Focus

1. **The action and the callback finalize the same order at the same moment.** This is the normal case, not an edge: paykit fires the callback the instant the claim commits, while `claimPayment` is still running. Expected: one order number, one vendor alert, one label, and the screenshot is kept whichever write lands first. Pinned in Task 5 (409), Task 6 (twice, concurrently, screenshot fallback) and Task 7 (alert already sent).
2. **paykit cannot be reached from inside the callback.** Expected: nothing about the order changes and the answer is 503. Pinned in Task 8.
3. **A body that is forged, replayed or out of order arrives with a valid secret.** Expected: the order ends in the state paykit holds, whatever the body said. Pinned in Task 8.
4. **paykit's transaction for that `order_ref` belongs to another vendor or has another amount.** Expected: refused, nothing changes. Pinned in Task 8.
5. **A calling kit has no callback, half a callback, a non-https address, or an endpoint that is slow or failing.** Expected: the claim, unclaim or confirm request answers exactly as it does today. Pinned in Tasks 1 and 2.

Also pinned: a cancelled order is left alone and logged (Task 8); a confirm on an already-numbered order sends no alert and no print job (Task 8).

Known and deliberately not changed here:

- paykit does not retry a callback and keeps no record of failed ones beyond a log line. Enough while every transition is caused by a kit action that also writes its own mirror. P6 needs delivery it can rely on; that belongs to P6's spec.
- A callback-applied change writes no `admin_audit` row: there is no acting user. paykit's `payment_audit` holds the transition.
- paykit's claim, unclaim and confirm routes read and write a transaction by id alone. Their READMEs say the lookup and the write also filter on the calling kit's slug; the code on `origin/main` does not. Reported to the owner, not fixed here.
- `confirmPaymentAndStart` does not write `paid_at`. The callback now fills it. The action is not changed.

## File Structure

paykit (`C:\Users\Clarence\Desktop\Coding\Merqo Business\paykit`, in a new worktree):

| File                                                                                                               | Responsibility                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `supabase/migrations/0021_kit_api_keys_callback.sql` (create)                                                      | Two nullable columns on `kit_api_keys`                             |
| `src/lib/types.ts` (modify)                                                                                        | `kit_api_keys` row, insert and update types                        |
| `src/lib/api-schemas.ts` (modify)                                                                                  | `paymentStatusCallbackSchema`: the body paykit sends               |
| `src/lib/kit-callback.ts` (create)                                                                                 | `notifyKitPaymentStatus`, `schedulePaymentStatusCallback`          |
| `src/lib/kit-callback.test.ts` (create)                                                                            | Unit tests for both                                                |
| `src/app/api/v1/checkout/[id]/claim/route.ts`, `unclaim/route.ts`, `confirm/route.ts` (modify)                     | Schedule the callback after a real transition                      |
| `src/app/api/v1/checkout/[id]/claim/route.test.ts`, `unclaim/route.test.ts`, `confirm/route.test.ts` (modify)      | When the callback is and is not scheduled                          |
| `test/contract/payment-status-callback.sample.json` (create), `test/contract/paykit-api.contract.test.ts` (modify) | Saved example of the callback body and its schema check            |
| READMEs, `CHANGELOG.md`, `docs/SECRET_ROTATION.md` (modify)                                                        | Required by CI, plus where an operator looks for a callback secret |

qkit (this worktree, branch `claude/agitated-yalow-8b552d`):

| File                                                                         | Responsibility                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/qkit-paykit-auth.ts`, `.test.ts` (create)                           | `paykitCallbackBearerOk`: constant-time check of `PAYKIT_CALLBACK_SECRET` |
| `src/app/o/[code]/notify.ts` (modify), `notify.test.ts` (create)             | `notifyPrintkit` treats printkit's 409 as "already queued"                |
| `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.ts` (create)      | `finalizePaidOrder`, `writePaidMirror`                                    |
| `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts` (create) | Unit tests, including twice and concurrently                              |
| `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`, `.test.ts`       | `claimPayment` calls `finalizePaidOrder`                                  |
| `src/app/api/paykit/payment-status/route.ts`, `route.test.ts` (create)       | The inbound callback                                                      |
| `e2e/paykit-mock.ts`, `playwright.config.ts` (modify)                        | The mock fires the callback the way paykit does                           |
| READMEs, `CHANGELOG.md`, `docs/DEPLOY.md`, `docs/OPS-RUNBOOK.md` (modify)    | Docs                                                                      |

---

## Part 1: paykit

### Task 1: Callback columns and the sender

**Files:**

- Create: `supabase/migrations/0021_kit_api_keys_callback.sql`
- Modify: `src/lib/types.ts` (the `kit_api_keys` block, near line 245)
- Modify: `src/lib/api-schemas.ts` (after the `CheckoutLookupResponse` type export)
- Create: `src/lib/kit-callback.ts`
- Create: `src/lib/kit-callback.test.ts`

**Interfaces:**

- Consumes: `createServiceClient()` from `@/lib/supabase/server`; `txStatusSchema`, `uuidSchema` from `@/lib/api-schemas`; `after` from `next/server`.
- Produces:
  - `paymentStatusCallbackSchema` (Zod) and type `PaymentStatusCallback`: `{ order_ref: string; transaction_id: string; status: "pending" | "claimed" | "confirmed" }`.
  - `type CallbackTransaction = { id: string; kit_slug: string; order_ref: string; status: string }`.
  - `notifyKitPaymentStatus(tx: CallbackTransaction): Promise<void>`. Never throws.
  - `schedulePaymentStatusCallback(tx: CallbackTransaction): void`. Registers `notifyKitPaymentStatus` to run after the response.

- [ ] **Step 1: Create the paykit worktree and install**

```bash
cd "/c/Users/Clarence/Desktop/Coding/Merqo Business/paykit"
gh pr list --repo merqo-io/paykit --state open
git fetch origin
git worktree add .claude/worktrees/payment-status-callback -b feat/payment-status-callback origin/main
cd .claude/worktrees/payment-status-callback
pnpm install --frozen-lockfile
```

Expected: no open PR touching `src/app/api/v1/checkout` or `src/lib/api-schemas.ts`; install completes. All later paykit steps run from this worktree.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0021_kit_api_keys_callback.sql`:

```sql
-- Optional outbound callback for a calling kit, beside the inbound bearer
-- secret it already has. secret_hash verifies a secret the kit presents to
-- paykit, so it only ever needs comparing. callback_secret is a secret paykit
-- presents to the kit's own callback route, so paykit has to be able to read
-- it back: it is stored as given. The table stays service-role only (RLS on
-- with no policy, see 0001), so anon and authenticated can read neither
-- column.
--
-- Both are nullable. A kit with either one unset gets no callback.
-- callback_url is the kit's full endpoint URL and must be https.
alter table paykit.kit_api_keys
  add column callback_url text,
  add column callback_secret text;
```

The agent does not apply this. `service_role` already holds `grant all on all tables in schema paykit` from `0001`, which covers new columns, so no grant is needed.

- [ ] **Step 3: Mirror the columns in the types**

In `src/lib/types.ts`, replace the `kit_api_keys` block's `Row`, `Insert` and `Update` with:

```ts
        Row: {
          kit_slug: string;
          secret_hash: string;
          created_at: string;
          last_used_at: string | null;
          callback_url: string | null;
          callback_secret: string | null;
        };
        Insert: {
          kit_slug: string;
          secret_hash: string;
          created_at?: string;
          last_used_at?: string | null;
          callback_url?: string | null;
          callback_secret?: string | null;
        };
        Update: {
          secret_hash?: string;
          last_used_at?: string | null;
          callback_url?: string | null;
          callback_secret?: string | null;
        };
```

- [ ] **Step 4: Write the failing sender tests**

Create `src/lib/kit-callback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notifyKitPaymentStatus,
  schedulePaymentStatusCallback,
} from "./kit-callback";

const { maybeSingleMock, eqMock, selectMock, fromMock, afterMock } = vi.hoisted(
  () => {
    const maybeSingleMock = vi.fn();
    const eqMock = vi.fn((..._args: unknown[]) => ({
      maybeSingle: maybeSingleMock,
    }));
    const selectMock = vi.fn((..._args: unknown[]) => ({ eq: eqMock }));
    const fromMock = vi.fn((..._args: unknown[]) => ({ select: selectMock }));
    return {
      maybeSingleMock,
      eqMock,
      selectMock,
      fromMock,
      afterMock: vi.fn(),
    };
  },
);
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve({ from: fromMock }),
}));
vi.mock("next/server", () => ({ after: afterMock }));

const TX = {
  id: "22222222-2222-2222-2222-222222222222",
  kit_slug: "qkit",
  order_ref: "A-001",
  status: "claimed",
};
const CALLBACK_URL = "https://qkit.test/api/paykit/payment-status";
const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function configured(
  row: { callback_url: string | null; callback_secret: string | null } = {
    callback_url: CALLBACK_URL,
    callback_secret: "shared-secret",
  },
) {
  maybeSingleMock.mockResolvedValue({ data: row, error: null });
}

beforeEach(() => {
  maybeSingleMock.mockReset();
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
  afterMock.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = fetchMock as unknown as typeof fetch;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  errorSpy.mockRestore();
  vi.useRealTimers();
});

describe("notifyKitPaymentStatus", () => {
  it("posts the transaction's status to the owning kit's callback", async () => {
    configured();
    await notifyKitPaymentStatus(TX);

    expect(fromMock).toHaveBeenCalledWith("kit_api_keys");
    expect(selectMock).toHaveBeenCalledWith("callback_url, callback_secret");
    expect(eqMock).toHaveBeenCalledWith("kit_slug", "qkit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(CALLBACK_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({
      Authorization: "Bearer shared-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      order_ref: "A-001",
      transaction_id: TX.id,
      status: "claimed",
    });
  });

  it.each([
    ["no row for the kit", null],
    ["no callback_url", { callback_url: null, callback_secret: "s" }],
    [
      "no callback_secret",
      { callback_url: CALLBACK_URL, callback_secret: null },
    ],
    ["an empty callback_url", { callback_url: "", callback_secret: "s" }],
  ])("sends nothing when the kit has %s", async (_, row) => {
    maybeSingleMock.mockResolvedValue({ data: row, error: null });
    await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each(["http://qkit.test/api/paykit/payment-status", "not a url"])(
    "sends nothing, and logs, when callback_url is %s",
    async (callback_url) => {
      configured({ callback_url, callback_secret: "shared-secret" });
      await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    },
  );

  it("sends nothing when the transaction's status is not a payment status", async () => {
    configured();
    await notifyKitPaymentStatus({ ...TX, status: "refunded" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when the kit_api_keys read returns an error", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when the kit_api_keys read rejects", async () => {
    maybeSingleMock.mockRejectedValue(new Error("database unavailable"));
    await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when the callback request rejects", async () => {
    configured();
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw on a non-2xx answer, and never logs the secret", async () => {
    configured();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(notifyKitPaymentStatus(TX)).resolves.toBeUndefined();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("shared-secret");
  });

  it("gives up after 5 seconds", async () => {
    vi.useFakeTimers();
    configured();
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const done = notifyKitPaymentStatus(TX);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("schedulePaymentStatusCallback", () => {
  it("registers the callback to run after the response, without sending it yet", () => {
    configured();
    schedulePaymentStatusCallback(TX);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the callback when the registered work runs", async () => {
    configured();
    schedulePaymentStatusCallback(TX);
    const work = afterMock.mock.calls[0][0] as () => Promise<void>;
    await work();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/kit-callback.test.ts`
Expected: FAIL, cannot resolve `./kit-callback`.

- [ ] **Step 6: Add the body schema**

In `src/lib/api-schemas.ts`, directly after the `CheckoutLookupResponse` type export, add:

```ts
/** Body paykit posts to a calling kit's `callback_url` after a claim, unclaim
 *  or confirm commits. It is a hint that the transaction changed: the
 *  receiver reads the real status back with `GET /api/v1/checkout?order_ref=`
 *  and must not act on `status` here. */
export const paymentStatusCallbackSchema = z.object({
  order_ref: z.string().min(1).max(200),
  transaction_id: uuidSchema,
  status: txStatusSchema,
});
export type PaymentStatusCallback = z.infer<typeof paymentStatusCallbackSchema>;
```

- [ ] **Step 7: Write the sender**

Create `src/lib/kit-callback.ts`:

```ts
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { paymentStatusCallbackSchema } from "@/lib/api-schemas";

const CALLBACK_TIMEOUT_MS = 5000;

export type CallbackTransaction = {
  id: string;
  kit_slug: string;
  order_ref: string;
  status: string;
};

// The secret travels in a header, so anything but https would expose it.
function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Tells the kit that owns a transaction that its status changed. The target
 * is the transaction's own `kit_slug`, not whichever kit made the request, so
 * a change paykit makes by itself reaches the right kit too.
 *
 * Best effort: a kit with no callback configured is skipped silently, every
 * failure is logged and swallowed, and the request is abandoned after 5
 * seconds. The receiver treats the body as a hint and reads the status back,
 * so a lost or repeated call can never leave it holding a wrong status.
 */
export async function notifyKitPaymentStatus(
  tx: CallbackTransaction,
): Promise<void> {
  const body = paymentStatusCallbackSchema.safeParse({
    order_ref: tx.order_ref,
    transaction_id: tx.id,
    status: tx.status,
  });
  if (!body.success) {
    console.error("notifyKitPaymentStatus: transaction is not sendable", tx.id);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("kit_api_keys")
      .select("callback_url, callback_secret")
      .eq("kit_slug", tx.kit_slug)
      .maybeSingle();
    if (error) {
      console.error(
        "notifyKitPaymentStatus: kit_api_keys lookup failed",
        error.message,
      );
      return;
    }
    if (!data?.callback_url || !data.callback_secret) return;

    const url = httpsUrl(data.callback_url);
    if (!url) {
      console.error(
        `notifyKitPaymentStatus: ${tx.kit_slug} callback_url is not an https URL`,
      );
      return;
    }

    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${data.callback_secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body.data),
    });
    if (!res.ok)
      console.error(
        `notifyKitPaymentStatus: ${tx.kit_slug} returned ${res.status}`,
      );
  } catch (err) {
    console.error(
      "notifyKitPaymentStatus failed",
      err instanceof Error ? err.message : "unknown error",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the callback once the response has gone out. `after` keeps the
 * function alive for it, which a detached promise does not guarantee on a
 * serverless host. The route must not await it: the receiving kit calls
 * paykit back from inside its handler.
 */
export function schedulePaymentStatusCallback(tx: CallbackTransaction): void {
  after(() => notifyKitPaymentStatus(tx));
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/kit-callback.test.ts src/lib/api-schemas.test.ts`
Expected: PASS.

Then: `pnpm exec tsc --noEmit`
Expected: no errors. If `tsc` rejects `init.headers` or `init.body` in the test as possibly undefined, the mock's call tuple is typed too narrowly: declare `fetchMock` as `ReturnType<typeof vi.fn<(url: unknown, init: RequestInit) => Promise<unknown>>>` and read the headers through a local `const init = fetchMock.mock.calls[0][1]`. Do not cast with `as any`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0021_kit_api_keys_callback.sql src/lib/types.ts src/lib/api-schemas.ts src/lib/kit-callback.ts src/lib/kit-callback.test.ts
git commit -m "feat: send a payment-status callback to the kit that owns a transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Claim, unclaim and confirm schedule the callback

**Files:**

- Modify: `src/app/api/v1/checkout/[id]/claim/route.ts`, `src/app/api/v1/checkout/[id]/unclaim/route.ts`, `src/app/api/v1/checkout/[id]/confirm/route.ts`
- Modify: the `route.test.ts` beside each

**Interfaces:**

- Consumes: `schedulePaymentStatusCallback(tx)` from `@/lib/kit-callback` (Task 1).
- Produces: no change to any response. After a transition that really happened (the guarded update returned its row), the route schedules one callback with that row. An idempotent no-op, a lost race and every error path schedule none.

- [ ] **Step 1: Write the failing tests for claim**

In `src/app/api/v1/checkout/[id]/claim/route.test.ts`, add directly below the existing `vi.mock("@/lib/rate-limit", ...)` block:

```ts
const { scheduleCallbackMock } = vi.hoisted(() => ({
  scheduleCallbackMock: vi.fn(),
}));
vi.mock("@/lib/kit-callback", () => ({
  schedulePaymentStatusCallback: scheduleCallbackMock,
}));
beforeEach(() => {
  scheduleCallbackMock.mockReset();
});
```

and at the end of the file:

```ts
describe("payment-status callback on claim", () => {
  const CLAIMED = {
    ...ROW,
    status: "claimed",
    claimed_at: "2026-07-15T00:01:00Z",
  };

  it("schedules one callback with the updated row after a real claim", async () => {
    updateSingle.mockResolvedValue({ data: CLAIMED, error: null });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).toHaveBeenCalledTimes(1);
    expect(scheduleCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TX_ID,
        kit_slug: "qkit",
        order_ref: "A-001",
        status: "claimed",
      }),
    );
  });

  it("targets the kit that owns the transaction, not the calling kit", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "loopkit" });
    updateSingle.mockResolvedValue({ data: CLAIMED, error: null });
    await POST(req(), ctx());
    expect(scheduleCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ kit_slug: "qkit" }),
    );
  });

  it("schedules nothing for an idempotent no-op", async () => {
    readMaybeSingle.mockResolvedValue({ data: CLAIMED, error: null });
    await POST(req(), ctx());
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when a concurrent request won the race", async () => {
    readMaybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: ROW, error: null })
      .mockResolvedValueOnce({ data: CLAIMED, error: null });
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "no rows matched the conditional update" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when the update fails", async () => {
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(503);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when unauthorized or rate limited", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    await POST(req(), ctx());
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "qkit" });
    rateLimitMock.mockResolvedValue(false);
    await POST(req(), ctx());
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing tests for unclaim**

In `src/app/api/v1/checkout/[id]/unclaim/route.test.ts`, add the same mock block as Step 1 below its `vi.mock("@/lib/rate-limit", ...)` block:

```ts
const { scheduleCallbackMock } = vi.hoisted(() => ({
  scheduleCallbackMock: vi.fn(),
}));
vi.mock("@/lib/kit-callback", () => ({
  schedulePaymentStatusCallback: scheduleCallbackMock,
}));
beforeEach(() => {
  scheduleCallbackMock.mockReset();
});
```

and at the end of the file (this file's `ROW` is a `claimed` transaction):

```ts
describe("payment-status callback on unclaim", () => {
  const PENDING = { ...ROW, status: "pending", claimed_at: null };

  it("schedules one callback with the updated row after a real unclaim", async () => {
    updateSingle.mockResolvedValue({ data: PENDING, error: null });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).toHaveBeenCalledTimes(1);
    expect(scheduleCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TX_ID,
        kit_slug: "qkit",
        order_ref: "A-001",
        status: "pending",
      }),
    );
  });

  it("schedules nothing for an idempotent no-op", async () => {
    readMaybeSingle.mockResolvedValue({ data: PENDING, error: null });
    await POST(req(), ctx());
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing for a confirmed transaction it refuses to revert", async () => {
    readMaybeSingle.mockResolvedValue({
      data: { ...ROW, status: "confirmed" },
      error: null,
    });
    await POST(req(), ctx());
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when a concurrent request won the race", async () => {
    readMaybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: ROW, error: null })
      .mockResolvedValueOnce({
        data: { ...ROW, status: "confirmed" },
        error: null,
      });
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "no rows matched the conditional update" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when the update fails", async () => {
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(503);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });
});
```

If this file names its request or context helper differently from `req()` and `ctx()`, use the names it already has.

- [ ] **Step 3: Write the failing tests for confirm**

In `src/app/api/v1/checkout/[id]/confirm/route.test.ts`, add the same mock block below its `vi.mock("@/lib/rate-limit", ...)` block:

```ts
const { scheduleCallbackMock } = vi.hoisted(() => ({
  scheduleCallbackMock: vi.fn(),
}));
vi.mock("@/lib/kit-callback", () => ({
  schedulePaymentStatusCallback: scheduleCallbackMock,
}));
beforeEach(() => {
  scheduleCallbackMock.mockReset();
});
```

and at the end of the file (this file's `ROW` is a `claimed` transaction):

```ts
describe("payment-status callback on confirm", () => {
  const CONFIRMED = {
    ...ROW,
    status: "confirmed",
    confirmed_at: "2026-07-15T00:02:00Z",
  };

  it("schedules one callback with the updated row after a real confirm", async () => {
    updateSingle.mockResolvedValue({ data: CONFIRMED, error: null });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).toHaveBeenCalledTimes(1);
    expect(scheduleCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TX_ID,
        kit_slug: "qkit",
        order_ref: "A-001",
        status: "confirmed",
      }),
    );
  });

  it("schedules nothing for an already confirmed transaction", async () => {
    readMaybeSingle.mockResolvedValue({ data: CONFIRMED, error: null });
    await POST(req(), ctx());
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when a concurrent request won the race", async () => {
    readMaybeSingle
      .mockReset()
      .mockResolvedValueOnce({ data: ROW, error: null })
      .mockResolvedValueOnce({ data: CONFIRMED, error: null });
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "no rows matched the conditional update" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });

  it("schedules nothing when the update fails", async () => {
    updateSingle.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(503);
    expect(scheduleCallbackMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run "src/app/api/v1/checkout/[id]"`
Expected: the three "schedules one callback" tests and the "targets the kit that owns" test FAIL (called 0 times). The "schedules nothing" tests pass already. Every existing test still passes.

- [ ] **Step 5: Schedule the callback in each route**

In each of the three `route.ts` files, add the import beside the existing `@/lib/payment-audit` import:

```ts
import { schedulePaymentStatusCallback } from "@/lib/kit-callback";
```

In `claim/route.ts`, replace

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "claimed");
return NextResponse.json(toStatusResponse(updated));
```

with

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "claimed");
schedulePaymentStatusCallback(updated);
return NextResponse.json(toStatusResponse(updated));
```

In `unclaim/route.ts`, replace

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "unclaimed");
return NextResponse.json(toStatusResponse(updated));
```

with

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "unclaimed");
schedulePaymentStatusCallback(updated);
return NextResponse.json(toStatusResponse(updated));
```

In `confirm/route.ts`, replace

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "confirmed");
return NextResponse.json(toStatusResponse(updated));
```

with

```ts
await recordPaymentAudit(supabase, id, auth.kitSlug, "confirmed");
schedulePaymentStatusCallback(updated);
return NextResponse.json(toStatusResponse(updated));
```

Nothing else in the routes changes. The early returns (no-op, lost race, errors) are above this line, so they schedule nothing.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run "src/app/api/v1/checkout" src/lib/kit-callback.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/v1/checkout/[id]"
git commit -m "feat: call the owning kit back after a claim, unclaim or confirm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: paykit contract sample, docs, gate, PR

**Files:**

- Create: `test/contract/payment-status-callback.sample.json`
- Modify: `test/contract/paykit-api.contract.test.ts`, `test/contract/README.md`
- Modify: `src/lib/README.md`, `src/app/api/v1/checkout/[id]/claim/README.md`, `src/app/api/v1/checkout/[id]/unclaim/README.md`, `src/app/api/v1/checkout/[id]/confirm/README.md`, `supabase/migrations/README.md`, `docs/SECRET_ROTATION.md`, `docs/README.md`, `README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: `paymentStatusCallbackSchema` from Task 1.
- Produces: the deployed sender qkit's Part 2 receives from.

- [ ] **Step 1: Add the saved example and its check**

Create `test/contract/payment-status-callback.sample.json`:

```json
{
  "order_ref": "A-001",
  "transaction_id": "11111111-1111-1111-1111-111111111111",
  "status": "claimed"
}
```

In `test/contract/paykit-api.contract.test.ts`, add `paymentStatusCallbackSchema` to the import from `@/lib/api-schemas`, and add inside the `describe`:

```ts
it("the payment-status callback body satisfies paymentStatusCallbackSchema", () => {
  const parsed = paymentStatusCallbackSchema.safeParse(
    loadSample("payment-status-callback.sample.json"),
  );
  expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
});

it("the callback body rejects a status outside the three payment statuses", () => {
  const parsed = paymentStatusCallbackSchema.safeParse({
    ...loadSample("payment-status-callback.sample.json"),
    status: "refunded",
  });
  expect(parsed.success).toBe(false);
});
```

Run: `pnpm vitest run test/contract`
Expected: PASS.

- [ ] **Step 2: Update the READMEs and changelog**

`test/contract/README.md`, under Contents:

```markdown
- `payment-status-callback.sample.json` — a saved example of the body paykit
  posts to a calling kit's `callback_url`. This one is outbound: it is what
  paykit sends, not what an `/api/v1/*` route answers.
```

`src/lib/README.md`, as a new entry after the `kit-auth.ts` entry:

```markdown
- `kit-callback.ts` — `notifyKitPaymentStatus(tx)` posts
  `{ order_ref, transaction_id, status }` to the `callback_url` of the kit
  that owns the transaction (`transactions.kit_slug`), with
  `Authorization: Bearer <callback_secret>`, both read from `kit_api_keys`.
  Best effort: a kit with either column unset is skipped silently, a
  non-https address is refused, the request is abandoned after 5 seconds and
  nothing is thrown. `schedulePaymentStatusCallback(tx)` registers it with
  `after`, so it runs once the response has gone out. The body is a hint: the
  receiving kit reads the status back with `GET /api/v1/checkout?order_ref=`.
```

Each of `src/app/api/v1/checkout/[id]/claim/README.md`, `unclaim/README.md` and `confirm/README.md`: add this paragraph directly above its `## Boundary and coverage` heading:

```markdown
A real transition also schedules one payment-status callback to the kit that
owns the transaction (`@/lib/kit-callback`), sent after the response. An
idempotent no-op, a lost race and every error path send none, and a failed
or missing callback never changes this route's answer.
```

`supabase/migrations/README.md`, as a new entry after the `0020` entry:

```markdown
- `0021_kit_api_keys_callback.sql` — adds nullable `kit_api_keys.callback_url`
  and `callback_secret`: where paykit posts a payment-status callback for that
  kit's transactions, and the secret it presents there. Stored readable, unlike
  `secret_hash`, because paykit has to send it; the table stays service-role
  only.
```

`docs/SECRET_ROTATION.md`, as a new section directly above its `## Parent` heading:

````markdown
## The callback secret is a different secret

`kit_api_keys.callback_secret` (migration `0021`) is the secret paykit
presents to a calling kit's own callback route. It is unrelated to the bearer
secret above, runs in the other direction, and `create-kit-key.mjs` neither
reads nor writes it, so rotating the bearer secret leaves it alone.

To rotate it, change both sides in this order, so the receiving kit never
rejects a callback paykit is already sending:

1. Set the new value in the calling kit's environment (for qkit,
   `PAYKIT_CALLBACK_SECRET`) and redeploy it.
2. Update the row:
   ```sql
   update paykit.kit_api_keys
   set callback_secret = '<new value>'
   where kit_slug = '<kit_slug>';
   ```

Between the two steps callbacks are answered 401 and dropped. That is safe:
the callback is a hint and the kit's own actions still write their status.
To stop callbacks to a kit, set `callback_url` to `null`.
````

`docs/README.md`, replace the `SECRET_ROTATION.md` entry with:

```markdown
- `SECRET_ROTATION.md` — how to safely rotate a calling kit's bearer
  secret (today's real hard-cutover constraint, using `last_used_at` to
  confirm timing), and how to rotate the separate callback secret.
```

Root `README.md`: in the paragraph that describes `GET /api/v1/checkout?order_ref=`, directly after the sentence ending "the stored checkout view.", add:

```markdown
After a claim, unclaim or confirm commits, paykit posts a payment-status
callback to the owning kit's `kit_api_keys.callback_url`, when one is set
(`src/lib/kit-callback.ts`). It is a hint that the transaction changed, sent
after the response and never awaited; the kit reads the status back with the
lookup above.
```

`CHANGELOG.md`, under `## [Unreleased]`, in the existing `### Added` section:

```markdown
- Payment-status callback: after a claim, unclaim or confirm commits, paykit
  posts `{ order_ref, transaction_id, status }` to the callback address of the
  kit that owns the transaction. A kit with no callback configured gets none,
  and a slow or failing callback never changes the request's answer. Needs
  migration `0021` (two nullable columns on `kit_api_keys`).
```

- [ ] **Step 3: Run the full gate**

Check that no other suite is running on this machine, then run: `pnpm check && pnpm test`
Expected: both exit 0.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add test/contract src/lib/README.md "src/app/api/v1/checkout/[id]" supabase/migrations/README.md docs/SECRET_ROTATION.md docs/README.md README.md CHANGELOG.md
git commit -m "docs: record the payment-status callback contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/payment-status-callback
```

The push runs the suite again (about 10 minutes). Then write the PR body to a file in the scratchpad and open the PR with `gh pr create --repo merqo-io/paykit --base main --title "feat: tell the owning kit when a payment changes" --body-file <file>`. The body:

```markdown
## What

- `kit_api_keys` gains nullable `callback_url` and `callback_secret` (migration `0021`).
- After a claim, unclaim or confirm commits, paykit posts `{ order_ref, transaction_id, status }` to the callback of the kit that owns the transaction, with `Authorization: Bearer <callback_secret>`.
- Sent with `after()` once the response has gone out. 5 second timeout, https only, redirects refused, never throws, never awaited by the route.

## Why

Today a kit only learns about a payment change it caused itself. This is the seam the later separation phases and bank auto detect rely on. Phase P2 of the design in the qkit repo: `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`.

The body is a hint. The receiving kit reads the status back with `GET /api/v1/checkout?order_ref=`, so a lost, repeated or reordered callback cannot leave it with a wrong status.

## Safe to merge and deploy before anything else

With no `callback_url` on a kit's row, nothing is sent. Behaviour is unchanged until the owner sets the row.

## Owner steps

1. Apply `supabase/migrations/0021_kit_api_keys_callback.sql` by hand.
2. Setting the qkit row comes later, with the qkit PR.

## Not in this PR

- No detection of payments. Only transitions a kit asked for are reported.
- No retry and no delivery record beyond a log line.
- `AGENTS.md` is not edited. Suggested lines are in the PR conversation.

## Verified

- `pnpm check && pnpm test` pass locally.
- Unit tests: sent body and headers, the owning kit is the target, unconfigured and half-configured kits, non-https address, timeout, every failure swallowed.
- Route tests: one callback after a real transition; none for a no-op, a lost race or an error.

## Not verified

- The migration has not been applied by the agent.
- Not exercised against a live deployment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Do not merge it. Report the URL to the owner.

- [ ] **Step 5: Hand the owner the SQL and the suggested `AGENTS.md` lines**

In chat, give the owner the full text of `0021_kit_api_keys_callback.sql` from Step 2 of Task 1 to apply by hand, and these suggested lines for paykit's `AGENTS.md` (the agent does not edit that file):

- File Layout: `src/lib/kit-callback.ts — outbound payment-status callback to the kit that owns a transaction (after a claim, unclaim or confirm)`
- Data model, `kit_api_keys` bullet, appended: `Optional callback_url and callback_secret (0021): where paykit posts a payment-status callback for that kit's transactions. The secret is stored readable because paykit sends it.`

Part 2's code can be written while this PR waits. Part 2's PR may be opened and merged in either order relative to this one; the callback only starts when the owner sets the row in Task 9.

---

## Part 2: qkit

All steps run from this worktree, `C:\Users\Clarence\Desktop\Coding\Merqo Business\qkit\.claude\worktrees\agitated-yalow-8b552d`, branch `claude/agitated-yalow-8b552d`.

### Task 4: `paykitCallbackBearerOk`

**Files:**

- Create: `src/lib/qkit-paykit-auth.ts`
- Create: `src/lib/qkit-paykit-auth.test.ts`

**Interfaces:**

- Consumes: `timingSafeEqual` from `node:crypto`; `process.env.PAYKIT_CALLBACK_SECRET`.
- Produces: `paykitCallbackBearerOk(request: Request): boolean`.

- [ ] **Step 1: Bring the branch up to date and check for overlap**

```bash
gh pr list --repo merqo-io/Qkit --state open
```

Then bring `main` into this worktree with the app's `sync_with_base_branch` tool, not `git merge`. If the app refuses because harness files changed, stop and ask the owner to confirm the origin under Help → Troubleshooting → Review Pinned Git Origins. Do not work around it. Then `pnpm install --frozen-lockfile` if the lockfile changed.

Expected: no open PR touching `payment-actions.ts`, `notify.ts`, `src/app/api/paykit` or `e2e/paykit-mock.ts`.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/qkit-paykit-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { paykitCallbackBearerOk } from "./qkit-paykit-auth";

const originalEnv = { ...process.env };

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://qkit.test/api/paykit/payment-status", {
    headers,
  });
}

describe("paykitCallbackBearerOk", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns false when PAYKIT_CALLBACK_SECRET is unset", () => {
    delete process.env.PAYKIT_CALLBACK_SECRET;
    expect(paykitCallbackBearerOk(requestWith("Bearer anything"))).toBe(false);
  });

  it("returns false when PAYKIT_CALLBACK_SECRET is empty, even for an empty bearer", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "";
    expect(paykitCallbackBearerOk(requestWith("Bearer "))).toBe(false);
  });

  it("returns false with no authorization header", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith(null))).toBe(false);
  });

  it("returns false for a scheme other than Bearer", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith("Basic shared-secret"))).toBe(
      false,
    );
  });

  it("returns false when the secret doesn't match", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer wrong-secret"))).toBe(
      false,
    );
  });

  it("returns false for a secret of a different length", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer shared-secret-x"))).toBe(
      false,
    );
  });

  it("does not accept the printkit callback secret", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "paykit-secret";
    process.env.PRINTKIT_CALLBACK_SECRET = "printkit-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer printkit-secret"))).toBe(
      false,
    );
  });

  it("returns true when the secret matches exactly", () => {
    process.env.PAYKIT_CALLBACK_SECRET = "shared-secret";
    expect(paykitCallbackBearerOk(requestWith("Bearer shared-secret"))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/qkit-paykit-auth.test.ts`
Expected: FAIL, cannot resolve `./qkit-paykit-auth`.

- [ ] **Step 4: Implement**

Create `src/lib/qkit-paykit-auth.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time bearer check against PAYKIT_CALLBACK_SECRET, for
 * POST /api/paykit/payment-status. A plain shared secret with no kit_slug
 * prefix: paykit is that route's only caller. Kept apart from
 * printkitCallbackBearerOk (qkit-printkit-auth.ts) on purpose. Each inbound
 * route is guarded by its own secret, so a leak of one opens only its own
 * route.
 */
export function paykitCallbackBearerOk(request: Request): boolean {
  const secret = process.env.PAYKIT_CALLBACK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/qkit-paykit-auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/qkit-paykit-auth.ts src/lib/qkit-paykit-auth.test.ts
git commit -m "feat: check the paykit callback secret in constant time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `notifyPrintkit` is safe to run twice

**Files:**

- Modify: `src/app/o/[code]/notify.ts` (the `if (!result.ok)` block in `notifyPrintkit`, near line 142)
- Create: `src/app/o/[code]/notify.test.ts`

**Interfaces:**

- Consumes: `createPrintJob` from `@/lib/printkit/client`, which answers `{ ok: false, status: 409, error }` when printkit already holds a job for the order id.
- Produces: no signature change. `notifyPrintkit(boothId, orderNumber)` run a second time for the same order creates no second job, logs no failure, and still makes the guarded `print_status` write.

- [ ] **Step 1: Write the failing tests**

Create `src/app/o/[code]/notify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyPrintkit } from "./notify";

const {
  boothsMaybeSingle,
  ordersMaybeSingle,
  updateMock,
  updateFilters,
  createPrintJobMock,
} = vi.hoisted(() => {
  const updateFilters: unknown[][] = [];
  const updateMock = vi.fn((..._patch: unknown[]) => {
    const node = {
      eq: (...args: unknown[]) => {
        updateFilters.push(args);
        return node;
      },
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    };
    return node;
  });
  return {
    boothsMaybeSingle: vi.fn(),
    ordersMaybeSingle: vi.fn(),
    updateMock,
    updateFilters,
    createPrintJobMock: vi.fn(),
  };
});

function readChain(maybeSingle: () => unknown) {
  const node = { eq: () => node, maybeSingle };
  return node;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) =>
        table === "booths"
          ? { select: () => readChain(boothsMaybeSingle) }
          : { select: () => readChain(ordersMaybeSingle), update: updateMock },
    }),
}));
vi.mock("@/lib/printkit/client", () => ({
  createPrintJob: createPrintJobMock,
}));
vi.mock("@/lib/daily-order-number", () => ({
  vendorFacingOrderNumber: () => Promise.resolve("007"),
}));
vi.mock("@/lib/merqo/customer-notify", () => ({ notifyVendor: vi.fn() }));

const BOOTH = "00000000-0000-4000-8000-000000000001";
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  updateMock.mockClear();
  updateFilters.length = 0;
  boothsMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1", print_enabled: true } });
  ordersMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { id: "o1", customer_name: "Ann" } });
  createPrintJobMock
    .mockReset()
    .mockResolvedValue({ ok: true, data: { id: "job1" } });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("notifyPrintkit run more than once for one order", () => {
  it("marks the order queued after creating the job", async () => {
    await notifyPrintkit(BOOTH, "0007");
    expect(createPrintJobMock).toHaveBeenCalledWith({
      vendorId: "v1",
      orderId: "o1",
      boothId: BOOTH,
      customerName: "Ann",
      orderNumber: "007",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "queued" }),
    );
    expect(updateFilters).toEqual([
      ["id", "o1"],
      ["print_status", "not_required"],
    ]);
  });

  it("treats printkit's 409 as already queued: no error logged, guarded write still made", async () => {
    createPrintJobMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ print_status: "queued" }),
    );
    expect(updateFilters).toContainEqual(["print_status", "not_required"]);
  });

  it.each([400, 500, null])(
    "logs and writes nothing when printkit fails with %s",
    async (status) => {
      createPrintJobMock.mockResolvedValue({
        ok: false,
        status,
        error: "Could not create print job.",
      });
      await notifyPrintkit(BOOTH, "0007");
      expect(errorSpy).toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it("creates no job for a booth that does not print", async () => {
    boothsMaybeSingle.mockResolvedValue({
      data: { vendor_id: "v1", print_enabled: false },
    });
    await notifyPrintkit(BOOTH, "0007");
    expect(createPrintJobMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run "src/app/o/[code]/notify.test.ts"`
Expected: the "treats printkit's 409 as already queued" test FAILS (an error is logged and no write is made). The others pass.

- [ ] **Step 3: Implement**

In `src/app/o/[code]/notify.ts`, replace

```ts
if (!result.ok) {
  console.error(
    "notifyPrintkit: createPrintJob failed",
    result.status,
    result.error,
  );
  return;
}
```

with

```ts
// printkit keeps one job per order id and answers 409 to a repeat, so a
// second call for the same order prints nothing. That makes this function
// safe to run again for an order (the payment callback and the customer's
// own claim can both reach it). On a 409, fall through to the guarded
// write below: it repairs a first call that died before marking the order
// queued, and changes nothing otherwise.
if (!result.ok && result.status !== 409) {
  console.error(
    "notifyPrintkit: createPrintJob failed",
    result.status,
    result.error,
  );
  return;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run "src/app/o/[code]"`
Expected: PASS, including the existing `actions.place-order.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/o/[code]/notify.ts" "src/app/o/[code]/notify.test.ts"
git commit -m "fix: a repeated print request for one order is not logged as a failure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: `finalizePaidOrder`

**Files:**

- Create: `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.ts`
- Create: `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts`

**Interfaces:**

- Consumes: `createServiceClient()`; `rateLimit(key, limit, windowSeconds): Promise<boolean>` from `@/lib/rate-limit`; `notifyVendorTelegram(boothId, orderNumber)` and `notifyPrintkit(boothId, orderNumber)` from `@/app/o/[code]/notify` (both never throw; `notifyPrintkit` is repeat-safe after Task 5); the `assign_order_number` RPC, which returns the existing number when the order already has one.
- Produces:
  - `type PaidOrderPayment = { status: "claimed" | "confirmed"; confirmedAt?: string | null; proof?: { path: string; hash: string } }`
  - `type FinalizeResult = { ok: true; orderNumber: string } | { ok: false }`
  - `finalizePaidOrder(order: { id: string; boothId: string }, payment: PaidOrderPayment): Promise<FinalizeResult>`
  - `writePaidMirror(supabase, orderId: string, payment: PaidOrderPayment): Promise<void>`. Moves `orders.payment_status` forward only, never back.

Rules `writePaidMirror` implements:

| Recording   | Rows it may change                                                              | Writes                                                       |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `claimed`   | `payment_status = pending` (also `claimed` when a screenshot is being recorded) | `payment_status`, plus the screenshot path and hash if given |
| `confirmed` | any payment-taking order that is not already `confirmed` with a `paid_at`       | `payment_status`, `paid_at`, plus the screenshot if given    |
| either      | none matched, and a screenshot was given: the order is already further along    | the screenshot path and hash only                            |

- [ ] **Step 1: Write the failing tests**

Create `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizePaidOrder, writePaidMirror } from "./finalize-paid-order";

const {
  calls,
  filters,
  rpcMock,
  updateMock,
  selectMock,
  proofOnlyResult,
  rateLimitMock,
  alertMock,
  printMock,
  createServiceClientMock,
} = vi.hoisted(() => {
  const calls: string[] = [];
  const filters: unknown[][] = [];
  const selectMock = vi.fn();
  const proofOnlyResult = {
    value: { error: null as { message: string } | null },
  };
  const updateMock = vi.fn((..._patch: unknown[]) => {
    calls.push("mirror");
    const node = {
      eq: (...args: unknown[]) => {
        filters.push(["eq", ...args]);
        return node;
      },
      neq: (...args: unknown[]) => {
        filters.push(["neq", ...args]);
        return node;
      },
      in: (...args: unknown[]) => {
        filters.push(["in", ...args]);
        return node;
      },
      or: (...args: unknown[]) => {
        filters.push(["or", ...args]);
        return node;
      },
      select: selectMock,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(proofOnlyResult.value).then(resolve),
    };
    return node;
  });
  const rpcMock = vi.fn();
  const client = { rpc: rpcMock, from: () => ({ update: updateMock }) };
  return {
    calls,
    filters,
    rpcMock,
    updateMock,
    selectMock,
    proofOnlyResult,
    rateLimitMock: vi.fn(),
    alertMock: vi.fn(),
    printMock: vi.fn(),
    createServiceClientMock: vi.fn(() => Promise.resolve(client)),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));
vi.mock("@/app/o/[code]/notify", () => ({
  notifyVendorTelegram: alertMock,
  notifyPrintkit: printMock,
}));

const ORDER = { id: "o1", boothId: "b1" };
const PROOF = { path: "v1/o1.webp", hash: "abc123" };
let errorSpy: ReturnType<typeof vi.spyOn>;

// One alert per order: the first ask is allowed, every later one is not.
function alertOncePerOrder() {
  const seen = new Set<string>();
  rateLimitMock.mockImplementation((key: string) => {
    const first = !seen.has(key);
    seen.add(key);
    return Promise.resolve(first);
  });
}

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  proofOnlyResult.value = { error: null };
  updateMock.mockClear();
  selectMock
    .mockReset()
    .mockResolvedValue({ data: [{ id: "o1" }], error: null });
  rpcMock.mockReset().mockImplementation(() => {
    calls.push("assign");
    return Promise.resolve({ data: "0007", error: null });
  });
  rateLimitMock.mockReset();
  alertOncePerOrder();
  alertMock.mockReset().mockImplementation(() => {
    calls.push("alert");
    return Promise.resolve();
  });
  printMock.mockReset().mockImplementation(() => {
    calls.push("print");
    return Promise.resolve();
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  vi.useRealTimers();
});

describe("finalizePaidOrder", () => {
  it("assigns the number, then notifies, then writes the mirror last", async () => {
    const result = await finalizePaidOrder(ORDER, {
      status: "claimed",
      proof: PROOF,
    });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
    expect(calls).toEqual(["assign", "alert", "print", "mirror"]);
    expect(rpcMock).toHaveBeenCalledWith("assign_order_number", {
      p_order_id: "o1",
    });
    expect(alertMock).toHaveBeenCalledWith("b1", "0007");
    expect(printMock).toHaveBeenCalledWith("b1", "0007");
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "claimed",
      payment_proof_path: "v1/o1.webp",
      payment_proof_hash: "abc123",
    });
  });

  it("asks for the alert under a per-order, once-a-day key", async () => {
    await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(rateLimitMock).toHaveBeenCalledWith(
      "paid-order-alert:o1",
      1,
      86_400,
    );
  });

  it("run twice in a row: same number, one vendor alert, the print request repeated", async () => {
    const first = await finalizePaidOrder(ORDER, {
      status: "claimed",
      proof: PROOF,
    });
    const second = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(first).toEqual({ ok: true, orderNumber: "0007" });
    expect(second).toEqual({ ok: true, orderNumber: "0007" });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(printMock).toHaveBeenCalledTimes(2);
  });

  it("run twice at the same moment: one vendor alert", async () => {
    const [a, b] = await Promise.all([
      finalizePaidOrder(ORDER, { status: "claimed", proof: PROOF }),
      finalizePaidOrder(ORDER, { status: "claimed" }),
    ]);
    expect(a).toEqual({ ok: true, orderNumber: "0007" });
    expect(b).toEqual({ ok: true, orderNumber: "0007" });
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(printMock).toHaveBeenCalledTimes(2);
  });

  it("still sends the print request and writes the mirror when the alert was already sent", async () => {
    rateLimitMock.mockReset().mockResolvedValue(false);
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
    expect(alertMock).not.toHaveBeenCalled();
    expect(calls).toEqual(["assign", "print", "mirror"]);
  });

  it.each([
    ["an RPC error", { data: null, error: { message: "boom" } }],
    ["no number", { data: null, error: null }],
  ])("stops on %s: no notification, no mirror write", async (_, answer) => {
    rpcMock.mockReset().mockResolvedValue(answer);
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: false });
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(printMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("still reports success when the mirror write fails", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await finalizePaidOrder(ORDER, { status: "claimed" });
    expect(result).toEqual({ ok: true, orderNumber: "0007" });
  });
});

describe("writePaidMirror", () => {
  async function write(payment: Parameters<typeof writePaidMirror>[2]) {
    const supabase = await createServiceClientMock();
    await writePaidMirror(
      supabase as unknown as Parameters<typeof writePaidMirror>[0],
      "o1",
      payment,
    );
  }

  it("claimed, no screenshot: only a pending order moves", async () => {
    await write({ status: "claimed" });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ payment_status: "claimed" });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["in", "payment_status", ["pending"]],
    ]);
  });

  it("claimed with a screenshot: also lands on an order the callback already marked claimed", async () => {
    await write({ status: "claimed", proof: PROOF });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["in", "payment_status", ["pending", "claimed"]],
    ]);
  });

  it("confirmed: sets paid_at to paykit's confirmed_at and never touches a not_required order", async () => {
    await write({ status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" });
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: "2026-08-11T00:00:05Z",
    });
    expect(filters).toEqual([
      ["eq", "id", "o1"],
      ["neq", "payment_status", "not_required"],
      ["or", "payment_status.neq.confirmed,paid_at.is.null"],
    ]);
  });

  it("confirmed without a confirmed_at: uses the current time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T03:04:05.000Z"));
    await write({ status: "confirmed", confirmedAt: null });
    expect(updateMock).toHaveBeenCalledWith({
      payment_status: "confirmed",
      paid_at: "2026-10-12T03:04:05.000Z",
    });
  });

  it("keeps the screenshot when the order is already further along", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    await write({ status: "claimed", proof: PROOF });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenLastCalledWith({
      payment_proof_path: "v1/o1.webp",
      payment_proof_hash: "abc123",
    });
    expect(filters.at(-1)).toEqual(["eq", "id", "o1"]);
  });

  it("makes no second write when nothing matched and there is no screenshot", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    await write({ status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("makes no second write when the first one failed", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await write({ status: "claimed", proof: PROOF });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs, and does not throw, when the screenshot-only write fails", async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    proofOnlyResult.value = { error: { message: "boom" } };
    await expect(
      write({ status: "claimed", proof: PROOF }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts"`
Expected: FAIL, cannot resolve `./finalize-paid-order`.

- [ ] **Step 3: Implement**

Create `src/app/order/[boothId]/[orderNumber]/finalize-paid-order.ts`:

```ts
// Deliberately NOT a "use server" file, for the reason given at the top of
// src/app/o/[code]/notify.ts: every export of a "use server" file is a
// client-callable Server Action. These are called only from claimPayment
// (./payment-actions.ts) and from the paykit callback route
// (src/app/api/paykit/payment-status/route.ts), each of which has already
// established that paykit holds the payment being recorded.

import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { notifyVendorTelegram, notifyPrintkit } from "@/app/o/[code]/notify";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export type PaidOrderPayment = {
  status: "claimed" | "confirmed";
  confirmedAt?: string | null;
  proof?: { path: string; hash: string };
};

export type FinalizeResult = { ok: true; orderNumber: string } | { ok: false };

// A fixed UTC day. Long enough that the customer's own claim and paykit's
// callback, which arrive within the same second, share one window.
const ALERT_ONCE_WINDOW_SECONDS = 86_400;

function proofPatch(payment: PaidOrderPayment) {
  return payment.proof
    ? {
        payment_proof_path: payment.proof.path,
        payment_proof_hash: payment.proof.hash,
      }
    : {};
}

function writeForward(
  supabase: ServiceClient,
  orderId: string,
  payment: PaidOrderPayment,
) {
  if (payment.status === "confirmed")
    return supabase
      .from("orders")
      .update({
        payment_status: "confirmed",
        paid_at: payment.confirmedAt ?? new Date().toISOString(),
        ...proofPatch(payment),
      })
      .eq("id", orderId)
      .neq("payment_status", "not_required")
      .or("payment_status.neq.confirmed,paid_at.is.null")
      .select("id");
  return supabase
    .from("orders")
    .update({ payment_status: "claimed", ...proofPatch(payment) })
    .eq("id", orderId)
    .in("payment_status", payment.proof ? ["pending", "claimed"] : ["pending"])
    .select("id");
}

/**
 * Moves an order's local payment mirror forward to the status paykit holds.
 * Forward only: `claimed` never overwrites `confirmed`, and nothing here ever
 * returns an order to `pending`. Safe to repeat. Failures are logged, not
 * thrown: paykit already holds the payment, so a missed mirror write must not
 * fail the caller.
 *
 * When a screenshot is given and the order is already further along than the
 * status being recorded (paykit's callback got there first), the screenshot
 * is still written, by itself.
 */
export async function writePaidMirror(
  supabase: ServiceClient,
  orderId: string,
  payment: PaidOrderPayment,
): Promise<void> {
  const { data: rows, error } = await writeForward(supabase, orderId, payment);
  if (error) {
    console.error("writePaidMirror: mirror update failed", error.message);
    return;
  }
  if ((rows ?? []).length > 0 || !payment.proof) return;

  const { error: proofError } = await supabase
    .from("orders")
    .update(proofPatch(payment))
    .eq("id", orderId);
  if (proofError)
    console.error("writePaidMirror: proof update failed", proofError.message);
}

/**
 * Everything an order needs once paykit holds a payment for it: its number,
 * the vendor's alert, the print job, and the local mirror. In that order, and
 * the order matters: the mirror is written last so the customer's pay page
 * never sees "paid" on an order that has no number yet.
 *
 * Safe to run more than once for one order, including at the same moment,
 * which is the normal case: paykit's callback arrives while the customer's
 * own claim is still running.
 *  - The number: qkit.assign_order_number returns the existing one.
 *  - The vendor alert: sent only by the run the limiter allows, once per
 *    order per day. The limiter fails open, so a limiter outage can repeat an
 *    alert and cannot lose one.
 *  - The print job: printkit keeps one per order, so notifyPrintkit is
 *    attempted every time and prints once.
 *  - The mirror: see writePaidMirror.
 *
 * It does not check that the order is still live. Callers do that before
 * they ask paykit for anything.
 */
export async function finalizePaidOrder(
  order: { id: string; boothId: string },
  payment: PaidOrderPayment,
): Promise<FinalizeResult> {
  const supabase = await createServiceClient();

  const { data: orderNumber, error: assignError } = await supabase.rpc(
    "assign_order_number",
    { p_order_id: order.id },
  );
  if (assignError || !orderNumber) {
    console.error(
      "finalizePaidOrder: assign_order_number failed",
      assignError?.message,
    );
    return { ok: false };
  }

  const firstAlert = await rateLimit(
    `paid-order-alert:${order.id}`,
    1,
    ALERT_ONCE_WINDOW_SECONDS,
  );
  await Promise.all([
    firstAlert
      ? notifyVendorTelegram(order.boothId, orderNumber)
      : Promise.resolve(),
    notifyPrintkit(order.boothId, orderNumber),
  ]);

  await writePaidMirror(supabase, order.id, payment);

  return { ok: true, orderNumber };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts"`
Expected: PASS.

Then: `pnpm exec tsc --noEmit`
Expected: no errors. If `tsc` reports that `writeForward`'s two branches return incompatible builder types, give the function the explicit return type `PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>`. Do not cast with `as any`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/finalize-paid-order.ts" "src/app/order/[boothId]/[orderNumber]/finalize-paid-order.test.ts"
git commit -m "feat: finalize a paid order in one repeat-safe function

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `claimPayment` calls `finalizePaidOrder`

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.ts` (the imports; the comment above `claimPayment`; the block from `const { data: orderNumber, error: assignError }` to the end of `claimPayment`)
- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts`

**Interfaces:**

- Consumes: `finalizePaidOrder(order, payment)` from `./finalize-paid-order` (Task 6).
- Produces: no signature change. `claimPayment(boothId, token, photo)` keeps its return type and every error string. One behaviour is added: when paykit answers the claim with `confirmed`, `paid_at` is written too.

The action tests mock `@/lib/supabase/server`, `@/lib/rate-limit` and `@/app/o/[code]/notify`. `finalize-paid-order.ts` imports those same modules, so the real `finalizePaidOrder` runs against the mocks. Do not mock `./finalize-paid-order` in this file.

- [ ] **Step 1: Let the test's update chain answer the new filters**

In `src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts`, in the hoisted `update` mock, replace

```ts
      neq: () => node,
      select: writeSelect,
```

with

```ts
      neq: () => node,
      in: () => node,
      or: () => node,
      select: writeSelect,
```

- [ ] **Step 2: Write the failing tests**

Inside `describe("claimPayment (photo required, deferred numbering)", ...)`, add:

```ts
it("sends no second vendor alert when the paykit callback already finalized the order", async () => {
  rateLimitMock.mockImplementation((key: string) =>
    Promise.resolve(!key.startsWith("paid-order-alert:")),
  );
  const result = await claimPayment(BOOTH, TOKEN, fakeFile());
  expect(result).toEqual({ success: true, orderNumber: "0007" });
  expect(rateLimitMock).toHaveBeenCalledWith("paid-order-alert:o1", 1, 86_400);
  expect(notifyVendorTelegramMock).not.toHaveBeenCalled();
  expect(notifyPrintkitMock).toHaveBeenCalledWith(BOOTH, "0007");
  expect(update).toHaveBeenCalledWith({
    payment_status: "claimed",
    payment_proof_path: "v1/o1.webp",
    payment_proof_hash: expectedHash(PHOTO_BYTES),
  });
});

it("keeps the screenshot when the callback's mirror write landed first", async () => {
  writeSelect.mockResolvedValue({ data: [], error: null });
  const result = await claimPayment(BOOTH, TOKEN, fakeFile());
  expect(result).toEqual({ success: true, orderNumber: "0007" });
  expect(update).toHaveBeenLastCalledWith({
    payment_proof_path: "v1/o1.webp",
    payment_proof_hash: expectedHash(PHOTO_BYTES),
  });
});

it("records paid_at when paykit reports the payment already confirmed", async () => {
  claimCheckoutMock.mockResolvedValue({
    ok: true,
    data: {
      transactionId: "tx1",
      status: "confirmed",
      amountCents: 800,
      orderRef: "o1",
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: "2026-08-11T00:00:05Z",
    },
  });
  const result = await claimPayment(BOOTH, TOKEN, fakeFile());
  expect(result).toEqual({ success: true, orderNumber: "0007" });
  expect(update).toHaveBeenCalledWith({
    payment_status: "confirmed",
    paid_at: "2026-08-11T00:00:05Z",
    payment_proof_path: "v1/o1.webp",
    payment_proof_hash: expectedHash(PHOTO_BYTES),
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts"`
Expected: the three new tests FAIL (the alert is sent; no screenshot-only write; no `paid_at`). Every existing test still passes.

- [ ] **Step 4: Switch the action to `finalizePaidOrder`**

In `src/app/order/[boothId]/[orderNumber]/payment-actions.ts`, replace the import

```ts
import { notifyVendorTelegram, notifyPrintkit } from "@/app/o/[code]/notify";
```

with

```ts
import { finalizePaidOrder } from "./finalize-paid-order";
```

Replace the second paragraph of the comment above `claimPayment` (the one that starts "Order of operations is load-bearing") with:

```ts
// Order of operations is load-bearing: upload the photo + hash it first,
// THEN call paykit's claim, THEN hand the order to finalizePaidOrder, which
// assigns the order number, fires the vendor notifications, and writes the
// local payment_status mirror last. A failed upload never touches
// payment_status or order_number at all (no half-claimed state); a failed
// paykit claim leaves only a harmless orphaned photo in storage; a failed
// mirror write doesn't undo an already-successful paykit claim +
// already-assigned number, so it still reports success.
//
// paykit calls qkit back as soon as its claim commits, so the callback route
// (src/app/api/paykit/payment-status/route.ts) usually runs
// finalizePaidOrder for this same order while this action is still inside
// it. That function is built for it: one number, one vendor alert, one
// label, and the screenshot is kept whichever mirror write lands first.
```

Replace everything from

```ts
  const { data: orderNumber, error: assignError } = await supabase.rpc(
```

through the action's final `return { success: true, orderNumber };` with:

```ts
const finalized = await finalizePaidOrder(
  { id: order.id, boothId },
  {
    status: claim.data.status,
    confirmedAt: claim.data.confirmedAt,
    proof: { path, hash },
  },
);
if (!finalized.ok)
  return { success: false, error: "Could not finalize order. Try again." };

return { success: true, orderNumber: finalized.orderNumber };
```

The `if (claim.data.status === "pending") return ...` line directly above stays, and is what narrows `claim.data.status` to `"claimed" | "confirmed"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]"`
Expected: PASS, every existing `claimPayment` test included. If an existing test fails, read it before touching it: the action's behaviour for that case is meant to be unchanged, so a failure is a defect in Task 6 or in Step 4, not a test to rewrite.

Then: `pnpm exec tsc --noEmit && pnpm exec eslint "src/app/order/[boothId]/[orderNumber]"`
Expected: no errors, and no unused import left in `payment-actions.ts`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/payment-actions.ts" "src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts"
git commit -m "refactor: claimPayment finalizes the order through finalizePaidOrder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `POST /api/paykit/payment-status`

**Files:**

- Create: `src/app/api/paykit/payment-status/route.ts`
- Create: `src/app/api/paykit/payment-status/route.test.ts`

**Interfaces:**

- Consumes: `paykitCallbackBearerOk(request)` (Task 4); `clientIp`, `rateLimit` from `@/lib/rate-limit`; `getCheckoutByOrderRef(orderRef): Promise<PaykitResult<CheckoutLookup>>` from `@/lib/paykit/client`, where `CheckoutLookup` carries `status`, `amountCents`, `vendorId`, `confirmedAt`; `finalizePaidOrder`, `writePaidMirror` (Task 6).
- Produces: the route. Answers:

| Status | Body                                | When                                                                                     |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| 200    | `{ ok: true }`                      | paykit's status was applied, or already held                                             |
| 200    | `{ ok: true, ignored: "<reason>" }` | the order is cancelled, or never took payment. Nothing changed.                          |
| 400    | `{ error }`                         | body is not JSON, or `order_ref` is not a uuid                                           |
| 401    | `{ error: "Unauthorized" }`         | bearer missing or wrong                                                                  |
| 404    | `{ error: "Order not found" }`      | qkit has no such order                                                                   |
| 409    | `{ error }`                         | paykit has no transaction for the order, or its vendor or amount differ from the order's |
| 429    | `{ error: "Too many requests" }`    | more than 120 calls a minute from one address                                            |
| 503    | `{ error: "Upstream unavailable" }` | a database read or write failed, or paykit could not be reached. Nothing changed.        |

What is applied, by the status paykit answers with:

| paykit says              | Order has no number                     | Order has a number                             |
| ------------------------ | --------------------------------------- | ---------------------------------------------- |
| `claimed` or `confirmed` | `finalizePaidOrder`                     | `writePaidMirror` only: no alert, no print job |
| `pending`                | a `claimed` mirror goes back to pending | a `claimed` mirror goes back to pending        |

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/paykit/payment-status/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const {
  bearerOkMock,
  rateLimitMock,
  orderMaybeSingle,
  boothMaybeSingle,
  readEqMock,
  updateMock,
  updateFilters,
  updateResult,
  getCheckoutByOrderRefMock,
  finalizePaidOrderMock,
  writePaidMirrorMock,
} = vi.hoisted(() => {
  const updateFilters: unknown[][] = [];
  const updateResult = {
    value: { error: null as { message: string } | null },
  };
  const updateMock = vi.fn((..._patch: unknown[]) => {
    const node = {
      eq: (...args: unknown[]) => {
        updateFilters.push(["eq", ...args]);
        return node;
      },
      neq: (...args: unknown[]) => {
        updateFilters.push(["neq", ...args]);
        return node;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(updateResult.value).then(resolve),
    };
    return node;
  });
  return {
    bearerOkMock: vi.fn(),
    rateLimitMock: vi.fn(),
    orderMaybeSingle: vi.fn(),
    boothMaybeSingle: vi.fn(),
    readEqMock: vi.fn(),
    updateMock,
    updateFilters,
    updateResult,
    getCheckoutByOrderRefMock: vi.fn(),
    finalizePaidOrderMock: vi.fn(),
    writePaidMirrorMock: vi.fn(),
  };
});

vi.mock("@/lib/qkit-paykit-auth", () => ({
  paykitCallbackBearerOk: bearerOkMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  clientIp: () => "203.0.113.5",
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        const read = (maybeSingle: () => unknown) => ({
          select: () => ({
            eq: (...args: unknown[]) => {
              readEqMock(table, ...args);
              return { maybeSingle };
            },
          }),
        });
        return table === "booths"
          ? read(boothMaybeSingle)
          : { ...read(orderMaybeSingle), update: updateMock };
      },
    }),
}));
vi.mock("@/lib/paykit/client", () => ({
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));
vi.mock("@/app/order/[boothId]/[orderNumber]/finalize-paid-order", () => ({
  finalizePaidOrder: finalizePaidOrderMock,
  writePaidMirror: writePaidMirrorMock,
}));

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TX_ID = "22222222-2222-4222-8222-222222222222";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    booth_id: BOOTH_ID,
    status: "pending",
    order_number: null,
    payment_status: "pending",
    total_cents: 800,
    ...overrides,
  };
}

function paykitHolds(
  status: "pending" | "claimed" | "confirmed",
  overrides: Record<string, unknown> = {},
) {
  getCheckoutByOrderRefMock.mockResolvedValue({
    ok: true,
    data: {
      transactionId: TX_ID,
      status,
      amountCents: 800,
      orderRef: ORDER_ID,
      claimedAt: status === "pending" ? null : "2026-08-11T00:00:00Z",
      confirmedAt: status === "confirmed" ? "2026-08-11T00:00:05Z" : null,
      vendorId: "v1",
      ...overrides,
    },
  });
}

function post(body: unknown, raw = false) {
  return POST(
    new Request("https://qkit.test/api/paykit/payment-status", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

function callback(status: string = "claimed") {
  return post({ order_ref: ORDER_ID, transaction_id: TX_ID, status });
}

function expectNothingApplied() {
  expect(finalizePaidOrderMock).not.toHaveBeenCalled();
  expect(writePaidMirrorMock).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  bearerOkMock.mockReset().mockReturnValue(true);
  rateLimitMock.mockReset().mockResolvedValue(true);
  orderMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: order(), error: null });
  boothMaybeSingle
    .mockReset()
    .mockResolvedValue({ data: { vendor_id: "v1" }, error: null });
  readEqMock.mockReset();
  updateMock.mockClear();
  updateFilters.length = 0;
  updateResult.value = { error: null };
  getCheckoutByOrderRefMock.mockReset();
  paykitHolds("claimed");
  finalizePaidOrderMock
    .mockReset()
    .mockResolvedValue({ ok: true, orderNumber: "0007" });
  writePaidMirrorMock.mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/paykit/payment-status: the gate", () => {
  it("401s without the callback secret, before reading anything", async () => {
    bearerOkMock.mockReturnValue(false);
    const res = await callback();
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("429s when the limiter refuses, before reading the order or calling paykit", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await callback();
    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(
      "paykit-payment-status:203.0.113.5",
      120,
      60,
    );
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("400s for a body that is not JSON", async () => {
    const res = await post("{not json", true);
    expect(res.status).toBe(400);
    expect(orderMaybeSingle).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["not a uuid", { order_ref: "A-001" }],
    ["a number", { order_ref: 7 }],
    ["filter punctuation", { order_ref: `${ORDER_ID}),status.eq.pending` }],
  ])("400s when order_ref is %s", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(orderMaybeSingle).not.toHaveBeenCalled();
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("accepts a body that carries only order_ref", async () => {
    const res = await post({ order_ref: ORDER_ID });
    expect(res.status).toBe(200);
  });

  it("404s for an order qkit does not have, without calling paykit", async () => {
    orderMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await callback();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found" });
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("503s when the order read fails, without leaking the database error", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await callback();
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toMatch(/connection reset/);
    expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
  });

  it("503s when the booth read fails", async () => {
    boothMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await callback();
    expect(res.status).toBe(503);
    expectNothingApplied();
  });

  it("404s when the order's booth has no vendor", async () => {
    boothMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await callback();
    expect(res.status).toBe(404);
    expectNothingApplied();
  });
});

describe("POST /api/paykit/payment-status: reading the status back", () => {
  it("looks the order up by its own id and reads the booth of that order", async () => {
    await callback();
    expect(readEqMock).toHaveBeenCalledWith("orders", "id", ORDER_ID);
    expect(readEqMock).toHaveBeenCalledWith("booths", "id", BOOTH_ID);
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ORDER_ID);
  });

  it.each([
    ["times out", null],
    ["answers 503", 503],
    ["answers 401", 401],
    ["answers 429", 429],
  ])("changes nothing and 503s when paykit %s", async (_, status) => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status,
      error: "Upstream unavailable",
    });
    const res = await callback("confirmed");
    expect(res.status).toBe(503);
    expectNothingApplied();
  });

  it("changes nothing and 409s when paykit has no transaction for the order", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
    });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
  });

  it("changes nothing and 409s when the transaction belongs to another vendor", async () => {
    paykitHolds("confirmed", { vendorId: "someone-else" });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("changes nothing and 409s when the transaction's amount differs from the order's total", async () => {
    paykitHolds("confirmed", { amountCents: 900 });
    const res = await callback("confirmed");
    expect(res.status).toBe(409);
    expectNothingApplied();
  });

  it("applies what paykit holds, not what the body says: a forged 'confirmed' on a pending payment confirms nothing", async () => {
    paykitHolds("pending");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(finalizePaidOrderMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("applies what paykit holds, not what the body says: a stale 'pending' does not undo a confirmed payment", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({
        order_number: "0007",
        status: "preparing",
        payment_status: "confirmed",
      }),
      error: null,
    });
    paykitHolds("confirmed");
    const res = await callback("pending");
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).toHaveBeenCalledWith(
      expect.anything(),
      ORDER_ID,
      { status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" },
    );
  });
});

describe("POST /api/paykit/payment-status: applying the status", () => {
  it("finalizes an unnumbered order paykit holds as claimed", async () => {
    const res = await callback("claimed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(finalizePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(finalizePaidOrderMock).toHaveBeenCalledWith(
      { id: ORDER_ID, boothId: BOOTH_ID },
      { status: "claimed", confirmedAt: null },
    );
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("finalizes an unnumbered order paykit holds as confirmed, with paykit's confirmed_at", async () => {
    paykitHolds("confirmed");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(finalizePaidOrderMock).toHaveBeenCalledWith(
      { id: ORDER_ID, boothId: BOOTH_ID },
      { status: "confirmed", confirmedAt: "2026-08-11T00:00:05Z" },
    );
  });

  it("503s when the order cannot be finalized", async () => {
    finalizePaidOrderMock.mockResolvedValue({ ok: false });
    const res = await callback("claimed");
    expect(res.status).toBe(503);
  });

  it.each(["claimed", "confirmed"] as const)(
    "only moves the mirror for an order that already has a number (%s): no second alert, no print job",
    async (status) => {
      orderMaybeSingle.mockResolvedValue({
        data: order({ order_number: "0007", status: "preparing" }),
        error: null,
      });
      paykitHolds(status);
      const res = await callback(status);
      expect(res.status).toBe(200);
      expect(finalizePaidOrderMock).not.toHaveBeenCalled();
      expect(writePaidMirrorMock).toHaveBeenCalledTimes(1);
      expect(writePaidMirrorMock).toHaveBeenCalledWith(
        expect.anything(),
        ORDER_ID,
        {
          status,
          confirmedAt: status === "confirmed" ? "2026-08-11T00:00:05Z" : null,
        },
      );
    },
  );

  it("returns a claimed mirror to pending when paykit holds pending", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "claimed" }),
      error: null,
    });
    paykitHolds("pending");
    const res = await callback("pending");
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ payment_status: "pending" });
    expect(updateFilters).toEqual([
      ["eq", "id", ORDER_ID],
      ["eq", "payment_status", "claimed"],
      ["neq", "status", "cancelled"],
    ]);
    expect(finalizePaidOrderMock).not.toHaveBeenCalled();
    expect(writePaidMirrorMock).not.toHaveBeenCalled();
  });

  it("503s when the return to pending fails to write", async () => {
    paykitHolds("pending");
    updateResult.value = { error: { message: "boom" } };
    const res = await callback("pending");
    expect(res.status).toBe(503);
  });

  it("a repeated callback is answered the same way and finalizes nothing twice once the order has its number", async () => {
    const first = await callback("claimed");
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "claimed" }),
      error: null,
    });
    const second = await callback("claimed");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(finalizePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(writePaidMirrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/paykit/payment-status: orders it must leave alone", () => {
  it.each(["pending", "claimed", "confirmed"] as const)(
    "never changes a cancelled order (paykit holds %s), and logs it",
    async (status) => {
      orderMaybeSingle.mockResolvedValue({
        data: order({ status: "cancelled" }),
        error: null,
      });
      paykitHolds(status);
      const res = await callback(status);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: "cancelled" });
      expectNothingApplied();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancelled"),
        ORDER_ID,
        status,
      );
    },
  );

  it("never changes an order that does not take payment", async () => {
    orderMaybeSingle.mockResolvedValue({
      data: order({ order_number: "0007", payment_status: "not_required" }),
      error: null,
    });
    paykitHolds("confirmed");
    const res = await callback("confirmed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "not_required" });
    expectNothingApplied();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/api/paykit/payment-status/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `src/app/api/paykit/payment-status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { paykitCallbackBearerOk } from "@/lib/qkit-paykit-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCheckoutByOrderRef,
  type CheckoutLookup,
} from "@/lib/paykit/client";
import {
  finalizePaidOrder,
  writePaidMirror,
} from "@/app/order/[boothId]/[orderNumber]/finalize-paid-order";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

// Only order_ref is read. paykit also sends transaction_id and status, and
// both are ignored on purpose: the status applied below is the one paykit
// answers with when asked, so a forged, replayed or out-of-order body can
// never set a status paykit does not hold. The uuid check also keeps the
// value safe to use as a filter.
const bodySchema = z.object({ order_ref: z.string().uuid() });

type CallbackOrder = {
  id: string;
  booth_id: string;
  status: string;
  order_number: string | null;
  payment_status: string;
  total_cents: number;
};

function unavailable() {
  return NextResponse.json({ error: "Upstream unavailable" }, { status: 503 });
}

function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

/**
 * Applies the status paykit holds to one live, payment-taking order.
 *  - claimed or confirmed, no number yet: finalizePaidOrder (number, alert,
 *    print job, mirror).
 *  - claimed or confirmed, already numbered: the mirror only. Finalizing
 *    again would alert and could print for an order that was announced long
 *    ago.
 *  - pending: a claimed mirror goes back to pending, the same write the
 *    customer's own undo makes.
 */
async function applyPaykitStatus(
  supabase: ServiceClient,
  order: CallbackOrder,
  held: CheckoutLookup,
) {
  if (held.status === "pending") {
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "pending" })
      .eq("id", order.id)
      .eq("payment_status", "claimed")
      .neq("status", "cancelled");
    if (error) {
      console.error(
        "paykit payment-status callback: revert failed",
        error.message,
      );
      return unavailable();
    }
    return NextResponse.json({ ok: true });
  }

  const payment = { status: held.status, confirmedAt: held.confirmedAt };
  if (order.order_number) {
    await writePaidMirror(supabase, order.id, payment);
    return NextResponse.json({ ok: true });
  }

  const finalized = await finalizePaidOrder(
    { id: order.id, boothId: order.booth_id },
    payment,
  );
  return finalized.ok ? NextResponse.json({ ok: true }) : unavailable();
}

/**
 * paykit calls this after a payment's status changes. The body is a hint
 * that something changed for one order; what changed is read back from
 * paykit. Nothing is applied unless paykit can be reached and the
 * transaction it holds matches this order's vendor and total.
 */
export async function POST(request: Request) {
  if (!paykitCallbackBearerOk(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The secret is the real gate. This blunts a leaked one: every accepted
  // call costs a request to paykit.
  const allowed = await rateLimit(
    `paykit-payment-status:${clientIp(request.headers)}`,
    120,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid order_ref" }, { status: 400 });

  const supabase = await createServiceClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, booth_id, status, order_number, payment_status, total_cents")
    .eq("id", parsed.data.order_ref)
    .maybeSingle();
  if (orderError) {
    console.error(
      "paykit payment-status callback: order read failed",
      orderError.message,
    );
    return unavailable();
  }
  if (!order)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // No vendor is signed in here, so the vendor of record is the owner of the
  // order's own booth.
  const { data: booth, error: boothError } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", order.booth_id)
    .maybeSingle();
  if (boothError) {
    console.error(
      "paykit payment-status callback: booth read failed",
      boothError.message,
    );
    return unavailable();
  }
  if (!booth?.vendor_id)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // A plain lookup, never transactionIdForOrder: that helper creates a
  // checkout when paykit has none, and a callback must not create anything.
  const held = await getCheckoutByOrderRef(order.id);
  if (!held.ok) {
    console.error(
      "paykit payment-status callback: lookup failed",
      held.status,
      held.error,
    );
    return held.status === 404
      ? conflict("paykit holds no payment for this order")
      : unavailable();
  }
  if (
    held.data.vendorId !== booth.vendor_id ||
    held.data.amountCents !== order.total_cents
  ) {
    console.error(
      "paykit payment-status callback: transaction does not match the order",
      order.id,
    );
    return conflict("Payment does not match this order");
  }

  if (order.status === "cancelled") {
    console.error(
      "paykit payment-status callback: cancelled order left unchanged",
      order.id,
      held.data.status,
    );
    return NextResponse.json({ ok: true, ignored: "cancelled" });
  }
  if (order.payment_status === "not_required") {
    console.error(
      "paykit payment-status callback: order does not take payment",
      order.id,
      held.data.status,
    );
    return NextResponse.json({ ok: true, ignored: "not_required" });
  }

  return applyPaykitStatus(supabase, order, held.data);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/api/paykit`
Expected: PASS.

Then: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/api/paykit`
Expected: no errors. If `tsc` reports that `payment`'s `status` is `"pending" | "claimed" | "confirmed"`, the early return for `pending` is not narrowing `held.status`; read it into a local (`const status = held.status`) before the `if` and build `payment` from that local. Do not cast.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/paykit
git commit -m "feat: apply a payment change paykit reports, after reading it back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: e2e mock, docs, gate, PR, owner steps

**Files:**

- Modify: `e2e/paykit-mock.ts`, `playwright.config.ts`, `e2e/README.md`
- Create: `src/app/api/paykit/README.md`, `src/app/api/paykit/payment-status/README.md`
- Modify: `src/app/api/README.md`, `src/lib/README.md`, `src/app/order/[boothId]/[orderNumber]/README.md`, `src/app/o/[code]/README.md`, `README.md`, `docs/DEPLOY.md`, `docs/OPS-RUNBOOK.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: the route from Task 8.
- Produces: the qkit PR, and the owner's list of what to set and where.

- [ ] **Step 1: The mock fires the callback the way paykit does**

In `e2e/paykit-mock.ts`, add below the `PAYKIT_MOCK_SECRET` export:

```ts
// Real paykit calls qkit back after a claim or confirm commits (see
// src/app/api/paykit/payment-status/route.ts). The mock does the same, so
// e2e runs the customer's own claim and the callback against one order at
// the same moment, as production does.
export const PAYKIT_MOCK_CALLBACK_SECRET = "e2e-mock-callback-secret";
const QKIT_CALLBACK_URL = "http://localhost:3000/api/paykit/payment-status";

function fireCallback(tx: MockTransaction) {
  void fetch(QKIT_CALLBACK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYKIT_MOCK_CALLBACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_ref: tx.orderRef,
      transaction_id: tx.id,
      status: tx.status,
    }),
  }).catch(() => undefined);
}
```

`MockTransaction` is declared further down the file; move the `interface MockTransaction` block (and the `type MockStatus` line above it) to sit above `fireCallback`.

In `handleClaim`, replace

```ts
if (tx.status === "pending") {
  tx.status = "claimed";
  tx.claimedAt = new Date().toISOString();
}
send(200, statusBody(tx));
```

with

```ts
const changed = tx.status === "pending";
if (changed) {
  tx.status = "claimed";
  tx.claimedAt = new Date().toISOString();
}
send(200, statusBody(tx));
if (changed) fireCallback(tx);
```

In `handleConfirm`, replace

```ts
if (tx.status !== "confirmed") {
  tx.status = "confirmed";
  tx.confirmedAt = new Date().toISOString();
}
send(200, statusBody(tx));
```

with

```ts
const changed = tx.status !== "confirmed";
if (changed) {
  tx.status = "confirmed";
  tx.confirmedAt = new Date().toISOString();
}
send(200, statusBody(tx));
if (changed) fireCallback(tx);
```

In `playwright.config.ts`, add `PAYKIT_MOCK_CALLBACK_SECRET` to the import from `./e2e/paykit-mock`, and add one line to `webServer.env`:

```ts
    env: {
      NEXT_PUBLIC_PAYKIT_URL: PAYKIT_MOCK_URL,
      PAYKIT_KIT_SECRET: PAYKIT_MOCK_SECRET,
      PAYKIT_CALLBACK_SECRET: PAYKIT_MOCK_CALLBACK_SECRET,
    },
```

Run: `pnpm exec tsc --noEmit && pnpm exec eslint e2e playwright.config.ts`
Expected: no errors.

This step cannot be run here: e2e needs a local Supabase. CI's e2e job is the check. If `customer-order.spec.ts` fails in CI after this change, the callback and the claim are colliding in a way the unit tests did not model: treat it as a real defect, read the job's trace, and fix the cause. Do not remove the mock's callback to make it pass.

- [ ] **Step 2: Write the two new READMEs**

Create `src/app/api/paykit/README.md`:

```markdown
# paykit

## Purpose

Endpoint the sibling paykit product calls into: the inbound half of the
qkit↔paykit payment integration. The outbound half, qkit asking paykit for a
checkout or a status, is `@/lib/paykit/client.ts`, not a route.
Machine-to-machine (no user session).

## Contents

- `payment-status/` — `POST` endpoint paykit calls after a payment's status
  changes; see its own README.

## Connectivity

Guarded by `paykitCallbackBearerOk(request)` from `@/lib/qkit-paykit-auth`: a
plain shared-secret bearer check against `PAYKIT_CALLBACK_SECRET`, with no
`kit_slug:` prefix, since paykit is the only caller. It is a different secret
from `PAYKIT_KIT_SECRET`, which authenticates qkit's own calls to paykit.

## Parent

[api](../README.md)
```

Create `src/app/api/paykit/payment-status/README.md`:

```markdown
# payment-status

## Purpose

Inbound callback paykit fires after a claim, unclaim or confirm commits, so an
order learns about a payment change that qkit did not cause itself. It is the
seam the later separation phases rely on: a customer who pays on a page hosted
by paykit, and a payment paykit confirms by itself.

## Contents

- `route.ts` — `POST(request)`. Guarded by `paykitCallbackBearerOk()`
  (constant-time check of `PAYKIT_CALLBACK_SECRET`) and a rate limit of 120 a
  minute per address. Reads **only** `order_ref` (a qkit order id) from the
  body; `transaction_id` and `status` are sent and ignored. It then asks paykit
  for the order's transaction (`getCheckoutByOrderRef`), refuses one whose
  vendor differs from the order's booth's vendor or whose amount differs from
  the order's total, and applies the status paykit answered with:
  - `claimed` or `confirmed` on an order with no number: `finalizePaidOrder`
    (number, vendor alert, print job, mirror).
  - `claimed` or `confirmed` on a numbered order: `writePaidMirror` only.
    `confirmed` sets `paid_at`.
  - `pending`: a `claimed` mirror goes back to `pending`.
  - A cancelled order, and an order that never took payment, are left alone
    and logged.
- `route.test.ts` — the gate (401, 429, 400, 404, 503), the read-back
  (paykit unreachable, no transaction, vendor mismatch, amount mismatch, a
  forged or stale body), each rule above, and a repeated callback.

## Connectivity

One caller: paykit's `src/lib/kit-callback.ts`, which posts to the
`callback_url` stored on qkit's `paykit.kit_api_keys` row.

Answers: 200 `{ok:true}`; 200 `{ok:true, ignored}` for an order left alone;
400; 401; 404 unknown order; 409 when paykit's transaction is missing or does
not match the order; 429; 503 when the database or paykit could not be
reached. On 409 and 503 nothing is changed.

Because the status is read back, a replayed, reordered or forged body cannot
set a status paykit does not hold, and no timestamp is needed to order events.
paykit does not retry: a callback lost to a 503 is repaired by the next
callback, by the action that caused the change, or by the vendor's confirm
button.

This route never creates a checkout. It calls `getCheckoutByOrderRef`
directly, not `transactionIdForOrder`, which would create one.

## Parent

[paykit](../README.md)
```

- [ ] **Step 3: Update the existing docs**

`src/app/api/README.md`: add to Contents, after the `printkit/` entry:

```markdown
- `paykit/` — bearer-token-authenticated endpoint the sibling paykit product calls into: payment-status callbacks. See its own README.
```

and append to the Connectivity paragraph:

```markdown
`paykit/` is the same shape again, behind its own `PAYKIT_CALLBACK_SECRET` via `@/lib/qkit-paykit-auth`.
```

`src/lib/README.md`: add after the `qkit-printkit-auth.test.ts` entry:

```markdown
- `qkit-paykit-auth.ts` — `paykitCallbackBearerOk`: constant-time bearer
  check against `PAYKIT_CALLBACK_SECRET` for `POST
/api/paykit/payment-status`. A plain shared secret with no `kit_slug:`
  prefix. Separate from `qkit-printkit-auth.ts` on purpose: each inbound
  route has its own secret.
- `qkit-paykit-auth.test.ts` — tests the unset, empty, missing-header,
  wrong-scheme, mismatched, different-length and matching cases, and that the
  printkit callback secret is not accepted.
```

`src/app/order/[boothId]/[orderNumber]/README.md`: in the `payment-actions.ts` entry, replace the text from "**then**\n assigns the number via `qkit.assign_order_number`" through "last —" with:

```markdown
**then** hands the order to `finalizePaidOrder` (`./finalize-paid-order.ts`),
which assigns the number, fires the notifications and writes the mirror
last —
```

and add two entries after the `payment-actions.test.ts` entry:

```markdown
- `finalize-paid-order.ts` — **not** a `"use server"` file (same reason as
  `src/app/o/[code]/notify.ts`). `finalizePaidOrder(order, payment)` is the
  order half of a payment: assign the number (`qkit.assign_order_number`,
  which returns an existing one), alert the vendor, send the print job, write
  the `orders.payment_status` mirror last. Called by `claimPayment` here and
  by the paykit callback route (`src/app/api/paykit/payment-status/route.ts`),
  usually for the same order at the same moment, so it is built to run twice:
  the vendor alert is sent only by the run the limiter allows
  (`paid-order-alert:<orderId>`, once a day), and the print job relies on
  printkit keeping one job per order. `writePaidMirror(supabase, orderId,
payment)` moves the mirror forward only (`claimed` never overwrites
  `confirmed`), sets `paid_at` on `confirmed`, and still records a screenshot
  when the order is already further along.
- `finalize-paid-order.test.ts` — the order of the steps, running twice in a
  row and at the same moment (one alert), a failed number assignment, each
  mirror rule, and the screenshot-only fallback.
```

`src/app/o/[code]/README.md`: in the `notify.ts` entry, replace "these two are only ever meant to\n be called from `placeOrder` here and `claimPayment`\n (`order/[boothId]/[orderNumber]/payment-actions.ts`)" with:

```markdown
these two are only ever meant to
be called from `placeOrder` here and `finalizePaidOrder`
(`order/[boothId]/[orderNumber]/finalize-paid-order.ts`)
```

and add after that entry:

```markdown
- `notify.test.ts` — `notifyPrintkit` run again for one order: printkit's 409
  ("a job already exists") is not logged as a failure and the guarded
  `print_status` write is still made; any other failure logs and writes
  nothing.
```

`e2e/README.md`: append to the "Payment mock" paragraph:

```markdown
The mock also posts paykit's payment-status callback to qkit's own `POST /api/paykit/payment-status` after a claim or a confirm changes a transaction, authenticated with `PAYKIT_CALLBACK_SECRET` from the same `webServer.env`, so the customer's claim and the callback hit one order together as they do in production.
```

Root `README.md`: in the environment table, change the paykit row's first cell to:

```markdown
| `NEXT_PUBLIC_PAYKIT_URL`, `PAYKIT_KIT_SECRET`, `PAYKIT_CALLBACK_SECRET` | Vendor payment configuration and checkout |
```

keeping the table's column padding as prettier leaves it.

`docs/DEPLOY.md`: add after the **printkit integration** bullet:

```markdown
- **paykit callback**: `PAYKIT_CALLBACK_SECRET` (inbound,
  `src/app/api/paykit/payment-status/route.ts`) is the secret paykit presents
  when it reports a payment change. It must equal `callback_secret` on qkit's
  row in `paykit.kit_api_keys`, whose `callback_url` is this deployment's
  `/api/paykit/payment-status`. Production only: paykit holds one callback
  address per kit. Unset, the route answers 401 to everything and paykit's
  reports are dropped; ordering and paying still work, because qkit's own
  actions write the same status.
```

`docs/OPS-RUNBOOK.md`: add a row to the env-var symptom table, after the "PayNow / checkout doesn't show" row:

```markdown
| A payment changed in paykit but the order did not follow | `PAYKIT_CALLBACK_SECRET`, and `callback_url` / `callback_secret` on qkit's `paykit.kit_api_keys` row |
```

`CHANGELOG.md`, under `## [Unreleased]`: add a `### Added` section if there is none, and put this as its **first** entry (open PR #219 also edits this file; a distinct position keeps the hunks apart):

```markdown
- qkit now hears from paykit when a payment changes. paykit calls
  `POST /api/paykit/payment-status`; qkit reads the payment's real status back
  from paykit and gives the order its number, alerts the vendor, sends the
  print job and updates the payment status, the same as when the customer
  taps "I've paid". Needs `PAYKIT_CALLBACK_SECRET` and the matching row in
  paykit; until both are set nothing changes.
```

and under `### Fixed`, as its **last** entry:

```markdown
- An order confirmed with "confirm and start" now records when it was paid.
  The paid time was left empty for those orders.
- A print request repeated for the same order is no longer logged as a
  failure. printkit already printed such an order only once.
```

- [ ] **Step 4: Run the full gate**

Check that no other suite is running on this machine, then run: `pnpm check && pnpm test`
Expected: both exit 0. Keep the whole output in a scratchpad log.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add e2e playwright.config.ts src/app/api/README.md src/app/api/paykit src/lib/README.md "src/app/order/[boothId]/[orderNumber]/README.md" "src/app/o/[code]/README.md" README.md docs/DEPLOY.md docs/OPS-RUNBOOK.md CHANGELOG.md
git commit -m "docs: the paykit payment-status callback, and the e2e mock that fires it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/agitated-yalow-8b552d
```

The push runs the suite again (13 to 16 minutes): run it in the background with a 600000 ms timeout and keep the log. Then write the PR body to a scratchpad file and open the PR with `gh pr create --repo merqo-io/Qkit --base main --title "feat: apply payment changes paykit reports" --body-file <file>`. The body:

```markdown
## What

- `POST /api/paykit/payment-status`: paykit's callback. Guarded by a new `PAYKIT_CALLBACK_SECRET` (constant-time compare) and a rate limit.
- The route trusts only `order_ref`. It reads the real status from paykit, checks the transaction's vendor and amount against the order, and applies it.
- `finalizePaidOrder`: the order half of `claimPayment` as one function the action and the route both call. Safe to run twice at the same moment: one number, one vendor alert, one label.
- `notifyPrintkit` no longer logs printkit's "job already exists" as a failure.

## Why

Phase P2 of `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`. Until now qkit only learned about a payment change it caused itself. Plan: `docs/superpowers/plans/2026-10-12-paykit-status-callback.md`.

## Safe to merge before the callback is switched on

No migration. Until `PAYKIT_CALLBACK_SECRET` is set and paykit's row points here, the route answers 401 and nothing else changes.

## Owner steps

Listed in the PR conversation: one Vercel variable, one row in paykit, one line in `.env.example`.

## Verified

- `pnpm check && pnpm test` pass locally.
- Route tests: auth, rate limit, bad body, unknown order, paykit unreachable, no transaction, vendor mismatch, amount mismatch, forged and stale bodies, cancelled order, each status rule, a repeated callback.
- `finalizePaidOrder` tests: step order, twice in a row, twice at once, failed number assignment, every mirror rule.

## Not verified

- `pnpm test:e2e` was not run: this machine has no local Supabase. The paykit mock now fires the callback, so CI's e2e job is the first run of the claim and the callback together against a real database.
- Nothing was exercised against a live deployment. The live check is in the plan and waits for the owner's go-ahead.
- That exactly one vendor alert is sent in production rests on the limiter's SQL being atomic, which was read, not run.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Do not merge it. Bind the PR with the app's PR tools and report the URL to the owner.

- [ ] **Step 6: Tell the owner exactly what to set and where**

In chat, in this order:

1. **Generate a secret** on their own machine and do not paste it into chat: `openssl rand -hex 32`.
2. **Vercel → qkit project → Settings → Environment Variables:** add `PAYKIT_CALLBACK_SECRET` with that value, scope **Production** only, then redeploy production. Preview does not need it: paykit holds one callback address per kit.
3. **Supabase SQL editor**, after the qkit PR is deployed to production:

   ```sql
   update paykit.kit_api_keys
   set callback_url = 'https://<qkit production host>/api/paykit/payment-status',
       callback_secret = '<the same value as PAYKIT_CALLBACK_SECRET>'
   where kit_slug = 'qkit';
   ```

   The production host is the one already in `select callback_url from printkit.kit_api_keys where kit_slug = 'qkit';`.

4. **`.env.example`**, which the agent does not edit: add

   ```
   # Inbound: the secret paykit presents to POST /api/paykit/payment-status.
   # Must equal callback_secret on qkit's row in paykit.kit_api_keys.
   PAYKIT_CALLBACK_SECRET=
   ```

5. **Suggested `AGENTS.md` lines** for qkit (protected, the owner applies):
   - File Layout: `src/app/api/paykit/payment-status/ — inbound paykit callback: reads the payment's status back from paykit and applies it`
   - Data model, payments bullet, appended: `paykit reports payment changes to POST /api/paykit/payment-status (PAYKIT_CALLBACK_SECRET). The route trusts only order_ref and reads the status back. finalizePaidOrder (order/[boothId]/[orderNumber]/finalize-paid-order.ts) is the one place a paid order gets its number, alert, print job and mirror.`

To switch the callback off again: `update paykit.kit_api_keys set callback_url = null where kit_slug = 'qkit';`.

- [ ] **Step 7: Live check, only on the owner's go-ahead**

Ask first. Use the production booth **TEST · PayNow** only. Never TEST · Printing. The agent types no payment identifier.

The spec says "manual on a preview". That cannot show the callback: paykit holds one callback address per kit, and it is production's. A preview deployment would pass the same check through the action alone and prove nothing about this phase, so the check below runs against production.

1. Place a QR order on TEST · PayNow, attach any screenshot, tap "I've paid". Expected: the order gets one number and appears once on the board.
2. In Vercel's logs for qkit production, find `POST /api/paykit/payment-status` at that moment. Expected: 200. This is the evidence that paykit called and the secret matched.
3. On the board, use the one-tap confirm and start on that order. Then the owner runs:

   ```sql
   select order_number, payment_status, paid_at
   from qkit.orders
   where booth_id = '<TEST · PayNow booth id>'
   order by created_at desc
   limit 1;
   ```

   Expected: `payment_status = confirmed` and `paid_at` is not null. That action does not write `paid_at`; only the callback does, so a non-null value shows the callback applied a status it read back.

4. In Vercel's logs for paykit, search `notifyKitPaymentStatus`. Expected: no lines. A line names the failure.

If step 2 shows 401, the two secrets differ. If there is no request at all, the row's `callback_url` is unset, not https, or points somewhere else.

Report what was seen and what was not. A step the owner did not run is reported as not run.
