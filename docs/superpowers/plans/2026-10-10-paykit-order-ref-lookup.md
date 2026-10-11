# Paykit Order-Ref Lookup (Separation P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** qkit finds an order's paykit transaction by looking it up, instead of calling create-checkout again, so confirming, claiming and undoing a payment keep working after a vendor edits their payment details.

**Architecture:** paykit gains a read-only `GET /api/v1/checkout?order_ref=` scoped to the calling kit. qkit gains one helper, `transactionIdForOrder`, that looks up first and falls back to create-checkout only when paykit has no transaction (404) or no such route (405). Four qkit actions switch to the helper. paykit also adopts qkit's stricter UEN rule so the two kits agree.

**Tech Stack:** Next.js 16 route handlers and server actions, TypeScript strict, Zod, Supabase service-role client (paykit side), Vitest, Playwright (qkit e2e with a paykit mock).

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, section "P1. Look up a transaction, do not re-create it" and "Problems found" items 1 and 2.

## Global Constraints

- Two repos, two PRs. paykit first (Tasks 1 to 4), merged and deployed to production; then qkit (Tasks 5 to 9). The qkit PR does not merge before the paykit route is live.
- Before starting work in a repo, run `gh pr list --repo merqo-io/<repo> --state open`. If another agent's PR touches the same files, stop and tell the owner. Never edit, rebase or merge a PR that is not from this plan.
- Feature branch per repo, never `main`. No `--no-verify`, no hook bypass.
- No migration in either repo.
- Never read or write `.env*` or `secrets/**`.
- `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/*` are protected. This plan does not edit them. Task 4 hands the owner one suggested `AGENTS.md` line for paykit.
- TypeScript strict: no `any`, no `@ts-ignore`. Zod at every boundary.
- The service-role client is used only in route handlers and server actions.
- paykit CI gates: changed-line coverage at least 80%, `CHANGELOG.md` touched when `src/` changes, the README of every changed folder touched, and no change-narration comments (do not start a comment with "was", "added", "now", a date or a ticket reference).
- qkit lint gates: no inline (trailing) comments, no commented-out code, no em dash in user-facing copy.
- Commit messages follow Conventional Commits and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `pnpm check && pnpm test` must pass in a repo before its PR is opened. qkit also runs `pnpm test:e2e` if local Supabase is available; if it is not, say so in the PR instead of claiming it passed.
- Do not place a QR order on the production booth "TEST · Printing".

## Review Focus

