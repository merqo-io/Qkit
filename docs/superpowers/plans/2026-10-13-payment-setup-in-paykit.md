# Payment Setup Lives in Paykit (Separation P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor enters payment details in paykit only. qkit's booth Payment section becomes a switch, a one-line read-only summary and one link to paykit's config page, which offers a way back to the booth after a save.

**Architecture:** paykit's `dashboard/config` page reads an optional `return_to` query value, keeps it only when it is an https URL on a Merqo family host, and shows it as a "Back to your booth" link once a save succeeds. qkit reads `GET /api/v1/vendors/{id}/config` server-side into a small `PaymentSetup` value (five states), renders it read-only, and `saveBooth` writes the booth's `{kind}` marker from the form's switch plus the kind paykit reports at save time. qkit stops writing paykit's config and stops validating payment fields.

**Tech Stack:** Next.js 16 server components, server actions and client components, TypeScript strict, Zod 3, Vitest with React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, sections "The boundary", the Payments audit table, "Problems found" items 2 and 4, "Decision 1" (the owner chose A on 2026-10-10) and "P4. Payment setup lives in paykit".

## What changed since the audit

The spec was audited at qkit `4b05c8b` and paykit `a32c6c3`. Re-read on 2026-10-13 at qkit `098f052` and paykit `a5cf73b`. All from reading code; nothing below was run against a live deployment.

- P1 (qkit#215, paykit#126), R1 (qkit#220, printkit#34) and P2 (qkit#223, paykit#130) are merged. Every qkit file the spec cites for P4 still exists as described: `payment-section.tsx` (402 lines now), `paymentConfigSchema` and `stripeConfigSchema` in `src/lib/schemas.ts`, `upsertVendorConfig` and `getVendorConfig` in `src/lib/paykit/client.ts`, `src/lib/paykit/saved-vendor-payment.ts`, and the paykit read in `sweep-unsaved-uploads.ts`.
- **paykit's own config form already uploads the pointer QR image to `vendor-images`, not `booth-images`** (`payment-config-form.tsx`, `bucket="vendor-images"`, since before the audit). The only uploader that writes a payment QR into `booth-images` is qkit's `PaymentSection`, which this plan deletes. So the spec's paykit bullet "the pointer QR image uploads to paykit's own storage" needs no new upload code: this plan pins the existing target with a test. See "Decisions taken while planning", item 1.
- `vendor-images` is not created by a paykit migration. loopkit's migrations create it (`0017`, limits in `0047`), and paykit's profile page already uploads avatars to it. All kits share one Supabase project.
- paykit has no existing "Merqo family origin" helper. Its only redirect guard is `auth/callback`'s same-origin `next` check. `@merqo/ui`'s `KIT_FAMILY` lists the production hosts: `https://<slug>.merqo.io`.
- paykit's dashboard `getVendorSession()` redirects a signed-out vendor to `/login` with no return path, so a vendor who is not signed in to paykit loses `return_to`. Not changed here.
- `e2e/paykit-mock.ts` answers the checkout routes only. It never served the vendor config route, and qkit's e2e never saves a booth. It needs no change.
- Open PRs on 2026-10-13: none on `merqo-io/Qkit`, none on `merqo-io/paykit`. paykit has a local worktree `payment-evidence` on branch `spike/server-ocr` (the P3 session). It is not touched.

## Global Constraints

- Two repos, two PRs. paykit first (Tasks 1 to 3), merged and deployed to production; then qkit (Tasks 4 to 8). The qkit PR is not opened before paykit's is merged and live.
- Before starting work in a repo, run `gh pr list --repo merqo-io/<repo> --state open`. Never edit, rebase or merge a PR that is not from this plan. P3 may be in flight: it touches `src/lib/paykit/client.ts`, `e2e/paykit-mock.ts` and `CHANGELOG.md` in qkit. Keep edits to those small and local, and merge `main` in when P3 lands.
- Feature branch per repo, never `main`. No `--no-verify`, no hook bypass. Do not merge either PR unless the owner says so.
- No migration in either repo. No change to `qkit.place_order` or `qkit.place_walkup_order`. The booth `{kind}` marker keeps being written.
- An image already stored in qkit's `booth-images` and named by paykit's config is not moved or deleted by this work.
- Never read or write `.env*` or `secrets/**`. The agent types no payment identifier (UEN, mobile number, payment link) anywhere.
- `AGENTS.md`, `CLAUDE.md`, `Dockerfile`, `.claude/settings.json`, `.claude/hooks/*`, `docs/CONSTITUTION.md` are protected. This plan does not edit them. Replacement wording for qkit's `AGENTS.md` is drafted for the owner in Task 8.
- TypeScript strict: no `any`, no `@ts-ignore`. Zod at every boundary. The service-role client is used only in route handlers and server actions.
- paykit CI gates: changed-line coverage at least 80%, `CHANGELOG.md` touched when `src/` changes, the `README.md` of every folder with a changed file touched (the root `README.md` too, because `CHANGELOG.md` is at the root), and no change-narration comments (do not start a comment with "was", "added", "removed", "changed", "updated", "renamed", "moved", a date or a ticket reference).
- qkit lint gates: no inline (trailing) comments, no commented-out code, no em dash in user-facing copy, three or more near-identical `it(...)` blocks must be `it.each`.
- Imports by full path, no barrel files. Never pass a function or component reference from a Server Component to a `@merqo/ui` component.
- Commit messages follow Conventional Commits, are passed with `git commit -F <file>`, and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `pnpm check && pnpm test` must pass in a repo before its PR is opened. One full test suite at a time on this machine. A push runs the suite again (13 to 16 minutes in qkit, about 10 in paykit): run it in the background with a 600000 ms timeout and keep the whole log in the scratchpad. Commit before ending a turn, because the Stop hook runs the suite on a dirty tree. Never switch branches in a checkout while its push is testing.
- No local Supabase exists on this machine, so qkit's e2e cannot run locally. Say so in the PR.
- Do not place a QR order on the production booth "TEST · Printing".

## Review Focus

1. **`return_to` names a host that only looks like the family** (`https://merqo.io.evil.example`, `https://evilmerqo.io`, `https://qkit.merqo.io@evil.example`, `//evil.example`, `javascript:`). Expected: no back link is shown, the page works as before. Pinned in Task 1.
2. **paykit cannot be reached while a booth is saved with the switch on.** Expected: the booth saves, and `payment` is left out of the update so the stored marker stays. Pinned in Task 6.
3. **The switch is on but paykit has no config** (the vendor never set one up, or the page was opened before paykit answered). Expected: the marker is written as null, so no new order owes a payment nobody can make. Pinned in Task 6.
4. **The booth's marker names a different kind from the one paykit holds** (Problem 4). Expected: the next save of that booth writes paykit's kind. Pinned in Task 6.
5. **A vendor whose live payment QR image is in `booth-images`** (uploaded through qkit before this change). Expected: the abandoned-upload sweep still treats it as referenced and never deletes it. Pinned in Task 7.

Known and accepted, not changed here:

- A qkit preview on a `*.vercel.app` host gets no "Back to your booth" link in paykit, because that host is not a family host. Anyone can deploy to `vercel.app`, so it cannot be allowed. The return link is checked on production.
- A vendor who is not signed in to paykit is sent to its login page and loses `return_to`.
- The link to paykit opens in the same tab. A booth form with unsaved changes raises the browser's own "leave site?" prompt first (`useUnsavedChanges`).
- Problem 4 is narrowed, not removed: a booth's marker is refreshed only when that booth is saved.
- paykit's `POST /api/v1/vendors/{id}/config` stays. qkit's production deployment calls it until the qkit PR ships; removing it is a later paykit cleanup.

## Decisions taken while planning

The spec fixes what P4 does. These are details it leaves open, or where the code found on 2026-10-13 differs from what the spec assumed.

1. **"paykit's own storage" is the `vendor-images` bucket paykit already uploads to.** A bucket of paykit's own would need a migration (a `storage.buckets` row and policies), and P4 allows none in either repo. What P4 removes is the dependency on qkit's storage, and deleting qkit's uploader does that. paykit's cleanup keeps `booth-images` in its list so a legacy image is still removed when the vendor replaces it.
2. **The sweep keeps its paykit read. This departs from the spec's delete list.** The spec lists "the payment QR path in `sweep-unsaved-uploads.ts`" under Deleted. The same spec says an image already in `booth-images` keeps its URL in paykit's config until the vendor replaces it. Removing the read would let the sweep delete that live image once it is older than the grace window, and checkout for that vendor would show a broken QR. The read stays, with its comment rewritten to say it now protects legacy images only. It can go once no paykit config names a `booth-images` URL.
3. **Which hosts count as the Merqo family.** `https` only, host `merqo.io` or any subdomain of it, no credentials in the URL, no explicit port. Outside production, `http://localhost` and `http://127.0.0.1` on any port are also accepted so the flow can be run locally. No environment variable.
4. **Where `return_to` comes from in qkit.** The browser: `window.location.origin + pathname + search`, read in the client component. qkit has no reliable server-side notion of its own public origin (`NEXT_PUBLIC_BASE_URL` was found unreliable; the order page derives it from request headers behind an allow-list).
5. **What the summary shows.** The kind and the vendor's own display name for it (PayNow payee name, or the pointer label). No UEN, mobile number or link is sent to the browser.
6. **When the switch is disabled.** With nothing on file (there is nothing to take payment with) and when paykit cannot be reached (a save would keep the stored marker whatever the switch says). In both cases the reason is stated in one line under it.
7. **One link.** The old "Manage payments, transactions & refunds in paykit" link is removed. The section's single link goes to paykit's config page.

## File Structure

paykit (worktree `C:\Users\Clarence\Desktop\Coding\Merqo Business\paykit\.claude\worktrees\config-return-to`, branch `feat/config-return-to`):

| File                                                                                   | Responsibility                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/return-to.ts` (create)                                                        | `familyReturnUrl`: the one place that decides a `return_to` is safe |
| `src/lib/return-to.test.ts` (create)                                                   | Unit tests, including every look-alike host in Review Focus 1       |
| `src/app/dashboard/config/page.tsx`, `page.dom.test.tsx` (modify)                      | Reads `return_to`, passes the validated URL (or null) to the form   |
| `src/app/dashboard/config/payment-config-form.tsx`, its DOM tests (modify)             | Shows "Back to your booth" after a successful save                  |
| `src/app/dashboard/config/payment-config-form.qr.dom.test.tsx` (modify)                | Pins the QR upload bucket                                           |
| `src/lib/qr-image-cleanup.ts` (modify, comment only)                                   | Says why `booth-images` is still in the list                        |
| `README.md`, `CHANGELOG.md`, `src/lib/README.md`, `src/app/dashboard/config/README.md` | Required by CI                                                      |

qkit (this worktree, branch `claude/peaceful-yalow-cca42d`):

| File                                                                             | Responsibility                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/paykit/payment-setup.ts`, `.test.ts` (create)                           | `vendorPaymentSetup`: paykit's config as one of five display states   |
| `src/lib/paykit/saved-vendor-payment.ts`, `.test.ts` (delete)                    | Replaced by the above                                                 |
| `src/lib/paykit/client.ts`, `client.test.ts` (modify)                            | `upsertVendorConfig` and its types removed                            |
| `src/lib/schemas.ts`, `schemas.test.ts` (modify)                                 | `paymentMarkerSchema` replaces `paymentConfigSchema`; `takes_payment` |
| `src/lib/types.ts` (modify)                                                      | `PaymentKind` loses `stripe`; `PaymentConfig` removed                 |
| `src/lib/payment-marker.ts`, `.test.ts` (modify)                                 | Reads the marker through the schema; no `stripe`                      |
| `src/app/dashboard/booths/payment-section.tsx`, its DOM test (rewrite)           | Switch, summary, one link                                             |
| `src/app/dashboard/booths/booth-form.tsx`, its two DOM tests (modify)            | Holds `takesPayment`; no payment QR upload                            |
| `src/app/dashboard/booths/actions.ts`, `actions.test.ts` (modify)                | `saveBooth` writes the marker from the switch and paykit's kind       |
| `src/app/dashboard/booths/[boothId]/page.tsx`, `new/page.tsx`, their DOM tests   | Pass `paymentSetup` and the marker's on/off state                     |
| `src/app/dashboard/booths/sweep-unsaved-uploads.ts`, `.test.ts` (modify)         | Comment and one test name: the paykit read protects legacy images     |
| READMEs of each folder above, `CHANGELOG.md`, `docs/superpowers/plans/README.md` | Docs                                                                  |

---

## Part 1: paykit

### Task 1: `familyReturnUrl`

**Files:**

- Create: `src/lib/return-to.ts`
- Create: `src/lib/return-to.test.ts`

**Interfaces:**

- Produces: `familyReturnUrl(raw: unknown): string | null`. Returns the normalised `URL.href` when `raw` is a string of at most 2000 characters that parses as an absolute URL on a Merqo family host; otherwise null. Never throws.

- [ ] **Step 1: Create the paykit worktree and install**

```bash
cd "/c/Users/Clarence/Desktop/Coding/Merqo Business/paykit"
gh pr list --repo merqo-io/paykit --state open
git fetch origin
git worktree add .claude/worktrees/config-return-to -b feat/config-return-to origin/main
cd .claude/worktrees/config-return-to
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/return-to.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { familyReturnUrl } from "./return-to";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("familyReturnUrl", () => {
  it.each([
    [
      "a kit's booth page",
      "https://qkit.merqo.io/dashboard/booths/b1",
      "https://qkit.merqo.io/dashboard/booths/b1",
    ],
    [
      "a path with a query",
      "https://qkit.merqo.io/dashboard/booths/new?mode=event",
      "https://qkit.merqo.io/dashboard/booths/new?mode=event",
    ],
    ["the apex host", "https://merqo.io/x", "https://merqo.io/x"],
    ["a mixed-case host", "https://QKIT.Merqo.IO/x", "https://qkit.merqo.io/x"],
    [
      "a backslash, which the parser reads as a path",
      "https://qkit.merqo.io\\@evil.example/x",
      "https://qkit.merqo.io/@evil.example/x",
    ],
  ])("accepts %s", (_, raw, expected) => {
    expect(familyReturnUrl(raw)).toBe(expected);
  });

  it.each([
    [
      "a host that only starts with the family name",
      "https://merqo.io.evil.example/x",
    ],
    ["a host that only ends with the letters", "https://evilmerqo.io/x"],
    [
      "credentials that hide the real host",
      "https://qkit.merqo.io@evil.example/x",
    ],
    ["credentials on a family host", "https://user:pw@qkit.merqo.io/x"],
    ["a scheme-relative URL", "//evil.example/x"],
    ["a relative path", "/dashboard/booths/b1"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,x"],
    ["plain http on a family host", "http://qkit.merqo.io/x"],
    ["an explicit port", "https://qkit.merqo.io:8443/x"],
    ["a trailing-dot host", "https://qkit.merqo.io./x"],
    ["a preview host", "https://qkit-git-x-team.vercel.app/x"],
    ["an empty string", ""],
    [
      "a repeated parameter",
      ["https://qkit.merqo.io/x", "https://qkit.merqo.io/y"],
    ],
    ["nothing", undefined],
    ["a number", 42],
    ["an overlong value", `https://qkit.merqo.io/${"a".repeat(2000)}`],
  ])("rejects %s", (_, raw) => {
    expect(familyReturnUrl(raw)).toBeNull();
  });

  it("accepts a local qkit outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(familyReturnUrl("http://localhost:3000/dashboard/booths/b1")).toBe(
      "http://localhost:3000/dashboard/booths/b1",
    );
    expect(familyReturnUrl("http://127.0.0.1:3000/x")).toBe(
      "http://127.0.0.1:3000/x",
    );
  });

  it("rejects localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(familyReturnUrl("http://localhost:3000/x")).toBeNull();
    expect(familyReturnUrl("https://localhost/x")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/return-to.test.ts`
Expected: FAIL, cannot resolve `./return-to`.

- [ ] **Step 4: Write the helper**

Create `src/lib/return-to.ts`:

```ts
const FAMILY_APEX = "merqo.io";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const MAX_LENGTH = 2000;

function isFamilyHost(url: URL): boolean {
  if (url.protocol !== "https:" || url.port !== "") return false;
  return (
    url.hostname === FAMILY_APEX || url.hostname.endsWith(`.${FAMILY_APEX}`)
  );
}

function isLocalDevHost(url: URL): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/**
 * The address a page may offer as a way back to the Merqo app that sent the
 * vendor here, or null when the value is not one. The value comes from the
 * query string, so anyone can put anything in it: without this check a link
 * to paykit could carry a "Back" button to any site.
 *
 * Accepted: an https URL on merqo.io or one of its subdomains, with no
 * credentials and no explicit port. Outside production, http on localhost is
 * accepted too, so the round trip can be run locally. A preview deployment on
 * vercel.app is not a family host, because anyone can deploy there.
 *
 * Returns the parsed URL's own serialisation, never the raw text.
 */
export function familyReturnUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH)
    return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  return isFamilyHost(url) || isLocalDevHost(url) ? url.href : null;
}
```

- [ ] **Step 5: Run the tests to verify they pass, then commit**

Run: `pnpm vitest run src/lib/return-to.test.ts`
Expected: PASS.

Commit: `feat: decide which return addresses belong to the Merqo family`

### Task 2: The config page offers the way back after a save

**Files:**

- Modify: `src/app/dashboard/config/page.tsx`
- Modify: `src/app/dashboard/config/page.dom.test.tsx`
- Modify: `src/app/dashboard/config/payment-config-form.tsx`
- Modify: `src/app/dashboard/config/payment-config-form.dom.test.tsx`
- Modify: `src/app/dashboard/config/payment-config-form.qr.dom.test.tsx`
- Modify: `src/lib/qr-image-cleanup.ts` (comment only)

**Interfaces:**

- Consumes: `familyReturnUrl` from Task 1.
- Produces:
  - `ConfigPage({ searchParams }: { searchParams: Promise<{ return_to?: string | string[] }> })`.
  - `PaymentConfigForm` gains an optional prop `returnTo?: string | null`. When it is a string and the last save succeeded, the form renders a link named "Back to your booth" with that `href`.

- [ ] **Step 1: Write the failing page tests**

In `page.dom.test.tsx`, call the page as `ConfigPage({ searchParams: Promise.resolve({}) })` in the two existing tests, and add:

```tsx
it.each([
  [
    "a family address",
    "https://qkit.merqo.io/dashboard/booths/b1",
    "https://qkit.merqo.io/dashboard/booths/b1",
  ],
  ["an address outside the family", "https://evil.example/x", null],
  ["no address", undefined, null],
])("passes %s to the form as the way back", async (_, raw, expected) => {
  getConfigMock.mockResolvedValue(null);

  render(
    await ConfigPage({ searchParams: Promise.resolve({ return_to: raw }) }),
  );

  expect(PaymentConfigFormMock).toHaveBeenCalledWith(
    expect.objectContaining({ returnTo: expected }),
    undefined,
  );
});
```

- [ ] **Step 2: Write the failing form tests**

In `payment-config-form.dom.test.tsx` add:

```tsx
describe("PaymentConfigForm way back", () => {
  const RETURN_TO = "https://qkit.merqo.io/dashboard/booths/b1";

  async function save(returnTo: string | null, status: "ok" | "error") {
    saveConfigActionMock.mockResolvedValue(
      status === "ok" ? { status } : { status, message: "Nope" },
    );
    const user = userEvent.setup();
    render(
      <PaymentConfigForm initial={null} vendorId="v1" returnTo={returnTo} />,
    );
    await user.click(
      screen.getByRole("button", { name: /save payment config/i }),
    );
    await waitFor(() => expect(saveConfigActionMock).toHaveBeenCalled());
  }

  it("offers the way back once a save succeeds", async () => {
    await save(RETURN_TO, "ok");

    expect(
      await screen.findByRole("link", { name: "Back to your booth" }),
    ).toHaveAttribute("href", RETURN_TO);
  });

  it("offers no way back before a save", () => {
    render(
      <PaymentConfigForm initial={null} vendorId="v1" returnTo={RETURN_TO} />,
    );

    expect(
      screen.queryByRole("link", { name: "Back to your booth" }),
    ).toBeNull();
  });

  it("offers no way back when the save fails", async () => {
    await save(RETURN_TO, "error");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Back to your booth" }),
    ).toBeNull();
  });

  it("offers no way back when the page was given none", async () => {
    await save(null, "ok");

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Back to your booth" }),
    ).toBeNull();
  });
});
```

In `payment-config-form.qr.dom.test.tsx`, make the `ImageUploader` stand-in record its `bucket` prop and add a test that picking a QR renders an uploader whose bucket is `vendor-images`.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run src/app/dashboard/config`
Expected: FAIL on the new cases.