1. **Vendor changed payment details while orders were unpaid or claimed.** Expected: the vendor can still confirm, and a customer who paid can still record it and undo it. Pinned in Task 7 (confirm, both actions) and Task 8 (claim, undo).
2. **paykit holds a transaction for this order with a different amount.** Expected: qkit refuses to confirm or claim it, the same protection create-checkout's replay check gave. Pinned in Task 6.
3. **paykit is rolled back, or qkit deploys first, and the lookup route is missing (405).** Expected: qkit behaves exactly as before this change. Pinned in Task 6.
4. **A second kit uses the same `order_ref` string.** Expected: a kit only ever sees its own transaction. Pinned in Task 2 (the query filters on the bearer's kit slug).
5. **`order_ref` missing, empty, or longer than 200 characters.** Expected: 400 with no database read. Pinned in Task 2.

Known and deliberately not changed here: an order placed before a config change, and still unpaid, cannot load its pay page (create-checkout answers 409) until it expires after 30 minutes. Showing the stored snapshot instead would send money to details the vendor just replaced. Recorded for the P5 hosted pay page.

## File Structure

paykit (`C:\Users\Clarence\Desktop\Coding\Merqo Business\paykit`):

| File                                                                                                       | Responsibility                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/api-schemas.ts` (modify)                                                                          | Wire contract: lookup query schema and lookup response schema       |
| `src/lib/checkout-lookup.ts` (create)                                                                      | Pure mapping from a `transactions` row to the lookup response       |
| `src/lib/checkout-lookup.test.ts` (create)                                                                 | Unit tests for that mapping                                         |
| `src/lib/checkout.ts` (modify)                                                                             | Use the shared fallback link label constant                         |
| `src/app/api/v1/checkout/route.ts` (modify)                                                                | Add the `GET` handler beside `POST`                                 |
| `src/app/api/v1/checkout/route.lookup.test.ts` (create)                                                    | Route tests for `GET`, kept apart from the `POST` test's table fake |
| `src/lib/schemas.ts`, `src/lib/schemas.test.ts` (modify)                                                   | UEN rule and its tests                                              |
| `test/contract/checkout-lookup.sample.json` (create), `test/contract/paykit-api.contract.test.ts` (modify) | Saved example of the new response and its schema check              |
| READMEs and `CHANGELOG.md` (modify)                                                                        | Required by CI                                                      |

qkit (this worktree):

| File                                                                | Responsibility                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/paykit/client.ts` (modify)                                 | `getCheckoutByOrderRef`                                        |
| `src/lib/paykit/transaction-for-order.ts` (create)                  | `transactionIdForOrder`: lookup, amount guard, fallback        |
| `src/lib/paykit/transaction-for-order.test.ts` (create)             | Unit tests for the helper                                      |
| `src/app/dashboard/order-actions.ts` (modify)                       | `confirmOrderPayment`, `confirmPaymentAndStart` use the helper |
| `src/app/order/[boothId]/[orderNumber]/payment-actions.ts` (modify) | `claimPayment`, `unclaimPayment` use the helper                |
| `e2e/paykit-mock.ts` (modify)                                       | Mock answers the lookup route                                  |
| `src/lib/paykit/README.md`, `CHANGELOG.md` (modify)                 | Docs                                                           |

---

## Part 1: paykit

### Task 1: Worktree and lookup mapping

**Files:**

- Create: `src/lib/checkout-lookup.ts`
- Create: `src/lib/checkout-lookup.test.ts`
- Modify: `src/lib/api-schemas.ts` (append after `transactionStatusResponseSchema`'s type export, around line 47)
- Modify: `src/lib/checkout.ts` (the `checkoutResponse` function near the end of the file)

**Interfaces:**

- Consumes: `checkoutKind(tx)` from `@/lib/checkout-kind`; `toStatusResponse(row)` and `transactionStatusResponseSchema` from `@/lib/api-schemas`.
- Produces:
  - `checkoutLookupQuerySchema` (Zod): `{ order_ref: string }`, trimmed, 1 to 200 characters.
  - `checkoutLookupResponseSchema` (Zod) and type `CheckoutLookupResponse`: the transaction status fields plus `view`.
  - `CHECKOUT_LOOKUP_COLUMNS: string`, `type CheckoutLookupRow`, `toLookupResponse(row: CheckoutLookupRow): CheckoutLookupResponse`, `FALLBACK_LINK_LABEL: string`.

- [ ] **Step 1: Create the paykit worktree and install**

```bash
cd "/c/Users/Clarence/Desktop/Coding/Merqo Business/paykit"
gh pr list --repo merqo-io/paykit --state open
git fetch origin
git worktree add .claude/worktrees/order-ref-lookup -b feat/checkout-order-ref-lookup origin/main
cd .claude/worktrees/order-ref-lookup
pnpm install --frozen-lockfile
```

Expected: no open PR touching `src/app/api/v1/checkout` or `src/lib/schemas.ts`; install completes. All later paykit steps run from this worktree.

- [ ] **Step 2: Write the failing mapping tests**

Create `src/lib/checkout-lookup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPayNowPayload } from "@/lib/payments/paynow";
import { toLookupResponse, type CheckoutLookupRow } from "./checkout-lookup";
import { checkoutLookupResponseSchema } from "./api-schemas";

const BASE: CheckoutLookupRow = {
  id: "22222222-2222-2222-2222-222222222222",
  status: "claimed",
  amount_cents: 450,
  order_ref: "A-001",
  kit_slug: "qkit",
  claimed_at: "2026-07-15T00:01:00Z",
  confirmed_at: null,
  created_at: "2026-07-15T00:00:00Z",
  qr_payload: "https://pay.example/checkout/abc",
  checkout_kind: "link",
  checkout_label: "Pay with PayLah",
};

describe("toLookupResponse", () => {
  it("returns the status fields and the stored link view", () => {
    const body = toLookupResponse(BASE);
    expect(body).toMatchObject({
      transaction_id: BASE.id,
      status: "claimed",
      amount_cents: 450,
      order_ref: "A-001",
      kit_slug: "qkit",
    });
    expect(body.view).toEqual({
      type: "link",
      url: "https://pay.example/checkout/abc",
      label: "Pay with PayLah",
    });
    expect(checkoutLookupResponseSchema.safeParse(body).success).toBe(true);
  });

  it("uses the fallback label for a link stored without one", () => {
    const body = toLookupResponse({ ...BASE, checkout_label: null });
    expect(body.view).toEqual({
      type: "link",
      url: "https://pay.example/checkout/abc",
      label: "Open payment link",
    });
  });

  it("returns an image view", () => {
    const body = toLookupResponse({
      ...BASE,
      checkout_kind: "image",
      checkout_label: null,
      qr_payload: "https://cdn.example/qr.png",
    });
    expect(body.view).toEqual({
      type: "image",
      url: "https://cdn.example/qr.png",
    });
  });

  it("returns a qr view for a stored PayNow payload", () => {
    const payload = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "Kopitiam Cart",
      amountCents: 450,
      reference: "A-001",
    });
    const body = toLookupResponse({
      ...BASE,
      checkout_kind: "qr",
      checkout_label: null,
      qr_payload: payload,
    });
    expect(body.view).toEqual({ type: "qr", payload });
  });

  it("recognises a PayNow payload on a row that predates checkout_kind", () => {
    const payload = buildPayNowPayload({
      uen: "53312345A",
      payeeName: "Kopitiam Cart",
      amountCents: 450,
      reference: "A-001",
    });
    const body = toLookupResponse({
      ...BASE,
      checkout_kind: null,
      checkout_label: null,
      qr_payload: payload,
    });
    expect(body.view).toEqual({ type: "qr", payload });
  });

  it("returns a null view for an old URL row whose kind is unknown", () => {
    const body = toLookupResponse({
      ...BASE,
      checkout_kind: null,
      checkout_label: null,
    });
    expect(body.view).toBeNull();
    expect(checkoutLookupResponseSchema.safeParse(body).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/checkout-lookup.test.ts`
Expected: FAIL, cannot resolve `./checkout-lookup`.

- [ ] **Step 4: Add the wire schemas**

In `src/lib/api-schemas.ts`, directly after the `TransactionStatusResponse` type export, add:

```ts
export const checkoutLookupQuerySchema = z.object({
  order_ref: z.string().trim().min(1).max(200),
});

const snapshotViewSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("qr"), payload: z.string().min(1) }),
  z.object({
    type: z.literal("link"),
    url: z.string().url(),
    label: z.string(),
  }),
  z.object({ type: z.literal("image"), url: z.string().url() }),
]);

/** `GET /api/v1/checkout?order_ref=`. `view` is the snapshot stored when the
 *  checkout was created, never rebuilt from the vendor's current config; it
 *  is null for a row whose display kind cannot be proven. */
export const checkoutLookupResponseSchema =
  transactionStatusResponseSchema.extend({
    view: snapshotViewSchema.nullable(),
  });
export type CheckoutLookupResponse = z.infer<
  typeof checkoutLookupResponseSchema
>;
```

- [ ] **Step 5: Write the mapping**

Create `src/lib/checkout-lookup.ts`:

```ts
import { checkoutKind } from "@/lib/checkout-kind";
import {
  toStatusResponse,
  type CheckoutLookupResponse,
} from "@/lib/api-schemas";

export const CHECKOUT_LOOKUP_COLUMNS =
  "id, status, amount_cents, order_ref, kit_slug, claimed_at, confirmed_at, created_at, qr_payload, checkout_kind, checkout_label";

export const FALLBACK_LINK_LABEL = "Open payment link";

export type CheckoutLookupRow = {
  id: string;
  status: string;
  amount_cents: number;
  order_ref: string;
  kit_slug: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  qr_payload: string;
  checkout_kind?: "qr" | "link" | "image" | null;
  checkout_label?: string | null;
};

function snapshotView(row: CheckoutLookupRow): CheckoutLookupResponse["view"] {
  const kind = checkoutKind(row);
  if (kind === "qr") return { type: "qr", payload: row.qr_payload };
  if (kind === "link")
    return {
      type: "link",
      url: row.qr_payload,
      label: row.checkout_label ?? FALLBACK_LINK_LABEL,
    };
  if (kind === "image") return { type: "image", url: row.qr_payload };
  return null;
}

/** Maps a `paykit.transactions` row to the order-ref lookup wire shape. */
export function toLookupResponse(
  row: CheckoutLookupRow,
): CheckoutLookupResponse {
  return { ...toStatusResponse(row), view: snapshotView(row) };
}
```

- [ ] **Step 6: Share the fallback label with `createCheckout`**

In `src/lib/checkout.ts`, add the import beside the existing ones:

```ts
import { FALLBACK_LINK_LABEL } from "@/lib/checkout-lookup";
```

and in `checkoutResponse`, replace

```ts
        : (tx.checkout_label ?? "Open payment link"),
```

with

```ts
        : (tx.checkout_label ?? FALLBACK_LINK_LABEL),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/checkout-lookup.test.ts src/lib/checkout.test.ts src/app/api/v1/checkout/route.test.ts`
Expected: PASS, including the existing checkout tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api-schemas.ts src/lib/checkout-lookup.ts src/lib/checkout-lookup.test.ts src/lib/checkout.ts
git commit -m "feat: map a transaction row to the order-ref lookup response

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `GET /api/v1/checkout?order_ref=`

**Files:**

- Modify: `src/app/api/v1/checkout/route.ts`
- Create: `src/app/api/v1/checkout/route.lookup.test.ts`

**Interfaces:**

- Consumes: `checkoutLookupQuerySchema` from `@/lib/api-schemas`; `CHECKOUT_LOOKUP_COLUMNS`, `toLookupResponse` from `@/lib/checkout-lookup`; `verifyKitAuth` (returns `{ kitSlug: string } | null`); `rateLimit(supabase, key, limit, windowSeconds): Promise<boolean>`; `clientIp(headers)`.
- Produces: `GET /api/v1/checkout?order_ref=<ref>` with 200 `CheckoutLookupResponse`, 400, 401, 404, 429, 503. Every error body is `{ error: string }`.

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/v1/checkout/route.lookup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const {
  verifyKitAuthMock,
  maybeSingleMock,
  eqMock,
  selectMock,
  rateLimitMock,
  createServiceClientMock,
} = vi.hoisted(() => ({
  verifyKitAuthMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  eqMock: vi.fn(),
  selectMock: vi.fn(),
  rateLimitMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/kit-auth", () => ({ verifyKitAuth: verifyKitAuthMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "203.0.113.5",
  rateLimit: rateLimitMock,
  PER_ROUTE_LIMIT: 60,
  PER_ROUTE_WINDOW_SECONDS: 60,
}));
vi.mock("@/lib/checkout", () => ({ createCheckout: vi.fn() }));

const TX_ID = "22222222-2222-2222-2222-222222222222";
const ROW = {
  id: TX_ID,
  status: "claimed",
  amount_cents: 450,
  order_ref: "A-001",
  kit_slug: "qkit",
  claimed_at: "2026-07-15T00:01:00Z",
  confirmed_at: null,
  created_at: "2026-07-15T00:00:00Z",
  qr_payload: "https://pay.example/checkout/abc",
  checkout_kind: "link",
  checkout_label: "Pay with PayLah",
};

beforeEach(() => {
  verifyKitAuthMock.mockReset().mockResolvedValue({ kitSlug: "qkit" });
  rateLimitMock.mockReset().mockResolvedValue(true);
  maybeSingleMock.mockReset().mockResolvedValue({ data: ROW, error: null });
  const chain = { eq: eqMock, maybeSingle: maybeSingleMock };
  eqMock.mockReset().mockReturnValue(chain);
  selectMock.mockReset().mockReturnValue(chain);
  createServiceClientMock.mockReset().mockResolvedValue({
    from: (table: string) => {
      if (table !== "transactions")
        throw new Error(`unexpected table ${table}`);
      return { select: selectMock };
    },
  });
});

function req(query: string) {
  return new Request(`http://localhost/api/v1/checkout${query}`, {
    headers: { authorization: "Bearer qkit:secret" },
  });
}

describe("GET /api/v1/checkout?order_ref=", () => {
  it("returns the transaction and its stored view", async () => {
    const res = await GET(req("?order_ref=A-001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      transaction_id: TX_ID,
      status: "claimed",
      amount_cents: 450,
      order_ref: "A-001",
      kit_slug: "qkit",
      claimed_at: "2026-07-15T00:01:00Z",
      confirmed_at: null,
      created_at: "2026-07-15T00:00:00Z",
      view: {
        type: "link",
        url: "https://pay.example/checkout/abc",
        label: "Pay with PayLah",
      },
    });
  });

  it("reads only the calling kit's transaction for that order_ref", async () => {
    verifyKitAuthMock.mockResolvedValue({ kitSlug: "loopkit" });
    await GET(req("?order_ref=A-001"));
    expect(eqMock.mock.calls).toEqual([
      ["kit_slug", "loopkit"],
      ["order_ref", "A-001"],
    ]);
  });

  it("401s when the bearer token is missing or invalid", async () => {
    verifyKitAuthMock.mockResolvedValue(null);
    const res = await GET(req("?order_ref=A-001"));
    expect(res.status).toBe(401);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("429s when the rate limit is exceeded, without reading transactions", async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await GET(req("?order_ref=A-001"));
    expect(res.status).toBe(429);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", ""],
    ["empty", "?order_ref="],
    ["blank", "?order_ref=%20%20"],
    ["too long", `?order_ref=${"x".repeat(201)}`],
  ])("400s for a %s order_ref, without reading transactions", async (_, q) => {
    const res = await GET(req(q));
    expect(res.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("404s when this kit has no transaction for the order_ref", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req("?order_ref=A-404"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("503s without leaking the database error", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const res = await GET(req("?order_ref=A-001"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toMatch(/connection reset/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/api/v1/checkout/route.lookup.test.ts`
Expected: FAIL, `GET` is not exported from `./route`.

- [ ] **Step 3: Implement the handler**

In `src/app/api/v1/checkout/route.ts`, change the `api-schemas` import and add one import:

```ts
import {
  checkoutLookupQuerySchema,
  checkoutRequestSchema,
} from "@/lib/api-schemas";
import {
  CHECKOUT_LOOKUP_COLUMNS,
  toLookupResponse,
} from "@/lib/checkout-lookup";
```

Add above `export async function POST`:

```ts
/** Finds the calling kit's transaction for one of its own order references,
 *  so a kit that stores no transaction id never has to create a checkout
 *  just to learn it. Read-only. */
export async function GET(request: Request) {
  const auth = await verifyKitAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServiceClient();
  const allowed = await rateLimit(
    supabase,
    `checkout-lookup:${auth.kitSlug}:${clientIp(request.headers)}`,
    PER_ROUTE_LIMIT,
    PER_ROUTE_WINDOW_SECONDS,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = checkoutLookupQuerySchema.safeParse({
    order_ref: new URL(request.url).searchParams.get("order_ref") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "order_ref is required" },
      { status: 400 },
    );

  const { data, error } = await supabase
    .from("transactions")
    .select(CHECKOUT_LOOKUP_COLUMNS)
    .eq("kit_slug", auth.kitSlug)
    .eq("order_ref", parsed.data.order_ref)
    .maybeSingle();
  if (error) {
    console.error("checkout lookup: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(toLookupResponse(data));
}
```

If `tsc` reports that `data` is not assignable to `CheckoutLookupRow` because the column list is a variable, type the query result with `.returns<CheckoutLookupRow>()` before `.maybeSingle()` and import the type. Do not cast with `as`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/api/v1/checkout`
Expected: PASS, both the new file and the existing `route.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/checkout/route.ts src/app/api/v1/checkout/route.lookup.test.ts
git commit -m "feat: look up a checkout by order reference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: paykit adopts the stricter UEN rule

**Files:**

- Modify: `src/lib/schemas.ts:23`
- Modify: `src/lib/schemas.test.ts` (after the "rejects an invalid UEN format" test, around line 61)

**Interfaces:**

- Consumes: nothing new.
- Produces: `vendorPaymentConfigInputSchema` rejects a UEN that is not 9 to 10 alphanumerics ending in a letter. Same rule as qkit's `paynowConfigSchema`.

- [ ] **Step 1: Ask the owner to check saved UENs before the rule tightens**

The agent does not run this. Give the owner this read-only query to run in the Supabase SQL editor, and wait for the answer:

```sql
select vendor_id, uen
from paykit.vendor_payment_config
where kind = 'paynow'
  and uen is not null
  and uen !~ '^[0-9A-Za-z]{8,9}[A-Za-z]$';
```

Expected: zero rows. If any row comes back, stop this task and tell the owner: that vendor could not re-save their settings under the new rule until the UEN is corrected. Tasks 1, 2 and 4 do not depend on this task and can ship without it.

- [ ] **Step 2: Write the failing tests**

In `src/lib/schemas.test.ts`, after the "rejects an invalid UEN format" test, add:

```ts
it("rejects a bare 8-digit mobile number typed as a UEN", () => {
  const parsed = vendorPaymentConfigInputSchema.safeParse({
    kind: "paynow",
    payee_name: "Kopitiam Cart",
    uen: "91234567",
    mobile: "",
  });
  expect(parsed.success).toBe(false);
});

it("rejects a UEN that does not end in a letter", () => {
  const parsed = vendorPaymentConfigInputSchema.safeParse({
    kind: "paynow",
    payee_name: "Kopitiam Cart",
    uen: "533123456",
    mobile: "",
  });
  expect(parsed.success).toBe(false);
});

it.each(["53312345A", "201912345K", "T09LL0001B"])(
  "accepts the UEN %s",
  (uen) => {
    const parsed = vendorPaymentConfigInputSchema.safeParse({
      kind: "paynow",
      payee_name: "Kopitiam Cart",
      uen,
      mobile: "",
    });
    expect(parsed.success).toBe(true);
  },
);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/schemas.test.ts`
Expected: FAIL on the two "rejects" tests (both values pass today's `{8,12}` rule). The three "accepts" cases pass already.

- [ ] **Step 4: Tighten the rule**

In `src/lib/schemas.ts`, replace

```ts
    .regex(/^[0-9A-Za-z]{8,12}$/, "Invalid UEN")
```

with

```ts
    // Every UEN format is 9 or 10 characters and ends in a check letter. An
    // 8-digit mobile number typed here would otherwise pass and produce a
    // QR that banking apps reject. qkit applies the same rule.
    .regex(/^[0-9A-Za-z]{8,9}[A-Za-z]$/, "Invalid UEN")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/schemas.test.ts src/app/dashboard/config src/app/api/v1/vendors`
Expected: PASS. If a config or vendor-route test fails, it used a fixture UEN that the new rule rejects; change that fixture to `53312345A`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "fix: reject a UEN that does not end in a check letter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: paykit contract sample, docs, gate, PR

**Files:**

- Create: `test/contract/checkout-lookup.sample.json`
- Modify: `test/contract/paykit-api.contract.test.ts`
- Modify: `test/contract/README.md`, `src/app/api/v1/checkout/README.md`, `src/lib/README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: `checkoutLookupResponseSchema` from Task 1.
- Produces: the deployed route qkit's Part 2 calls.

- [ ] **Step 1: Add the saved example**

Create `test/contract/checkout-lookup.sample.json`:

```json
{
  "transaction_id": "11111111-1111-1111-1111-111111111111",
  "status": "claimed",
  "amount_cents": 450,
  "order_ref": "A-001",
  "kit_slug": "qkit",
  "claimed_at": "2026-07-15T00:01:00Z",
  "confirmed_at": null,
  "created_at": "2026-07-15T00:00:00Z",
  "view": {
    "type": "link",
    "url": "https://pay.example/checkout/abc",
    "label": "Pay with PayLah"
  }
}
```

- [ ] **Step 2: Add the contract check**

In `test/contract/paykit-api.contract.test.ts`, add `checkoutLookupResponseSchema` to the import from `@/lib/api-schemas`, and add inside the `describe`:

```ts
it("GET /api/v1/checkout?order_ref= response satisfies checkoutLookupResponseSchema", () => {
  const parsed = checkoutLookupResponseSchema.safeParse(
    loadSample("checkout-lookup.sample.json"),
  );
  expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
});

it("the lookup response also satisfies the plain transaction status contract", () => {
  const parsed = transactionStatusResponseSchema.safeParse(
    loadSample("checkout-lookup.sample.json"),
  );
  expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true);
});
```

Run: `pnpm vitest run test/contract`
Expected: PASS.

- [ ] **Step 3: Update the READMEs and changelog**

`src/app/api/v1/checkout/README.md`: change the Purpose paragraph's first line to name both methods, and add two bullets to Contents:

```markdown
- `route.ts` — `GET ?order_ref=`: finds the calling kit's transaction for one
  of its own order references and returns its status plus the checkout view
  stored at creation (`view`, null when an old row's display kind cannot be
  proven). Scoped to the bearer's `kit_slug`, so one kit can never read
  another kit's transaction by guessing a reference. Read-only: it never
  creates a transaction and never re-renders from the vendor's current
  config, which is what lets a kit confirm or claim an order after the vendor
  edits their payment details.
- `route.lookup.test.ts` — the `GET` handler: the response shape, the
  `kit_slug` filter, 400 for a missing, blank or over-long `order_ref`, and
  401, 404, 429 and 503.
```

`src/lib/README.md`: add an entry for `checkout-lookup.ts` in the same style as its neighbours:

```markdown
- `checkout-lookup.ts` — `toLookupResponse(row)`: maps a `transactions` row to
  the `GET /api/v1/checkout?order_ref=` wire shape, building `view` from the
  stored snapshot through `checkoutKind`. Also holds the column list that
  route selects and the fallback label for a link stored without one.
```

`test/contract/README.md`: add under Contents:

```markdown
- `checkout-lookup.sample.json` — a saved example
  `GET /api/v1/checkout?order_ref=` response.
```

`CHANGELOG.md`, under `## [Unreleased]`:

```markdown
### Added

- `GET /api/v1/checkout?order_ref=`: a calling kit can find its own
  transaction for an order without creating a checkout.

### Fixed

- The UEN field now rejects a value that does not end in a check letter, the
  same rule qkit applies, so an 8-digit mobile number can no longer be saved
  as a UEN.
```

Put each entry under the existing heading of that name if `[Unreleased]` already has one.

- [ ] **Step 4: Run the full gate**

Run: `pnpm check && pnpm test`
Expected: both exit 0.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add test/contract src/app/api/v1/checkout/README.md src/lib/README.md CHANGELOG.md
git commit -m "docs: record the order-ref lookup contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/checkout-order-ref-lookup
gh pr create --repo merqo-io/paykit --base main --title "feat: look up a checkout by order reference" --body "$(cat <<'EOF'
## What

- `GET /api/v1/checkout?order_ref=`: returns the calling kit's transaction for one of its order references, with the checkout view stored at creation. Read-only, scoped to the bearer's kit slug.
- The UEN rule now matches qkit's: 9 to 10 characters ending in a letter.

## Why

qkit stores no transaction id. To confirm, claim or undo a payment it calls `POST /api/v1/checkout` again and relies on the idempotent replay. After a vendor edits their payment details that replay answers 409, so those orders can no longer be confirmed. This route is the lookup qkit switches to in its own PR.

Phase P1 of the separation design in the qkit repo: `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`.

## Not in this PR

- No migration. The route uses the existing unique `(kit_slug, order_ref)` constraint.
- `AGENTS.md` is not edited. Suggested line for the File Layout section, for the owner to apply: `src/app/api/v1/checkout/ — POST /api/v1/checkout, GET /api/v1/checkout?order_ref=, GET/POST /api/v1/checkout/{id}[/claim|/unclaim|/confirm]`.

## Verified

- `pnpm check && pnpm test` pass locally.
- Route tests cover 200, 400, 401, 404, 429, 503 and the kit-slug filter.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Do not merge it. Report the URL to the owner and wait until it is merged and deployed before Part 2's PR is merged. Part 2's code can be written meanwhile.

---

## Part 2: qkit

All steps run from the qkit worktree `C:\Users\Clarence\Desktop\Coding\Merqo Business\qkit\.claude\worktrees\pensive-hugle-5d16bb`, branch `claude/pensive-hugle-5d16bb`. The spec and this plan are uncommitted on that branch; Task 5 commits them.

### Task 5: `getCheckoutByOrderRef` in the paykit client

**Files:**

- Modify: `src/lib/paykit/client.ts` (add after `getCheckoutStatus`, end of file)
- Modify: `src/lib/paykit/client.test.ts`

**Interfaces:**

- Consumes: the existing `paykitRequest`, `transactionStatusResponseSchema`, `toTransactionStatus`, `PaykitResult`, `TransactionStatus`.
- Produces: `getCheckoutByOrderRef(orderRef: string): Promise<PaykitResult<TransactionStatus>>`. On a non-2xx answer, `status` carries the HTTP status (404, 405, 503).

- [ ] **Step 1: Commit the design documents**

```bash
gh pr list --repo merqo-io/Qkit --state open
git add docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md docs/superpowers/specs/README.md docs/superpowers/plans/2026-10-10-paykit-order-ref-lookup.md docs/superpowers/plans/README.md
git commit -m "docs: paykit and printkit separation design and the P1 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing client tests**

In `src/lib/paykit/client.test.ts`, add `getCheckoutByOrderRef` to the import from `./client`, and add this block before `describe("path-segment encoding", ...)`:

```ts
describe("getCheckoutByOrderRef", () => {
  const ORDER = "00000000-0000-4000-8000-000000000009";

  it("GETs the lookup route and maps the status, ignoring the view", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        transaction_id: TX,
        status: "claimed",
        amount_cents: 800,
        order_ref: ORDER,
        kit_slug: "qkit",
        claimed_at: "2026-08-11T00:00:00Z",
        confirmed_at: null,
        created_at: "2026-08-10T23:59:00Z",
        view: { type: "qr", payload: "0002" },
      }),
    );
    const res = await getCheckoutByOrderRef(ORDER);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/checkout?order_ref=${ORDER}`,
    );
    expect(init.method).toBe("GET");
    expect(res).toEqual({
      ok: true,
      data: {
        transactionId: TX,
        status: "claimed",
        amountCents: 800,
        orderRef: ORDER,
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: null,
      },
    });
  });

  it("percent-encodes the order reference", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "Not found" }));
    await getCheckoutByOrderRef("a/b?c=d&e#f");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://paykit.example/api/v1/checkout?order_ref=a%2Fb%3Fc%3Dd%26e%23f",
    );
  });

  it("surfaces a 404 with its status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "Not found" }));
    expect(await getCheckoutByOrderRef(ORDER)).toEqual({
      ok: false,
      status: 404,
      error: "Not found",
    });
  });

  it("surfaces a 405 from a paykit without the route, keeping its status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 405,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
    } as Response);
    const res = await getCheckoutByOrderRef(ORDER);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ status: 405 });
  });

  it("rejects a malformed success body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { transaction_id: TX }));
    expect((await getCheckoutByOrderRef(ORDER)).ok).toBe(false);
  });

  it("reports a network failure without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await getCheckoutByOrderRef(ORDER)).toEqual({
      ok: false,
      status: null,
      error: "ECONNRESET",
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/paykit/client.test.ts`
Expected: FAIL, `getCheckoutByOrderRef` is not exported.

- [ ] **Step 4: Implement**

Append to `src/lib/paykit/client.ts`:

```ts
/** Find the transaction paykit already holds for one of qkit's orders,
 *  without creating one. qkit stores no transaction id, so this is how an
 *  action reaches it. Unlike `createCheckout`, it does not depend on the
 *  vendor's current payment config, so it still answers after the vendor
 *  edits their payment details. A 404 means paykit has no transaction for
 *  the order; a 405 means that paykit deployment has no lookup route. */
export async function getCheckoutByOrderRef(
  orderRef: string,
): Promise<PaykitResult<TransactionStatus>> {
  const result = await paykitRequest(
    `/api/v1/checkout?order_ref=${encodeURIComponent(orderRef)}`,
    transactionStatusResponseSchema,
    { method: "GET" },
  );
  return result.ok
    ? { ok: true, data: toTransactionStatus(result.data) }
    : result;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/paykit/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/paykit/client.ts src/lib/paykit/client.test.ts
git commit -m "feat: look up a paykit checkout by order reference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: `transactionIdForOrder`

**Files:**

- Create: `src/lib/paykit/transaction-for-order.ts`
- Create: `src/lib/paykit/transaction-for-order.test.ts`

**Interfaces:**

- Consumes: `getCheckoutByOrderRef(orderRef)` and `createCheckout({ vendorId, amountCents, orderRef })` from `./client`; `PaykitResult<T>`.
- Produces: `transactionIdForOrder(args: { vendorId: string; amountCents: number; orderRef: string }): Promise<PaykitResult<string>>`. `data` is the paykit transaction id.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/paykit/transaction-for-order.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { transactionIdForOrder } from "./transaction-for-order";

const { getCheckoutByOrderRefMock, createCheckoutMock } = vi.hoisted(() => ({
  getCheckoutByOrderRefMock: vi.fn(),
  createCheckoutMock: vi.fn(),
}));
vi.mock("./client", () => ({
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
  createCheckout: createCheckoutMock,
}));

const ARGS = { vendorId: "v1", amountCents: 800, orderRef: "o1" };

function found(amountCents = 800) {
  return {
    ok: true,
    data: {
      transactionId: "tx1",
      status: "claimed",
      amountCents,
      orderRef: "o1",
      claimedAt: "2026-08-11T00:00:00Z",
      confirmedAt: null,
    },
  };
}

beforeEach(() => {
  getCheckoutByOrderRefMock.mockReset().mockResolvedValue(found());
  createCheckoutMock.mockReset().mockResolvedValue({
    ok: true,
    data: { type: "qr", transactionId: "tx-new", payload: "0002" },
  });
});

describe("transactionIdForOrder", () => {
  it("returns the transaction paykit already holds, without creating one", async () => {
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: true,
      data: "tx1",
    });
    expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith("o1");
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("refuses a transaction whose amount differs from the order's", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue(found(900));
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: false,
      status: 409,
      error: "Checkout amount does not match this order",
    });
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it.each([404, 405])(
    "creates the checkout when the lookup answers %i",
    async (status) => {
      getCheckoutByOrderRefMock.mockResolvedValue({
        ok: false,
        status,
        error: "Not found",
      });
      expect(await transactionIdForOrder(ARGS)).toEqual({
        ok: true,
        data: "tx-new",
      });
      expect(createCheckoutMock).toHaveBeenCalledWith(ARGS);
    },
  );

  it("returns the create failure when the fallback fails", async () => {
    getCheckoutByOrderRefMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Not found",
    });
    createCheckoutMock.mockResolvedValue({
      ok: false,
      status: 422,
      error: "vendor has no PayNow config",
    });
    expect(await transactionIdForOrder(ARGS)).toEqual({
      ok: false,
      status: 422,
      error: "vendor has no PayNow config",
    });
  });

  it.each([503, 429, 401, null])(
    "does not create a checkout when the lookup fails with %s",
    async (status) => {
      getCheckoutByOrderRefMock.mockResolvedValue({
        ok: false,
        status,
        error: "Upstream unavailable",
      });
      expect(await transactionIdForOrder(ARGS)).toEqual({
        ok: false,
        status,
        error: "Upstream unavailable",
      });
      expect(createCheckoutMock).not.toHaveBeenCalled();
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/paykit/transaction-for-order.test.ts`
Expected: FAIL, cannot resolve `./transaction-for-order`.

- [ ] **Step 3: Implement**

Create `src/lib/paykit/transaction-for-order.ts`:

```ts
import {
  createCheckout,
  getCheckoutByOrderRef,
  type PaykitResult,
} from "./client";

// 404: paykit has no transaction for this order (a walk-up order whose pay
// step never reached paykit). 405: that paykit deployment has no lookup
// route. Both fall back to creating the checkout, which is idempotent on the
// order reference.
const FALL_BACK_TO_CREATE = new Set<number | null>([404, 405]);

/**
 * The paykit transaction id for one of qkit's orders. Looks it up, and only
 * creates a checkout when paykit has none. Looking up first matters: creating
 * re-renders from the vendor's current payment config and is refused once
 * that config has changed, which would leave an order already awaiting
 * payment impossible to confirm, claim or undo.
 */
export async function transactionIdForOrder(args: {
  vendorId: string;
  amountCents: number;
  orderRef: string;
}): Promise<PaykitResult<string>> {
  const found = await getCheckoutByOrderRef(args.orderRef);
  if (found.ok) {
    if (found.data.amountCents !== args.amountCents)
      return {
        ok: false,
        status: 409,
        error: "Checkout amount does not match this order",
      };
    return { ok: true, data: found.data.transactionId };
  }
  if (!FALL_BACK_TO_CREATE.has(found.status)) return found;

  const created = await createCheckout(args);
  return created.ok ? { ok: true, data: created.data.transactionId } : created;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/paykit/transaction-for-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paykit/transaction-for-order.ts src/lib/paykit/transaction-for-order.test.ts
git commit -m "feat: find an order's paykit transaction before creating one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Vendor confirm uses the lookup

**Files:**

- Modify: `src/app/dashboard/order-actions.ts` (import at line 17; `confirmPaymentAndStart` near line 261; `confirmOrderPayment` near line 471)
- Modify: `src/app/dashboard/order-actions.test.ts`

**Interfaces:**

- Consumes: `transactionIdForOrder` from `@/lib/paykit/transaction-for-order`; `confirmCheckout(transactionId)` from `@/lib/paykit/client`.
- Produces: no signature change. `confirmOrderPayment(orderId)` and `confirmPaymentAndStart(orderId)` keep their return types and their error strings.

The action tests mock `@/lib/paykit/client` only. `transaction-for-order.ts` imports that same module, so the real helper runs against the mocked client. Do not mock the helper in these tests.

- [ ] **Step 1: Extend the test mocks**

In `src/app/dashboard/order-actions.test.ts`, replace the paykit mock block (lines 94 to 101) with:

```ts
const { createCheckoutMock, confirmCheckoutMock, getCheckoutByOrderRefMock } =
  vi.hoisted(() => ({
    createCheckoutMock: vi.fn(),
    confirmCheckoutMock: vi.fn(),
    getCheckoutByOrderRefMock: vi.fn(),
  }));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  confirmCheckout: confirmCheckoutMock,
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));
```

In the top-level `beforeEach`, directly after the `createCheckoutMock.mockReset()...` statement, add:

```ts
getCheckoutByOrderRefMock.mockReset().mockResolvedValue({
  ok: true,
  data: {
    transactionId: "tx1",
    status: "claimed",
    amountCents: 800,
    orderRef: ID,
    claimedAt: "2026-08-11T00:00:00Z",
    confirmedAt: null,
  },
});
```

- [ ] **Step 2: Write the failing tests**

Inside `describe("confirmOrderPayment", ...)`, add:

```ts
it("confirms an order whose vendor changed payment details after checkout", async () => {
  maybeSingle.mockResolvedValue({
    data: {
      id: ID,
      status: "ready",
      payment_status: "claimed",
      total_cents: 800,
    },
  });
  createCheckoutMock.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Payment configuration changed since checkout creation",
  });
  expect(await confirmOrderPayment(ID)).toEqual({ success: true });
  expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ID);
  expect(createCheckoutMock).not.toHaveBeenCalled();
  expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
});

it("creates the checkout when paykit has none for this order", async () => {
  maybeSingle.mockResolvedValue({
    data: {
      id: ID,
      status: "ready",
      payment_status: "pending",
      total_cents: 800,
    },
  });
  getCheckoutByOrderRefMock.mockResolvedValue({
    ok: false,
    status: 404,
    error: "Not found",
  });
  expect(await confirmOrderPayment(ID)).toEqual({ success: true });
  expect(createCheckoutMock).toHaveBeenCalledWith({
    vendorId: "v1",
    amountCents: 800,
    orderRef: ID,
  });
  expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
});

it("refuses to confirm when paykit's amount differs from the order's", async () => {
  maybeSingle.mockResolvedValue({
    data: {
      id: ID,
      status: "ready",
      payment_status: "claimed",
      total_cents: 900,
    },
  });
  expect(await confirmOrderPayment(ID)).toEqual({
    success: false,
    error: "Failed to confirm payment",
  });
  expect(confirmCheckoutMock).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
```

Inside `describe("confirmPaymentAndStart", ...)`, add:

```ts
it("confirms and starts an order whose vendor changed payment details after checkout", async () => {
  maybeSingle.mockResolvedValue({
    data: {
      id: ID,
      status: "pending",
      payment_status: "claimed",
      total_cents: 800,
    },
  });
  createCheckoutMock.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Payment configuration changed since checkout creation",
  });
  expect(await confirmPaymentAndStart(ID)).toEqual({
    success: true,
    status: "preparing",
    prevPaymentStatus: "claimed",
  });
  expect(createCheckoutMock).not.toHaveBeenCalled();
  expect(confirmCheckoutMock).toHaveBeenCalledWith("tx1");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/dashboard/order-actions.test.ts`
Expected: the two "changed payment details" tests FAIL with `success: false, error: "Failed to confirm payment"` (the actions still call create-checkout, which is mocked to answer 409). The "creates the checkout" test passes already. The "amount differs" test FAILS (confirm is called).

- [ ] **Step 4: Switch both actions to the helper**

In `src/app/dashboard/order-actions.ts`, replace line 17

```ts
import { createCheckout, confirmCheckout } from "@/lib/paykit/client";
```

with

```ts
import { confirmCheckout } from "@/lib/paykit/client";
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
```

In `confirmPaymentAndStart`, replace

```ts
const checkout = await createCheckout({
  vendorId: userId,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!checkout.ok) {
  console.error(
    "confirmPaymentAndStart: paykit checkout failed",
    checkout.error,
  );
  return { success: false, error: "Failed to confirm payment" };
}
const confirm = await confirmCheckout(checkout.data.transactionId);
```

with

```ts
const transaction = await transactionIdForOrder({
  vendorId: userId,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!transaction.ok) {
  console.error(
    "confirmPaymentAndStart: paykit transaction lookup failed",
    transaction.error,
  );
  return { success: false, error: "Failed to confirm payment" };
}
const confirm = await confirmCheckout(transaction.data);
```

In `confirmOrderPayment`, replace

```ts
const checkout = await createCheckout({
  vendorId: userId,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!checkout.ok) {
  console.error("confirmOrderPayment: paykit checkout failed", checkout.error);
  return { success: false, error: "Failed to confirm payment" };
}
const confirm = await confirmCheckout(checkout.data.transactionId);
```

with

```ts
const transaction = await transactionIdForOrder({
  vendorId: userId,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!transaction.ok) {
  console.error(
    "confirmOrderPayment: paykit transaction lookup failed",
    transaction.error,
  );
  return { success: false, error: "Failed to confirm payment" };
}
const confirm = await confirmCheckout(transaction.data);
```

In the doc comment above `confirmOrderPayment`, replace the sentence that ends "(idempotent — this re-fetches the same transaction rather than creating a second one)." with:

```ts
 * created for this order on the customer's pay page. The transaction is
 * looked up by that reference (see transactionIdForOrder) rather than
 * re-created, so this still works after the vendor edits payment details.
```

- [ ] **Step 5: Update the existing tests that asserted the old call**

In both `describe("confirmPaymentAndStart", ...)` ("confirms payment via paykit and advances to preparing in one write") and `describe("confirmOrderPayment", ...)` ("confirms a claimed order via paykit and mirrors paid_at locally"), replace

```ts
expect(createCheckoutMock).toHaveBeenCalledWith({
  vendorId: "v1",
  amountCents: 800,
  orderRef: ID,
});
```

with

```ts
expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith(ID);
expect(createCheckoutMock).not.toHaveBeenCalled();
```

In both blocks, in the test titled "reports a failure when paykit's checkout call fails", replace the `createCheckoutMock.mockResolvedValue({ ok: false, status: 503, error: "Upstream unavailable" })` statement with the same call on `getCheckoutByOrderRefMock`, and retitle the test "reports a failure when paykit's lookup fails".

In every test of both blocks that asserts `expect(createCheckoutMock).not.toHaveBeenCalled()` to prove paykit was not contacted (the "refuses when..." and "is idempotent..." and "rejects..." tests), add on the next line:

```ts
expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/dashboard/order-actions.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/order-actions.ts src/app/dashboard/order-actions.test.ts
git commit -m "fix: confirming a payment no longer fails after payment details change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Customer claim and undo use the lookup

**Files:**

- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.ts` (imports at lines 13 to 18; `claimPayment` near line 282; `unclaimPayment` near line 376 and its doc comment)
- Modify: `src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts`

**Interfaces:**

- Consumes: `transactionIdForOrder` from `@/lib/paykit/transaction-for-order`; `claimCheckout`, `unclaimCheckout`, `createCheckout` from `@/lib/paykit/client`.
- Produces: no signature change. `loadPreClaimContext` is not touched and keeps calling `createCheckout`, because it needs the view to render the pay page.

- [ ] **Step 1: Extend the test mocks**

In `payment-actions.test.ts`, replace the paykit mock block (lines 108 to 118) with:

```ts
const {
  createCheckoutMock,
  claimCheckoutMock,
  unclaimCheckoutMock,
  getCheckoutByOrderRefMock,
} = vi.hoisted(() => ({
  createCheckoutMock: vi.fn(),
  claimCheckoutMock: vi.fn(),
  unclaimCheckoutMock: vi.fn(),
  getCheckoutByOrderRefMock: vi.fn(),
}));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: createCheckoutMock,
  claimCheckout: claimCheckoutMock,
  unclaimCheckout: unclaimCheckoutMock,
  getCheckoutByOrderRef: getCheckoutByOrderRefMock,
}));
```

In the top-level `beforeEach`, directly after the `createCheckoutMock.mockReset()...` statement, add:

```ts
getCheckoutByOrderRefMock.mockReset().mockResolvedValue({
  ok: true,
  data: {
    transactionId: "tx1",
    status: "pending",
    amountCents: 800,
    orderRef: "o1",
    claimedAt: null,
    confirmedAt: null,
  },
});
```

- [ ] **Step 2: Write the failing tests**

Inside `describe("claimPayment (photo required, deferred numbering)", ...)`, add:

```ts
it("records a payment after the vendor changed payment details", async () => {
  createCheckoutMock.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Payment configuration changed since checkout creation",
  });
  const result = await claimPayment(BOOTH, TOKEN, fakeFile());
  expect(result).toEqual({ success: true, orderNumber: "0007" });
  expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith("o1");
  expect(createCheckoutMock).not.toHaveBeenCalled();
  expect(claimCheckoutMock).toHaveBeenCalledWith("tx1");
});
```

Inside `describe("unclaimPayment", ...)`, add:

```ts
it("undoes a claim after the vendor changed payment details", async () => {
  createCheckoutMock.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Payment configuration changed since checkout creation",
  });
  expect(await unclaimPayment(BOOTH, ORDER, TOKEN)).toEqual({
    success: true,
  });
  expect(createCheckoutMock).not.toHaveBeenCalled();
  expect(unclaimCheckoutMock).toHaveBeenCalledWith("tx1");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts"`
Expected: both new tests FAIL (`"Could not record payment. Try again."` and `"Could not undo. Try again."`).

- [ ] **Step 4: Switch both actions to the helper**

In `payment-actions.ts`, add the import after the `@/lib/paykit/client` import block:

```ts
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
```

In `claimPayment`, replace

```ts
const checkout = await createCheckout({
  vendorId: booth.vendor_id,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!checkout.ok) {
  console.error("claimPayment: paykit checkout failed", checkout.error);
  return { success: false, error: "Could not record payment. Try again." };
}
const claim = await claimCheckout(checkout.data.transactionId);
```

with

```ts
const transaction = await transactionIdForOrder({
  vendorId: booth.vendor_id,
  amountCents: order.total_cents,
  orderRef: order.id,
});
if (!transaction.ok) {
  console.error(
    "claimPayment: paykit transaction lookup failed",
    transaction.error,
  );
  return { success: false, error: "Could not record payment. Try again." };
}
const claim = await claimCheckout(transaction.data);
```

In `unclaimPayment`, replace

```ts
const checkout = await createCheckout({
  vendorId: ctx.vendorId,
  amountCents: ctx.totalCents,
  orderRef: ctx.orderId,
});
if (!checkout.ok) {
  console.error(
    "unclaimPayment: paykit checkout lookup failed",
    checkout.error,
  );
  return { success: false, error: "Could not undo. Try again." };
}

const unclaim = await unclaimCheckout(checkout.data.transactionId);
```

with

```ts
const transaction = await transactionIdForOrder({
  vendorId: ctx.vendorId,
  amountCents: ctx.totalCents,
  orderRef: ctx.orderId,
});
if (!transaction.ok) {
  console.error(
    "unclaimPayment: paykit transaction lookup failed",
    transaction.error,
  );
  return { success: false, error: "Could not undo. Try again." };
}

const unclaim = await unclaimCheckout(transaction.data);
```

`createCheckout` stays imported: `loadPreClaimContext` still uses it.

In the comment block above `unclaimPayment`, replace the paragraph that begins "There's no stored paykit transaction id for an order" and ends "from the vendor side." with:

```ts
// There's no stored paykit transaction id for an order, so it is looked up
// by the order's id (transactionIdForOrder), the same way claimPayment above
// and confirmOrderPayment (dashboard/order-actions.ts) reach it.
```

Keep the rest of that comment (from "`unclaimCheckout` is paykit's own authority") as it is.

- [ ] **Step 5: Update the existing tests that asserted the old call**

In the `claimPayment` test "uploads the photo, claims via paykit, assigns a number, notifies, and updates the mirror", and in the `unclaimPayment` test "reverts a claimed order via paykit and mirrors the status locally", replace

```ts
expect(createCheckoutMock).toHaveBeenCalledWith({
  vendorId: "v1",
  amountCents: 800,
  orderRef: "o1",
});
```

with

```ts
expect(getCheckoutByOrderRefMock).toHaveBeenCalledWith("o1");
expect(createCheckoutMock).not.toHaveBeenCalled();
```

In the `claimPayment` test "reports a failure and never assigns a number when paykit checkout creation fails" and the `unclaimPayment` test "reports a failure when paykit checkout lookup fails", move the 503 override from `createCheckoutMock` to `getCheckoutByOrderRefMock`. Retitle the first "reports a failure and never assigns a number when paykit's lookup fails".

In every test inside the `claimPayment` and `unclaimPayment` describe blocks that asserts `expect(createCheckoutMock).not.toHaveBeenCalled()`, add on the next line:

```ts
expect(getCheckoutByOrderRefMock).not.toHaveBeenCalled();
```

Do not change any test inside `describe("loadPreClaimContext", ...)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run "src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts"`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/order/[boothId]/[orderNumber]/payment-actions.ts" "src/app/order/[boothId]/[orderNumber]/payment-actions.test.ts"
git commit -m "fix: recording or undoing a payment no longer fails after payment details change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: e2e mock, docs, gate, PR

**Files:**

- Modify: `e2e/paykit-mock.ts`
- Modify: `src/lib/paykit/README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the qkit PR.

- [ ] **Step 1: Teach the e2e mock the lookup route**

In `e2e/paykit-mock.ts`, add to `MockStore`, after `getById`:

```ts
  getByOrderRef(orderRef: string): MockTransaction | undefined {
    return this.byOrderRef.get(orderRef);
  }
```

Add after `handleStatus`:

```ts
function handleLookup(store: MockStore, orderRef: string | null, send: Send) {
  if (!orderRef) {
    send(400, { error: "order_ref is required" });
    return;
  }
  const tx = store.getByOrderRef(orderRef);
  if (!tx) {
    send(404, { error: "Not found" });
    return;
  }
  send(200, statusBody(tx));
}
```

In the request handler, directly after the `POST /api/v1/checkout` branch, add:

```ts
if (req.method === "GET" && url.pathname === "/api/v1/checkout") {
  handleLookup(store, url.searchParams.get("order_ref"), send);
  return;
}
```

- [ ] **Step 2: Update the README and changelog**

In `src/lib/paykit/README.md`, in the `client.ts` bullet, after the `getCheckoutStatus(id)` clause, add:

```markdown
`getCheckoutByOrderRef(orderRef)` (finds the transaction paykit already
holds for an order, without creating one; a 404 means paykit has none),
```

and add two bullets after the `saved-vendor-payment.test.ts` bullet:

```markdown
- `transaction-for-order.ts` — `transactionIdForOrder({vendorId, amountCents,
orderRef})`: the paykit transaction id for an order. qkit stores none, so
  every action that claims, undoes or confirms a payment gets it here. It
  looks the transaction up and creates a checkout only when paykit has none
  (404) or has no lookup route (405). Creating re-renders from the vendor's
  current payment config and is refused once that config changed, so calling
  create first left an order already awaiting payment impossible to settle.
  A found transaction whose amount differs from the order's is refused.
- `transaction-for-order.test.ts` — found, amount mismatch, the two fallback
  statuses, a failed fallback, and that any other lookup failure creates
  nothing.
```

In the Connectivity section, replace "`createCheckout`/`claimCheckout`/`unclaimCheckout`, customer side" with "`createCheckout` on the pay page; `transactionIdForOrder` then `claimCheckout`/`unclaimCheckout` in the actions, customer side", and replace "(`confirmOrderPayment`, vendor side)" with "(`confirmOrderPayment` and `confirmPaymentAndStart`, through `transactionIdForOrder`, vendor side)".

In `CHANGELOG.md`, under `## [Unreleased]` and its `### Fixed` heading, add:

```markdown
- Confirming a payment, recording one, and undoing "I've paid" no longer
  fail for an order that was already awaiting payment when the vendor edited
  their payment details. qkit now looks the order's paykit transaction up
  instead of creating the checkout again.
```

- [ ] **Step 3: Run the full gate**

Run: `pnpm check && pnpm test`
Expected: both exit 0. The suite takes about 13 minutes on this machine; run it in the background and wait for it.

- [ ] **Step 4: Run e2e if local Supabase is available**

Run: `pnpm test:e2e`
Expected: PASS. If Docker or local Supabase is not running, do not start or reset anything; record in the PR that e2e was not run locally and leave it to CI.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add e2e/paykit-mock.ts src/lib/paykit/README.md CHANGELOG.md
git commit -m "test: e2e paykit mock answers the order-ref lookup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/pensive-hugle-5d16bb
gh pr create --repo merqo-io/Qkit --base main --title "fix: settle payments after a vendor edits payment details" --body "$(cat <<'EOF'
## What

- qkit finds an order's paykit transaction with the new `GET /api/v1/checkout?order_ref=` instead of calling create-checkout again.
- One helper, `transactionIdForOrder`, used by `confirmOrderPayment`, `confirmPaymentAndStart`, `claimPayment` and `unclaimPayment`.
- Adds the separation design and this phase's plan under `docs/superpowers/`.

## Why

Create-checkout re-renders from the vendor's current payment config and answers 409 once that config changed. An order already awaiting payment then could not be confirmed, recorded or undone. Found by reading the code; the new tests reproduce it against a mocked 409.

## Safe to deploy before or after paykit

The helper falls back to create-checkout when the lookup answers 404 or 405, so against a paykit without the route qkit behaves as it does today. The fix only takes effect once paykit's PR is live. **Merge after merqo-io/paykit's "look up a checkout by order reference" PR is deployed.**

## Not changed

- The pay page still calls create-checkout, since it needs the view to render.
- No migration.

## Verified

- `pnpm check && pnpm test` pass locally.
- e2e: state here whether `pnpm test:e2e` ran locally.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Edit the e2e line in the body to say what actually happened. Do not merge. Report both PR URLs to the owner, with the merge order: paykit first, deployed, then qkit.

- [ ] **Step 6: After both are live, check on a preview or production**

Only on the owner's go-ahead, and only on the booth "TEST · PayNow":

1. Place a QR order, upload any screenshot, tap "I've paid".
2. On the board, tap "Confirm payment received". Expected: the ticket shows paid, and the customer page shows "Payment confirmed".

Do not type or change any payment identifier to reproduce the 409 live; the mocked tests cover that path. Do not place a QR order on "TEST · Printing". Complete or collect the test order afterwards.

---

## Amendment after the whole-branch review (2026-10-11)

The code in Tasks 1, 2, 5 and 6 above is the plan as first written. The whole-branch review of the qkit branch found that the lookup path dropped a guard create-checkout's replay check gave: it compared the transaction's vendor with the calling vendor. qkit's `orders_admin_select` policy lets an admin account read another vendor's order through the session client, so without that guard such an account could confirm another vendor's transaction in paykit.

What changed as a result, and what the shipped code does beyond the task text above:

- paykit: the lookup response carries `vendor_id` (schema, column list, mapping, tests, contract sample).
- qkit: `getCheckoutByOrderRef` validates the lookup body with its own schema, which requires `vendor_id`, and returns it as `vendorId`. `transactionIdForOrder` refuses a found transaction whose `vendorId` differs from `args.vendorId`, beside the amount check. The e2e mock returns `vendor_id`.
- The spec's P1 section and contract are updated to match.

A second change came out of the paykit whole-branch review. Task 3's rule (`/^[0-9A-Za-z]{8,9}[A-Za-z]$/`) rejects a PayNow Corporate proxy that carries a 3-character suffix after the UEN, which paykit's old rule accepted for a 9-character UEN. paykit ships `/^[0-9A-Za-z]{8,9}[A-Za-z](?:[0-9A-Za-z]{3})?$/` instead. It still rejects an 8-digit mobile number and any all-digit value. qkit's own rule is unchanged.