- [ ] **Step 4: Implement**

`page.tsx`:

```tsx
import { getVendorSession } from "@/lib/vendor-session";
import { familyReturnUrl } from "@/lib/return-to";
import { getConfig } from "./actions";
import { PaymentConfigForm } from "./payment-config-form";

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string | string[] }>;
}) {
  const { user } = await getVendorSession();
  const [config, { return_to }] = await Promise.all([getConfig(), searchParams]);
  ...
        <PaymentConfigForm
          initial={config}
          vendorId={user.id}
          returnTo={familyReturnUrl(return_to)}
        />
```

`payment-config-form.tsx`: add `returnTo = null` to the props, and replace the "Saved." paragraph with:

```tsx
{
  state.status === "ok" && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="text-sm font-medium text-mint">Saved.</p>
      {returnTo && (
        <a
          href={returnTo}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to your booth
        </a>
      )}
    </div>
  );
}
```

`qr-image-cleanup.ts`: rewrite the comment above `QR_IMAGE_BUCKETS` to say a QR image is uploaded to `vendor-images` by paykit's own form, and that `booth-images` stays in the list for images a vendor uploaded through qkit's booth form, which that form no longer does.

- [ ] **Step 5: Run to verify they pass, then commit**

Run: `pnpm vitest run src/app/dashboard/config src/lib/qr-image-cleanup.test.ts`
Expected: PASS.

Commit: `feat: the payment setup page offers the way back to the booth after a save`

### Task 3: paykit docs, gate, PR

- [ ] **Step 1: READMEs and changelog**

`src/lib/README.md`: one line for `return-to.ts`; amend the `qr-image-cleanup.ts` line. `src/app/dashboard/config/README.md`: a "Way back" section (what `return_to` is, who validates it, when the link shows) and a note under "Deferred QR upload" that the bucket is `vendor-images` and is pinned by a test. Root `README.md`: one paragraph. `CHANGELOG.md` under `[Unreleased]`, `### Added`.

After editing READMEs, check that no byte was rewritten as U+FFFD: `git diff origin/main | grep -c $'\xef\xbf\xbd'` must print 0.

- [ ] **Step 2: Full gate**

Run: `pnpm check`, then `pnpm exec vitest --run --coverage`. Expected: exit 0 on both. Nothing else heavy may run at the same time.

- [ ] **Step 3: Push and open the PR**

Push in the background (the pre-push hook runs the gate again). Open the PR against `main` on `merqo-io/paykit`. Do not merge it. Report the URL to the owner and stop until it is merged and deployed.

---

## Part 2: qkit

All steps run from this worktree. Before Task 4: sync `main` with the app's `sync_with_base_branch` tool, `gh pr list --repo merqo-io/Qkit --state open`, and `pnpm install --frozen-lockfile` if the lockfile moved.

### Task 4: `vendorPaymentSetup` replaces `savedVendorPayment`

**Files:**

- Create: `src/lib/paykit/payment-setup.ts`, `src/lib/paykit/payment-setup.test.ts`
- Delete: `src/lib/paykit/saved-vendor-payment.ts`, `src/lib/paykit/saved-vendor-payment.test.ts` (in Task 6, once nothing imports them)

**Interfaces:**

- Consumes: `getVendorConfig(vendorId)` from `./client` (unchanged).
- Produces:

  ```ts
  export type PaymentSetup =
    | { state: "unreachable" }
    | { state: "none" }
    | { state: "paynow"; name: string }
    | { state: "link"; name: string }
    | { state: "image"; name: string };

  export type PaymentSetupKind = "paynow" | "pointer" | null;

  export function vendorPaymentSetup(vendorId: string): Promise<PaymentSetup>;
  export function setupKind(setup: PaymentSetup): PaymentSetupKind;
  ```

  `unreachable`: the call answered `ok: false` (paykit down, a non-2xx, an unexpected body, or `PAYKIT_KIT_SECRET` unset). `none`: no config, a config of no known kind, or a pointer with neither a link nor an image. `name` is the PayNow payee name or the pointer label, `""` when paykit holds none. `setupKind` maps `paynow` to `"paynow"`, `link` and `image` to `"pointer"`, and the other two to null.

- [ ] **Step 1: Failing tests** for each of the five states, the three `none` causes, and `setupKind`. Mock `./client`'s `getVendorConfig`.
- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit:** `feat: read a vendor's payment setup from paykit as a display state`

### Task 5: The Payment section goes thin

**Files:**

- Rewrite: `src/app/dashboard/booths/payment-section.tsx`
- Rewrite: `src/app/dashboard/booths/payment-section.dom.test.tsx`

**Interfaces:**

- Consumes: `PaymentSetup` (Task 4).
- Produces:

  ```ts
  export function PaymentSection(props: {
    setup: PaymentSetup;
    value: boolean;
    onChange: (next: boolean) => void;
  }): JSX.Element;
  ```

  Copy, exact:

  | State         | Switch            | Line under the switch                                                         | Link text                            |
  | ------------- | ----------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
  | `none`        | off, disabled     | `No payment details on file yet.`                                             | `Set up payments in paykit →`        |
  | `paynow`      | `value`           | `On file in paykit: PayNow QR, paid to <name>`                                | `Change payment details in paykit →` |
  | `link`        | `value`           | `On file in paykit: payment link, "<name>"`                                   | `Change payment details in paykit →` |
  | `image`       | `value`           | `On file in paykit: your own QR image, "<name>"`                              | `Change payment details in paykit →` |
  | `unreachable` | `value`, disabled | `Can't reach paykit right now. This booth keeps its current payment setting.` | `Open payment setup in paykit →`     |

  With an empty `name` the line ends after the kind (`On file in paykit: PayNow QR`). The switch's accessible name is `Take payment for orders at this booth`. The link is a plain same-tab `<a>` to `<NEXT_PUBLIC_PAYKIT_URL or https://paykit-sg.vercel.app>/dashboard/config`, with `?return_to=<current page URL>` once the component has mounted in a browser. The section renders no input for a payee, UEN, mobile number, link or image.

- [ ] **Step 1: Failing DOM tests**: the three on-file states (`it.each`), nothing on file, unreachable, the switch calling `onChange`, a disabled switch never calling it, the link's `href` carrying the encoded current URL, and "renders no payment detail field" (no textbox, no radio, no file input).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `return_to` is read with `useSyncExternalStore` (server snapshot null), so the server render and the first client render agree.
- [ ] **Step 4: Run, expect PASS. Commit:** `feat: the booth Payment section is a switch, a summary and a link to paykit`

### Task 6: `saveBooth` writes the marker from the switch and paykit's kind

**Files:**

- Modify: `src/lib/schemas.ts`, `src/lib/schemas.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/payment-marker.ts`, `src/lib/payment-marker.test.ts`
- Modify: `src/lib/paykit/client.ts`, `src/lib/paykit/client.test.ts`
- Modify: `src/app/dashboard/booths/actions.ts`, `actions.test.ts`
- Modify: `src/app/dashboard/booths/booth-form.tsx`, `booth-form.dom.test.tsx`, `booth-form.images.dom.test.tsx`
- Modify: `src/app/dashboard/booths/[boothId]/page.tsx`, `[boothId]/page.dom.test.tsx`, `new/page.tsx`, `new/page.dom.test.tsx`
- Delete: `src/lib/paykit/saved-vendor-payment.ts`, `.test.ts`

**Interfaces:**

- Consumes: `vendorPaymentSetup`, `setupKind`, `PaymentSetup` (Task 4); `PaymentSection` (Task 5).
- Produces:
  - `paymentMarkerSchema = z.object({ kind: z.enum(["pointer", "paynow"]) })` in `src/lib/schemas.ts`. `paymentConfigSchema`, `pointerConfigSchema`, `paynowConfigSchema`, `stripeConfigSchema` and `PaymentConfigInput` are deleted.
  - `boothFormSchema`: `payment` is replaced by `takes_payment: z.boolean().default(false)`.
  - `PaymentKind = "pointer" | "paynow"`. `PaymentConfig` is deleted. `payment_method_kind`'s tolerant read in `schemas.ts` drops `stripe` (an unknown kind already degrades to null).
  - `paymentKindOf(data)` parses with `paymentMarkerSchema` and returns null for anything else, `stripe` included. `expectsPayment(kind)` is `kind !== null`. `paymentMarker(kind: PaymentKind | null)` returns `{ kind }` or null.
  - `upsertVendorConfig`, `VendorConfigWrite`, `VendorConfigResponse` and `vendorConfigResponseSchema` are deleted from the client.
  - `BoothForm` props: `savedPayment` is replaced by `paymentSetup: PaymentSetup`; `initial.payment` by `initial.takes_payment: boolean`.
  - `saveBooth` marker rule, in a helper `paymentPatch(vendorId, takesPayment)` returning `{ payment?: { kind: PaymentKind } | null }`:

    | Switch | paykit answers        | `payment` in the row                                                   |
    | ------ | --------------------- | ---------------------------------------------------------------------- |
    | off    | not asked             | `null`                                                                 |
    | on     | `paynow` or `pointer` | `{ kind }` as paykit reports it                                        |
    | on     | no config             | `null`                                                                 |
    | on     | unreachable           | key left out: an update keeps the stored marker, an insert stores none |

- [ ] **Step 1: Failing action tests** for the four rows above (the unreachable row twice: update and insert), for "the booth still saves when paykit is unreachable", for Review Focus 4 (stored `paynow`, paykit says `pointer`, row carries `pointer`), and that `saveBooth` never calls a paykit write. Replace the existing `upsertVendorConfig` tests.
- [ ] **Step 2: Failing schema, marker and page tests.** Edit page: `takes_payment` follows the booth's marker only (a vendor-wide config never switches a booth on), and `paymentSetup` is passed through. New page: `takes_payment` is absent and the form opens off.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement**, in this order so the type checker leads: schemas and types, marker, client, actions, form, pages, then delete `saved-vendor-payment.*`. In `booth-form.tsx` remove `qrImageOf`, `withQrImage` and the QR entry in `commitImages`. In `actions.ts` remove the `persisted` set (nothing reaches paykit before the row is written any more) and reword the `freshUploads` comments to name the banner only.
- [ ] **Step 5: Run the touched tests, then `pnpm check`. Commit:** `feat: a booth's payment marker comes from its switch and paykit's kind`

### Task 7: The sweep says what its paykit read is for

**Files:**

- Modify: `src/app/dashboard/booths/sweep-unsaved-uploads.ts` (doc comment)
- Modify: `src/app/dashboard/booths/sweep-unsaved-uploads.test.ts`

- [ ] **Step 1:** Add a test: an old object in the vendor's folder that paykit's config names as `qrImageUrl` is not deleted (Review Focus 5). If an equivalent test exists, rename it to say "a payment QR uploaded before payment setup moved to paykit".
- [ ] **Step 2:** Rewrite the function's doc comment: the booth form no longer uploads a payment QR; the paykit read stays because a vendor's live QR may still be an object in this bucket, and it can be removed once no paykit config names a `booth-images` URL.
- [ ] **Step 3: Run, expect PASS. Commit:** `docs: the upload sweep keeps protecting payment QR images stored before the move`

### Task 8: qkit docs, gate, PR

- [ ] **Step 1: READMEs and changelog.** `src/app/dashboard/booths/README.md`, `src/app/dashboard/booths/[boothId]/README.md` and `new/README.md` if present, `src/lib/README.md`, `src/lib/paykit/README.md`, `CHANGELOG.md` (`### Changed` and `### Removed` under `[Unreleased]`, placed away from any P3 entry).
- [ ] **Step 2: Draft the `AGENTS.md` replacement wording** for the owner (the "Payments route through paykit" data-model bullet, "paykit checkout cutover" and "Follow-up gaps closed"). Put it in the PR description and in chat. Do not edit `AGENTS.md`.
- [ ] **Step 3: Full gate.** `pnpm check`, then `pnpm test`, one suite at a time.
- [ ] **Step 4:** Confirm the paykit PR is merged and its production deployment is live, merge `main` in, push in the background, open the PR against `main` on `merqo-io/Qkit`. Do not merge it.
- [ ] **Step 5: Hand the owner the manual check.** On a preview: open "TEST · Walk-up", turn "Take payment for orders at this booth" on, save, place a walk-up order and confirm it starts out owing payment; turn it off, save, place another and confirm it does not. The owner enters any payment identifier in paykit. No QR order on "TEST · Printing".

## What execution changed from this plan

Recorded 2026-10-13, after Tasks 1 to 7.

- Task 5 copy: a label is shown in curly quotes (`“Pay with PayLah”`), not straight ones, since a straight quote in JSX text trips the lint.
- Task 6: `failedSaveUploadPaths` lost its `persisted` parameter rather than being called with an empty set. Nothing writes a payment QR to paykit before the booth row any more, so there was nothing left to pass.
- Task 6: the action's marker rule and its tests were written together, not test-first. The other tasks ran red before green.
- Task 8, step 2: the `AGENTS.md` wording is in `2026-10-13-payment-setup-in-paykit.agents-md-wording.md`, beside this plan, so the owner can open it.
- paykit PR: merqo-io/Paykit#131.
