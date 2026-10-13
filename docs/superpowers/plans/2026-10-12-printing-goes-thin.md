# Printing Goes Thin (Separation R1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** qkit's booth Printing section becomes a switch, a status badge and one link whose address printkit supplies, so every printkit route and every piece of printer advice lives in printkit only.

**Architecture:** printkit's `GET /api/v1/print-locations/status` gains `manage_url`, an absolute link to the right printkit page for that location. qkit validates it server-side, passes it through its own session-checked route to the browser, and renders it as the section's only link. printkit's status callback gains `source_ref` beside `order_id`, and qkit's receiver accepts either. qkit stops writing and reading `booths.printkit_location_id`.

**Tech Stack:** Next.js 16 route handlers, server actions and client components, TypeScript strict, Zod 3, Vitest with React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`, sections "The boundary", the Printing audit table, and "R1. Printing goes thin". Approved by the owner on 2026-10-10.

## What changed since the audit

The spec was audited at qkit `4b05c8b` and printkit `eeb16a1`. Re-read on 2026-10-12 at qkit `b483ebe` and printkit `36d7e0f`. All from reading code; nothing below was run against a live deployment.

- Every file, route and field the spec cites for R1 still exists as described: `printing-section.tsx` (both hardcoded routes and the advice paragraph), `api/printkit/print-status/route.ts`, `syncPrintLocation` in `dashboard/booths/actions.ts` (writes `printkit_location_id`), `dashboard/booths/[boothId]/page.tsx` (reads it), printkit's `status/route.ts` and `src/lib/kit-callback.ts`.
- printkit changed only `@merqo/ui` pins and one Bluetooth setup spacing fix since the audit. No R1 file moved.
- qkit changed `printing-section.tsx` by four lines and `booth-form.tsx` (unsaved-changes prompt, #216) since the audit. Neither touches what R1 changes.
- The spec's R1 text does not mention it, but the callback body also carries a required `attempt_at` (canonical UTC, six fractional digits). It was already there at the audit. R1 leaves it alone.
- printkit already shows most of the printer advice on its picker (`/dashboard/printers/new`), but only behind tap-to-open info icons and a per-card badge. The sentence qkit shows today is not visible there as text. Task 2 adds it.
- printkit's own wording is newer than qkit's. qkit says a Bluetooth printer needs "a phone or a Raspberry Pi". printkit's copy, confirmed on a real B1 on 2026-09-22, says an Android phone, a Windows laptop, a Mac or a Raspberry Pi, and that an iPhone cannot. The advice moves in printkit's wording.
- printkit has no per-location "manage" page. The closest is that location's row on `/dashboard/printers`. See "Decisions taken while planning".
- Open PRs on 2026-10-12. printkit: none. qkit: #219 `refactor/split-board` touches `CHANGELOG.md` and `src/app/dashboard/booths/README.md`, which this plan's qkit PR also edits (docs only, no source file overlaps). #218 `docs/spec-uen-rule` edits the separation spec, which this plan does not edit.

## Global Constraints

- Two repos, two PRs. printkit first (Tasks 1 to 4), merged and deployed to production; then qkit (Tasks 5 to 9). The qkit PR does not merge before printkit's is live.
- Before starting work in a repo, run `gh pr list --repo merqo-io/<repo> --state open`. If another agent's PR touches the same files, stop and tell the owner. Never edit, rebase or merge a PR that is not from this plan.
- Feature branch per repo, never `main`. No `--no-verify`, no hook bypass. Do not merge either PR unless the owner says so.
- No migration in either repo. `booths.printkit_location_id` stays as an unused column; `src/lib/types.ts` is not edited.
- Never read or write `.env*` or `secrets/**`.
- `AGENTS.md`, `CLAUDE.md`, `Dockerfile`, `.claude/settings.json`, `.claude/hooks/*`, `docs/CONSTITUTION.md` are protected. This plan does not edit them.
- TypeScript strict: no `any`, no `@ts-ignore`. Zod at every boundary. The service-role client is used only in route handlers and server actions.
- No shared print library: print logic and printer knowledge stay in printkit only.
- printkit CI gates: changed-line coverage at least 80%, `CHANGELOG.md` touched when `src/` changes, the `README.md` of every folder with a changed file touched (the root `README.md` too, because `CHANGELOG.md` is at the root), and no change-narration comments (do not start a comment with "was", "added", "removed", "changed", "updated", "renamed", "moved", a date or a ticket reference).
- qkit lint gates: no inline (trailing) comments, no commented-out code, no em dash in user-facing copy.
- Commit messages follow Conventional Commits and end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `pnpm check && pnpm test` must pass in a repo before its PR is opened.
- One full test suite at a time on this machine. qkit's suite takes about 13 minutes; its Stop hook runs it whenever the tree has uncommitted changes, and its pre-push hook runs it on every push. Commit before ending a turn. Run a push in the background with a 600000 ms timeout and keep its whole log in the scratchpad.
- No local Supabase exists on this machine, so qkit's e2e cannot run locally. Say so in the PR.
- Do not place a QR order on the production booth "TEST · Printing". It sends a real print job. An end-to-end print is the owner's to run.
- The Telegram bot is not wired. It is not something to test.
- If subagents are used before 2026-10-15, use Haiku for implementers and Opus for reviewers.
- If the app refuses to sync `main` into the worktree because harness files changed, tell the owner to confirm the origin under Help → Troubleshooting → Review Pinned Git Origins. Do not work around it.

## Review Focus

1. **printkit is rolled back, or qkit deploys first, and the status answer has no `manage_url`.** Expected: the badge and the switch work as before and no link is shown; nothing errors. Pinned in Task 5 (client) and Task 6 (DOM).
2. **`manage_url` is not an http(s) URL** (`javascript:`, a relative path, a number). Expected: it never becomes a link, and the rest of the status still shows. Pinned in Task 5.
3. **A callback body carries both `source_ref` and `order_id` and they differ, or carries neither.** Expected: 400 and no write, rather than a guess at which order was meant. Pinned in Task 7.
4. **printkit runs with no public origin configured** (local development). Expected: `manage_url` starts with the origin the request came in on, never with `null`. Pinned in Task 1.
5. **The form's switch is on but the booth is saved with printing off** (printkit has no active location). Expected: `manage_url` is the printers list, never the picker with an id printkit would resolve to another booth. Pinned in Task 1.

Known and accepted, not changed here:

- When printkit cannot be reached, or `PRINTKIT_KIT_SECRET` is unset, qkit shows "Can't reach printkit right now" and no link. Today it shows a link built from `NEXT_PUBLIC_PRINTKIT_URL` in that case. The link cannot be known without printkit's answer.
- `NEXT_PUBLIC_PRINTKIT_URL` keeps its name. After this change only server code reads it. Renaming an environment variable is the owner's call and not part of R1.
- `order_id` stays in the callback body. Removing it is a later printkit release, after qkit's receiver is live.

## Decisions taken while planning

The spec fixes what R1 does. These three are details it leaves open. Each can be changed before execution.

1. **What "manage this one" links to.** `https://<printkit>/dashboard/printers#booth-<location id>`: that location's row on the printers list, which gets a matching `id`. printkit has no per-location page, and building one is more than R1 asks. A location with no printer links to `/dashboard/printers/new?location=<location id>`, the picker. No active location links to `/dashboard/printers`.
2. **Where the link's origin comes from.** `publicSiteUrl()` (printkit's existing helper: `PRINTKIT_PUBLIC_URL`, else Vercel's production or deployment host), falling back to the origin of the incoming request. Same source printkit already uses for CloudPRNT addresses.
3. **Where the advice shows.** One visible sentence at the top of the picker, with a "Read why" link to `/guides/bluetooth-printers`. The picker is where `manage_url` sends a booth with no printer, which is the only time qkit showed the advice.

## File Structure

printkit (`C:\Users\Clarence\Desktop\Coding\Merqo Business\printkit`):

| File                                                                       | Responsibility                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/manage-url.ts` (create)                                           | `locationManageUrl`, `locationRowId`: which printkit page a location links to |
| `src/lib/manage-url.test.ts` (create)                                      | Unit tests for both                                                           |
| `src/app/api/v1/print-locations/status/route.ts`, `route.test.ts` (modify) | Every 200 answer carries `manage_url`                                         |
| `src/app/dashboard/printers/page.tsx`, `page.dom.test.tsx` (modify)        | Each booth row gets the `id` the link's fragment names                        |
| `src/lib/printer-info-copy.ts` (modify)                                    | `PRINTER_CHOICE_ADVICE`                                                       |
| `src/app/dashboard/printers/new/printer-picker.tsx`, its DOM test (modify) | Shows the advice and the guide link                                           |
| `src/lib/kit-callback.ts`, `kit-callback.test.ts` (modify)                 | Callback body carries `source_ref` beside `order_id`                          |
| Five READMEs and `CHANGELOG.md` (modify)                                   | Required by CI                                                                |

qkit (this worktree):

| File                                                                          | Responsibility                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/printkit/client.ts`, `client.test.ts` (modify)                       | `getPrinterStatus` returns a validated `manage_url`    |
| `src/app/api/printkit/printer-status/route.test.ts` (modify)                  | Pins that the route passes `manage_url` to the browser |
| `src/hooks/use-printer-status.ts` (modify)                                    | The view carries `manageUrl`                           |
| `src/app/dashboard/booths/printing-section.tsx`, its DOM test (modify)        | Switch, badge, one link; no advice, no printkit paths  |
| `src/app/dashboard/booths/printer-status.dom.test.tsx` (modify)               | Fixtures follow the view type                          |
| `src/app/api/printkit/print-status/route.ts`, `route.test.ts` (modify)        | Accepts `source_ref` or `order_id`                     |
| `src/app/dashboard/booths/actions.ts`, `actions.test.ts` (modify)             | `syncPrintLocation` stores nothing on the booth        |
| `src/app/dashboard/booths/[boothId]/page.tsx`, `booth-form.tsx`, its DOM test | Stop reading `printkit_location_id`                    |
| `src/app/dashboard/booths/booking-status-section.tsx` (modify)                | One comment that names a function this plan deletes    |
| `supabase/tests/rls.test.sql` (modify)                                        | One comment that names the deleted write               |
| Six READMEs and `CHANGELOG.md` (modify)                                       | Docs                                                   |

---

## Part 1: printkit

### Task 1: `manage_url` on the location status

**Files:**

- Create: `src/lib/manage-url.ts`
- Create: `src/lib/manage-url.test.ts`
- Modify: `src/app/api/v1/print-locations/status/route.ts`
- Modify: `src/app/api/v1/print-locations/status/route.test.ts`
- Modify: `src/app/dashboard/printers/page.tsx` (the `<li>` inside `rows.map`)
- Modify: `src/app/dashboard/printers/page.dom.test.tsx`

**Interfaces:**

- Consumes: `publicSiteUrl(): string | null` from `@/lib/site-url`; `resolveActiveLocation(kitSlug, sourceRef): Promise<{ id: string; vendorId: string } | null>`; `getPrinterByLocation(locationId)`.
- Produces:
  - `locationRowId(locationId: string): string`, returning `booth-<locationId>`.
  - `locationManageUrl(requestOrigin: string, location: { id: string } | null, hasPrinter: boolean): string`.
  - `GET /api/v1/print-locations/status` 200 body: `{ printer: {...} | null, manage_url: string }`. `manage_url` is always present and absolute.

- [ ] **Step 1: Create the printkit worktree and install**

```bash
cd "/c/Users/Clarence/Desktop/Coding/Merqo Business/printkit"
gh pr list --repo merqo-io/Printkit --state open
git fetch origin
git worktree add .claude/worktrees/printing-goes-thin -b feat/manage-url-and-source-ref origin/main
cd .claude/worktrees/printing-goes-thin
pnpm install --frozen-lockfile
```

Expected: no open PR touching `src/app/api/v1/print-locations`, `src/lib/kit-callback.ts` or `src/app/dashboard/printers`; install completes. All later printkit steps run from this worktree.

- [ ] **Step 2: Write the failing unit tests**

Create `src/lib/manage-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const publicSiteUrlMock = vi.fn<() => string | null>();
vi.mock("@/lib/site-url", () => ({
  publicSiteUrl: () => publicSiteUrlMock(),
}));

import { locationManageUrl, locationRowId } from "./manage-url";

const REQUEST_ORIGIN = "http://localhost:3000";
const LOCATION = { id: "loc-1" };

beforeEach(() => {
  publicSiteUrlMock.mockReset().mockReturnValue("https://printkit.merqo.io");
});

describe("locationManageUrl", () => {
  it("sends a caller with no active location to the printers list", () => {
    expect(locationManageUrl(REQUEST_ORIGIN, null, false)).toBe(
      "https://printkit.merqo.io/dashboard/printers",
    );
  });

  it("sends a location with no printer to its picker", () => {
    expect(locationManageUrl(REQUEST_ORIGIN, LOCATION, false)).toBe(
      "https://printkit.merqo.io/dashboard/printers/new?location=loc-1",
    );
  });

  it("sends a location with a printer to its row on the printers list", () => {
    expect(locationManageUrl(REQUEST_ORIGIN, LOCATION, true)).toBe(
      "https://printkit.merqo.io/dashboard/printers#booth-loc-1",
    );
  });

  it("uses the request's origin when no public origin is configured", () => {
    publicSiteUrlMock.mockReturnValue(null);
    expect(locationManageUrl(REQUEST_ORIGIN, LOCATION, false)).toBe(
      "http://localhost:3000/dashboard/printers/new?location=loc-1",
    );
  });

  it("percent-encodes the location id", () => {
    expect(locationManageUrl(REQUEST_ORIGIN, { id: "a b&c" }, false)).toBe(
      "https://printkit.merqo.io/dashboard/printers/new?location=a%20b%26c",
    );
  });
});

describe("locationRowId", () => {
  it("names a location's row on the printers list", () => {
    expect(locationRowId("loc-1")).toBe("booth-loc-1");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/manage-url.test.ts`
Expected: FAIL, cannot resolve `./manage-url`.

- [ ] **Step 4: Write the helper**

Create `src/lib/manage-url.ts`:

```ts
import { publicSiteUrl } from "@/lib/site-url";

/** The element id of one location's row on the printers list. */
export function locationRowId(locationId: string): string {
  return `booth-${locationId}`;
}

/**
 * The printkit page a vendor should open for one of a calling kit's
 * locations, as an absolute URL. A calling kit links to this instead of
 * building printkit paths itself, so a page here can move without a change
 * in any other kit.
 *
 * No active location: the printers list, which says what to do next. The
 * picker is not offered, because given an id it cannot find it falls back
 * to the vendor's first booth.
 * A location with no printer: the picker for that location.
 * A location with a printer: its row on the printers list.
 *
 * `requestOrigin` is used only when no public origin is configured, so a
 * link never starts with "null".
 */
export function locationManageUrl(
  requestOrigin: string,
  location: { id: string } | null,
  hasPrinter: boolean,
): string {
  const origin = publicSiteUrl() ?? requestOrigin;
  if (!location) return `${origin}/dashboard/printers`;

  const id = encodeURIComponent(location.id);
  return hasPrinter
    ? `${origin}/dashboard/printers#${locationRowId(id)}`
    : `${origin}/dashboard/printers/new?location=${id}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/manage-url.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the failing route tests**

In `src/app/api/v1/print-locations/status/route.test.ts`, add this mock after the `@/lib/job-dispatch` mock and before `import { GET } from "./route";`:

```ts
vi.mock("@/lib/site-url", () => ({
  publicSiteUrl: () => "https://printkit.merqo.io",
}));
```

Replace the test "returns a null printer for an unknown location" with:

```ts
it("returns a null printer and the printers list for an unknown location", async () => {
  resolveActiveLocationMock.mockResolvedValue(null);
  const res = await GET(request());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    printer: null,
    manage_url: "https://printkit.merqo.io/dashboard/printers",
  });
});
```

Replace the test "returns a null printer when the location has none" with:

```ts
it("returns a null printer and the picker when the location has none", async () => {
  resolveActiveLocationMock.mockResolvedValue({
    id: "loc-1",
    vendorId: "vendor-1",
  });
  getPrinterByLocationMock.mockResolvedValue(null);
  expect(await (await GET(request())).json()).toEqual({
    printer: null,
    manage_url:
      "https://printkit.merqo.io/dashboard/printers/new?location=loc-1",
  });
});
```

In the test "reports the printer and its live state", add after the `toMatchObject` assertion:

```ts
expect(body.manage_url).toBe(
  "https://printkit.merqo.io/dashboard/printers#booth-loc-1",
);
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/api/v1/print-locations/status`
Expected: FAIL on those three tests (`manage_url` is missing from the body).

- [ ] **Step 8: Add `manage_url` to the route**

In `src/app/api/v1/print-locations/status/route.ts`, add the import:

```ts
import { locationManageUrl } from "@/lib/manage-url";
```

Replace the doc comment above `GET` with:

```ts
/**
 * A calling kit asks whether one of its locations has a printer and whether
 * that printer is reachable, so it can show the vendor a live status
 * without subscribing to printkit's own realtime channels. Every answer
 * names the printkit page for that location (`manage_url`), so the kit
 * links there without knowing printkit's routes.
 */
```

Replace everything from `const location = await resolveActiveLocation(` to the end of the function with:

```ts
  const location = await resolveActiveLocation(
    auth.kitSlug,
    parsed.data.source_ref,
  );
  if (!location) {
    return NextResponse.json({
      printer: null,
      manage_url: locationManageUrl(url.origin, null, false),
    });
  }

  await sweepLocation(location.id);

  const printer = await getPrinterByLocation(location.id);
  if (!printer) {
    return NextResponse.json({
      printer: null,
      manage_url: locationManageUrl(url.origin, location, false),
    });
  }

  return NextResponse.json({
    printer: {
      display_name: printer.display_name,
      catalog_id: printer.catalog_id,
      connector: printer.connector,
      state: printerState(printer.last_seen_at),
      last_seen_at: printer.last_seen_at,
      hardware_verified:
        getCatalogEntry(printer.catalog_id)?.hardwareVerified ?? false,
    },
    manage_url: locationManageUrl(url.origin, location, true),
  });
}
```

`url` is the `new URL(request.url)` the function already builds for the query.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/api/v1/print-locations/status`
Expected: PASS, all 7 tests.

- [ ] **Step 10: Give each booth row the id the link names**

In `src/app/dashboard/printers/page.dom.test.tsx`, in the test "shows setup links and live status from the scoped summaries", add as the last assertion:

```ts
expect(document.getElementById("booth-b")).not.toBeNull();
```

Run: `pnpm vitest run src/app/dashboard/printers/page.dom.test.tsx`
Expected: FAIL, the element is null.

In `src/app/dashboard/printers/page.tsx`, add the import:

```ts
import { locationRowId } from "@/lib/manage-url";
```

and replace

```tsx
            <li
              key={location.id}
              className="border-border rounded-lg border p-4"
            >
```

with

```tsx
            <li
              key={location.id}
              id={locationRowId(location.id)}
              className="border-border scroll-mt-4 rounded-lg border p-4"
            >
```

Run: `pnpm vitest run src/app/dashboard/printers/page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/manage-url.ts src/lib/manage-url.test.ts src/app/api/v1/print-locations/status/route.ts src/app/api/v1/print-locations/status/route.test.ts src/app/dashboard/printers/page.tsx src/app/dashboard/printers/page.dom.test.tsx
git commit -m "feat: the location status names the printkit page for that location

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The printer advice shows on the picker

**Files:**

- Modify: `src/lib/printer-info-copy.ts` (append after `BLUETOOTH_WARNING`)
- Modify: `src/app/dashboard/printers/new/printer-picker.tsx` (import, and the first child of the returned `<div className="space-y-6">`)
- Modify: `src/app/dashboard/printers/new/printer-picker.dom.test.tsx`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `PRINTER_CHOICE_ADVICE: string` exported from `@/lib/printer-info-copy`. The picker renders it with a link named "Read why" to `/guides/bluetooth-printers`.

- [ ] **Step 1: Write the failing test**

In `src/app/dashboard/printers/new/printer-picker.dom.test.tsx`, add inside `describe("PrinterPicker", ...)`:

```tsx
it("says up front which printers work with an iPad alone, and links to why", () => {
  renderPicker();

  expect(screen.getByText(/works with just your iPad/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Read why" })).toHaveAttribute(
    "href",
    "/guides/bluetooth-printers",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/dashboard/printers/new/printer-picker.dom.test.tsx`
Expected: FAIL, no element with that text.

- [ ] **Step 3: Add the copy**

Append to `src/lib/printer-info-copy.ts`:

```ts
/** The one-sentence answer to "which printer should I buy", shown above the
 *  picker. It says the same thing as the `ipad_alone` and `helper_device`
 *  topics, for a vendor who has not opened either. */
export const PRINTER_CHOICE_ADVICE =
  "A printer that connects to the internet by itself works with just your iPad. A Bluetooth printer needs a helper device next to it all day: an Android phone, a laptop or a Raspberry Pi.";
```

- [ ] **Step 4: Show it on the picker**

In `src/app/dashboard/printers/new/printer-picker.tsx`, add the import:

```ts
import { PRINTER_CHOICE_ADVICE } from "@/lib/printer-info-copy";
```

In `PrinterPicker`'s return, replace

```tsx
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={ipadOnly} onClick={() => setIpadOnly(!ipadOnly)}>
```

with

```tsx
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {PRINTER_CHOICE_ADVICE}{" "}
        <Link
          href="/guides/bluetooth-printers"
          className="text-foreground underline underline-offset-4"
        >
          Read why
        </Link>
      </p>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={ipadOnly} onClick={() => setIpadOnly(!ipadOnly)}>
```

`Link` is already imported in this file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/dashboard/printers/new/printer-picker.dom.test.tsx`
Expected: PASS, including the existing test that finds the Bluetooth card's own guide link inside that card.

- [ ] **Step 6: Commit**

```bash
git add src/lib/printer-info-copy.ts src/app/dashboard/printers/new/printer-picker.tsx src/app/dashboard/printers/new/printer-picker.dom.test.tsx
git commit -m "feat: the printer picker opens with which printers work with an iPad alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The status callback carries `source_ref`

**Files:**

- Modify: `src/lib/kit-callback.ts` (the `body:` of the `fetch` call)
- Modify: `src/lib/kit-callback.test.ts` (the test "POSTs the configured kit's callback_url with a bearer token and the source_ref/status")

**Interfaces:**

- Consumes: nothing from Tasks 1 and 2.
- Produces: callback body `{ source_ref: string, order_id: string, status: "printed" | "failed", attempt_at: string }`. `source_ref` and `order_id` always hold the same value. `notifyKitPrintStatus`'s signature does not change.

- [ ] **Step 1: Write the failing test**

In `src/lib/kit-callback.test.ts`, in that test, replace

```ts
expect(JSON.parse(init.body)).toEqual({
  order_id: "order-1",
  status: "failed",
  attempt_at: "2026-10-08T01:00:00.123456Z",
});
```

with

```ts
expect(JSON.parse(init.body)).toEqual({
  source_ref: "order-1",
  order_id: "order-1",
  status: "failed",
  attempt_at: "2026-10-08T01:00:00.123456Z",
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/kit-callback.test.ts`
Expected: FAIL on that test, `source_ref` missing from the body.

- [ ] **Step 3: Send both names**

In `src/lib/kit-callback.ts`, replace

```ts
      // order_id matches qkit's own inbound route contract -- a future
      // second kit's route needs the same shape, or this becomes per-kit.
      body: JSON.stringify({
        order_id: sourceRef,
        status,
        attempt_at: attempt,
      }),
```

with

```ts
      // source_ref is the calling kit's own reference for the job, under
      // the name every printkit API uses for it. order_id carries the same
      // value for a receiver that still reads that name.
      body: JSON.stringify({
        source_ref: sourceRef,
        order_id: sourceRef,
        status,
        attempt_at: attempt,
      }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/kit-callback.test.ts src/lib/print-jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kit-callback.ts src/lib/kit-callback.test.ts
git commit -m "feat: the print-status callback names the job's source_ref

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: printkit docs, gate, PR

**Files:**

- Modify: `src/app/api/v1/print-locations/status/README.md`
- Modify: `src/app/dashboard/printers/README.md`
- Modify: `src/app/dashboard/printers/new/README.md`
- Modify: `src/lib/README.md`
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the deployed `manage_url` and `source_ref` that Part 2 reads.

- [ ] **Step 1: Update the status route's README**

In `src/app/api/v1/print-locations/status/README.md`, replace the block from `Responses:` down to the line before `` `state` is `online` when `` with:

````markdown
Responses:

```json
{
  "printer": null,
  "manage_url": "https://printkit.merqo.io/dashboard/printers/new?location=<location id>"
}
```

for a location with no printer yet, or:

```json
{
  "printer": {
    "display_name": "Feie FP-N20H",
    "catalog_id": "feie-fp-n20h",
    "connector": "vendor_cloud",
    "state": "online",
    "last_seen_at": "2026-09-20T10:15:00Z",
    "hardware_verified": false
  },
  "manage_url": "https://printkit.merqo.io/dashboard/printers#booth-<location id>"
}
```

`manage_url` is in every 200 answer. It is the printkit page a vendor should
open for that location, so a calling kit shows one link and never builds a
printkit path of its own:

| The location                     | `manage_url` points to                   |
| -------------------------------- | ---------------------------------------- |
| unknown to printkit, or inactive | the printers list                        |
| active, no printer               | the picker for that location             |
| active, has a printer            | that location's row on the printers list |

It comes from `locationManageUrl` (`../../../../lib/manage-url.ts`). Its
origin is `publicSiteUrl()`, or the origin the request arrived on when no
public origin is configured.
````

In the same file's Connectivity section, add `../../../../lib/manage-url.ts` (the link) to the list of modules it reads.

- [ ] **Step 2: Update the other READMEs**

`src/app/dashboard/printers/README.md`, in the `page.tsx` bullet, add at its end:

```markdown
Each row carries the id `booth-<location id>` (`locationRowId`), which the
status API's `manage_url` names so a calling kit's "manage this booth's
printer" link lands on the right row.
```

In the same file's `new/page.tsx` and `new/printer-picker.tsx` bullet, add at its end:

```markdown
The picker opens with one sentence saying which printers work with an
iPad alone and what a Bluetooth printer needs, with a link to the guide.
Calling kits link here instead of repeating that advice.
```

`src/app/dashboard/printers/new/README.md`, in the `printer-picker.tsx` bullet, add at its end:

```markdown
Above the filters it shows `PRINTER_CHOICE_ADVICE` and a "Read why" link
to the Bluetooth guide.
```

and in the `printer-picker.dom.test.tsx` bullet, change "filtering, sorting and the Bluetooth warning" to "filtering, sorting, the opening advice and the Bluetooth warning".

`src/lib/README.md`: add after the `site-url.ts` bullet:

```markdown
- `manage-url.ts` — `locationManageUrl(requestOrigin, location, hasPrinter)`:
  the absolute printkit page a vendor should open for one location (the
  printers list, the picker, or that location's row), returned by
  `GET /api/v1/print-locations/status` as `manage_url` so no calling kit
  builds a printkit path. `locationRowId(id)` is the row's element id,
  shared with the printers page so the link and the row cannot drift.
```

In the `printer-info-copy.ts` bullet, change `` `INFO_COPY`/`BLUETOOTH_WARNING` `` to `` `INFO_COPY`/`BLUETOOTH_WARNING`/`PRINTER_CHOICE_ADVICE` ``.

In the `kit-callback.ts` bullet, add at its end:

```markdown
The body names the job `source_ref`; `order_id` carries the same value
for a receiver that still reads that name.
```

Root `README.md`: directly after the sentence ending "`kit_api_keys` (`callback_url`/`callback_secret`), not hardcoded to qkit.", add:

```markdown
Its body names the job `source_ref`, with `order_id` kept beside it until
every calling kit reads the new name. `GET /api/v1/print-locations/status`
also returns `manage_url`, the printkit page for that location, so a calling
kit links to it instead of building printkit paths.
```

- [ ] **Step 3: Update the changelog**

In `CHANGELOG.md`, under `## [Unreleased]` and its existing `### Added` heading, add:

```markdown
- `GET /api/v1/print-locations/status` returns `manage_url`: the printkit page for that location (the picker when it has no printer, its row on the printers list when it has one). A calling kit links to it and no longer needs to know printkit's routes.
- The printer picker opens with one sentence on which printers work with an iPad alone and what a Bluetooth printer needs, with a link to the guide. qkit showed its own version of this advice; it now lives here only.
- The print-status callback body carries `source_ref` beside `order_id`, both holding the calling kit's reference. `order_id` will be removed in a later release, once calling kits read `source_ref`.
```

- [ ] **Step 4: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

Run: `pnpm exec vitest --run --coverage`
Expected: exit 0. This is the full suite with the coverage report CI checks, so it stands in for `pnpm test`. Nothing else heavy may run at the same time.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add README.md CHANGELOG.md src/lib/README.md src/app/dashboard/printers/README.md src/app/dashboard/printers/new/README.md src/app/api/v1/print-locations/status/README.md
git commit -m "docs: record manage_url, the picker advice and the callback's source_ref

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/manage-url-and-source-ref
gh pr create --repo merqo-io/Printkit --base main --title "feat: name the printkit page for a location, and source_ref on the status callback" --body "$(cat <<'EOF'
## What

- `GET /api/v1/print-locations/status` returns `manage_url`: the picker for a location with no printer, that location's row on the printers list when it has one, the printers list when printkit has no active location for the reference.
- The printer picker opens with one sentence on which printers work with an iPad alone, with a link to the Bluetooth guide.
- The print-status callback body carries `source_ref` beside `order_id`.

## Why

Phase R1 of the separation design in the qkit repo (`docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`). qkit hardcodes two printkit routes and carries its own printer advice. After this, qkit shows one link whose address printkit supplies.

## Compatibility

All three changes are additive. qkit's current receiver ignores `source_ref`, and its current status reader ignores `manage_url`. `order_id` stays until qkit reads `source_ref`.

## Not in this PR

- No migration.
- `AGENTS.md` is not edited; nothing in it describes the changed behaviour.

## Verified

- `pnpm check` and the full suite with coverage pass locally.
- Unit tests for the three link targets, the no-public-origin fallback and id encoding; route tests for all three 200 answers; DOM tests for the row id and the picker advice.
- Not verified: the origin `publicSiteUrl()` returns in production. The first live check is the link on qkit's booth edit page after both PRs deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Run the push in the background with a 600000 ms timeout and keep its log: the pre-push hook runs the gate again.

Expected: PR URL printed. Do not merge it. Report the URL to the owner and wait until it is merged and deployed before Part 2's PR is merged. Part 2's code can be written meanwhile.

---

## Part 2: qkit

All steps run from the qkit worktree `C:\Users\Clarence\Desktop\Coding\Merqo Business\qkit\.claude\worktrees\relaxed-almeida-ab310a`, branch `claude/sharp-tesla-f7daf4`. This plan and its README line are uncommitted on that branch; Task 5 commits them.

### Task 5: `getPrinterStatus` reads `manage_url`

**Files:**

- Modify: `src/lib/printkit/client.ts` (`printerStatusSchema`, around line 22)
- Modify: `src/lib/printkit/client.test.ts` (import, and a new `describe` at the end of the file)
- Modify: `src/app/api/printkit/printer-status/route.test.ts`

**Interfaces:**

- Consumes: printkit's `manage_url` from Task 1.
- Produces: `PrinterStatusBody` becomes `{ printer: {...} | null; manage_url: string | null }`. `manage_url` is `null` unless printkit sent an http or https URL. `GET /api/printkit/printer-status` passes it through unchanged: `{ printer, manage_url, reachable: true }`.

- [ ] **Step 1: Sync `main`, check open PRs, commit the plan**

Sync the worktree with `main` using the app's `sync_with_base_branch` tool (not `git merge`). Then:

```bash
gh pr list --repo merqo-io/Qkit --state open
pnpm install --frozen-lockfile
git add docs/superpowers/plans/2026-10-12-printing-goes-thin.md docs/superpowers/plans/README.md
git commit -m "docs: the printing-goes-thin plan (separation R1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: if a PR other than this plan's touches `src/app/dashboard/booths/printing-section.tsx`, `src/app/api/printkit`, `src/lib/printkit` or `src/hooks/use-printer-status.ts`, stop and tell the owner. #219 (if still open) touches `CHANGELOG.md` and `src/app/dashboard/booths/README.md`; that is a docs overlap only, handled in Task 9.

- [ ] **Step 2: Write the failing client tests**

In `src/lib/printkit/client.test.ts`, change the import to:

```ts
import {
  createPrintJob,
  getPrinterStatus,
  registerPrintLocation,
} from "./client";
```

and append at the end of the file:

```ts
describe("getPrinterStatus", () => {
  const PRINTER = {
    display_name: "Feie FP-N20H",
    catalog_id: "feie-fp-n20h",
    connector: "vendor_cloud",
    state: "online",
    last_seen_at: "2026-09-20T10:00:00.000Z",
    hardware_verified: false,
  };
  const ROW_URL = "https://printkit.example/dashboard/printers#booth-loc-1";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PRINTKIT_KIT_SECRET = "secret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.example";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function respondsWith(body: unknown) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("asks printkit about this booth and returns the printer with its link", async () => {
    const fetchMock = respondsWith({ printer: PRINTER, manage_url: ROW_URL });

    const result = await getPrinterStatus("booth 1");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://printkit.example/api/v1/print-locations/status?source_ref=booth%201",
    );
    expect(result).toEqual({
      ok: true,
      data: { printer: PRINTER, manage_url: ROW_URL },
    });
  });

  it("reads an answer with no manage_url as having no link", async () => {
    respondsWith({ printer: null });

    expect(await getPrinterStatus("booth-1")).toEqual({
      ok: true,
      data: { printer: null, manage_url: null },
    });
  });

  it.each([
    ["a javascript: URL", "javascript:alert(1)"],
    ["a relative path", "/dashboard/printers"],
    ["a number", 42],
    ["null", null],
  ])(
    "drops %s sent as manage_url and keeps the status",
    async (_, manageUrl) => {
      respondsWith({ printer: PRINTER, manage_url: manageUrl });

      expect(await getPrinterStatus("booth-1")).toEqual({
        ok: true,
        data: { printer: PRINTER, manage_url: null },
      });
    },
  );

  it("keeps an http link, which a local printkit sends", async () => {
    respondsWith({
      printer: null,
      manage_url: "http://localhost:3001/dashboard/printers",
    });

    expect(await getPrinterStatus("booth-1")).toEqual({
      ok: true,
      data: {
        printer: null,
        manage_url: "http://localhost:3001/dashboard/printers",
      },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/printkit/client.test.ts`
Expected: FAIL on all seven new cases (`manage_url` is stripped from `data` today).

- [ ] **Step 4: Validate `manage_url` in the client**

In `src/lib/printkit/client.ts`, add above `printerStatusSchema`:

```ts
/**
 * Only an http(s) URL may become a link in the dashboard. Anything else
 * printkit might send (no field at all from a deployment that predates it,
 * a non-string, another scheme) reads as "no link" and never fails the
 * status it came with.
 */
function httpUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
```

and add one key to `printerStatusSchema`, after `printer`:

```ts
  manage_url: z.unknown().transform(httpUrlOrNull),
```

Replace the doc comment above `getPrinterStatus` with:

```ts
/**
 * Whether this booth has a printer in printkit, and whether it is reachable
 * right now. printkit owns that fact for every kind of printer (cloud, 4G,
 * Bluetooth bridge), so qkit reads it over HTTP rather than subscribing to
 * printkit's own realtime channel with qkit's Supabase client.
 *
 * `manage_url` is the printkit page for this booth's printer, as printkit
 * names it. qkit links to it and builds no printkit path of its own.
 */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/printkit/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Pin the route's pass-through**

`src/app/api/printkit/printer-status/route.ts` spreads the client's `data` into its answer, so it needs no code change. Pin that in `src/app/api/printkit/printer-status/route.test.ts`. Add after the `PRINTER` constant:

```ts
const MANAGE_URL = "https://printkit.test/dashboard/printers#booth-loc-1";
```

In `beforeEach`, replace

```ts
    .mockResolvedValue({ ok: true, data: { printer: PRINTER } });
```

with

```ts
    .mockResolvedValue({
      ok: true,
      data: { printer: PRINTER, manage_url: MANAGE_URL },
    });
```

and in the test "returns the printer printkit reports", replace

```ts
expect(body).toEqual({ printer: PRINTER, reachable: true });
```

with

```ts
expect(body).toEqual({
  printer: PRINTER,
  manage_url: MANAGE_URL,
  reachable: true,
});
```

Run: `pnpm vitest run src/app/api/printkit/printer-status`
Expected: PASS, all 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/printkit/client.ts src/lib/printkit/client.test.ts src/app/api/printkit/printer-status/route.test.ts
git commit -m "feat: read the printkit page for a booth's printer from printkit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The Printing section goes thin

**Files:**

- Modify: `src/hooks/use-printer-status.ts`
- Modify: `src/app/dashboard/booths/printing-section.tsx`
- Modify: `src/app/dashboard/booths/printing-section.dom.test.tsx`
- Modify: `src/app/dashboard/booths/printer-status.dom.test.tsx`
- Modify: `src/app/dashboard/booths/booking-status-section.tsx` (one comment)

**Interfaces:**

- Consumes: `GET /api/printkit/printer-status?booth=<id>` answering `{ printer, manage_url: string | null, reachable: true }` or `{ printer: null, reachable: false }` (Task 5).
- Produces:

  ```ts
  export type PrinterStatusView =
    | { kind: "loading" }
    | { kind: "unreachable" }
    | { kind: "none"; manageUrl: string | null }
    | { kind: "printer"; printer: PrinterSummary; manageUrl: string | null };
  ```

  `PrintingSection`'s props do not change: `{ value: boolean; onChange: (v: boolean) => void; boothId?: string }`.

- [ ] **Step 1: Rewrite the DOM tests**

In `src/app/dashboard/booths/printing-section.dom.test.tsx`, replace everything from `type StatusBody = {` down to `const NO_PRINTER: StatusBody = { reachable: true, printer: null };` with:

```tsx
type StatusBody = {
  reachable: boolean;
  manage_url?: string | null;
  printer: {
    display_name: string;
    state: "online" | "offline" | "not_set_up";
    hardware_verified: boolean;
  } | null;
};

function respondsWith(body: StatusBody | null) {
  const fetchMock = vi.fn(async () =>
    body
      ? new Response(JSON.stringify(body))
      : new Response("{}", { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PICKER_URL =
  "https://printkit.test/dashboard/printers/new?location=loc-1";
const ROW_URL = "https://printkit.test/dashboard/printers#booth-loc-1";

const ONLINE: StatusBody = {
  reachable: true,
  manage_url: ROW_URL,
  printer: {
    display_name: "Feie FP-N20H",
    state: "online",
    hardware_verified: false,
  },
};

const OFFLINE: StatusBody = {
  reachable: true,
  manage_url: ROW_URL,
  printer: {
    display_name: "Feie FP-N20H",
    state: "offline",
    hardware_verified: false,
  },
};

const NO_PRINTER: StatusBody = {
  reachable: true,
  manage_url: PICKER_URL,
  printer: null,
};
```

Delete these three tests: "links to printkit's printers page", "explains that a Bluetooth printer needs a second device", and "falls back to a not-configured hint when printkit's URL is unset".

Replace the test "prompts to save the booth first when enabled but unsaved" with:

```tsx
it("prompts to save the booth first when enabled but unsaved, with no link", () => {
  render(<PrintingSection value={true} onChange={vi.fn()} />);

  expect(
    screen.getByText(
      "Save this booth first to choose its printer in printkit.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
```

Replace the test "says printkit is unreachable rather than claiming no printer" with:

```tsx
it("says printkit is unreachable rather than claiming no printer, with no link", async () => {
  respondsWith(null);
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  expect(await screen.findByText(/can't reach printkit/i)).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
```

Add these tests inside the `describe`:

```tsx
it("links to the page printkit names for a booth with no printer", async () => {
  respondsWith(NO_PRINTER);
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  const link = await screen.findByRole("link", {
    name: "Choose the printer for this booth →",
  });
  expect(link).toHaveAttribute("href", PICKER_URL);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it("links to the page printkit names for a booth that has a printer", async () => {
  respondsWith(ONLINE);
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  expect(
    await screen.findByRole("link", {
      name: "Manage this booth's printer in printkit →",
    }),
  ).toHaveAttribute("href", ROW_URL);
});

it("still links to the printer's page while the printer is offline", async () => {
  respondsWith(OFFLINE);
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  expect(await screen.findByText("Printer offline")).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "Manage this booth's printer in printkit →",
    }),
  ).toHaveAttribute("href", ROW_URL);
});

it("shows no link while the first status read is in flight", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  expect(screen.getByText(/checking the printer/i)).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("builds no printkit link of its own when printkit names no page", async () => {
  process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
  respondsWith({ reachable: true, printer: null });
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  expect(
    await screen.findByText(/no printer is set up for this booth yet/i),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("shows no link while printing is off", async () => {
  const fetchMock = respondsWith(ONLINE);
  render(
    <PrintingSection value={false} onChange={vi.fn()} boothId="booth-42" />,
  );

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled();
  });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("carries no printer advice of its own", async () => {
  respondsWith(NO_PRINTER);
  render(
    <PrintingSection value={true} onChange={vi.fn()} boothId="booth-42" />,
  );

  await screen.findByRole("link", {
    name: "Choose the printer for this booth →",
  });
  expect(screen.queryByText(/iPad/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Bluetooth/i)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /read why/i }),
  ).not.toBeInTheDocument();
});
```

Keep the `originalUrl` capture and the `afterEach` that restores `NEXT_PUBLIC_PRINTKIT_URL`: one test above sets it. Keep every other existing test as it is.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/dashboard/booths/printing-section.dom.test.tsx`
Expected: FAIL on "links to the page printkit names" (both), "still links to the printer's page while the printer is offline", "builds no printkit link of its own" and "carries no printer advice of its own". The other new tests pass already.

- [ ] **Step 3: Carry `manageUrl` in the hook's view**

In `src/hooks/use-printer-status.ts`, replace the `PrinterStatusView` type with:

```ts
export type PrinterStatusView =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "none"; manageUrl: string | null }
  | { kind: "printer"; printer: PrinterSummary; manageUrl: string | null };
```

Replace the `StatusBody` type with:

```ts
type StatusBody = {
  reachable?: boolean;
  manage_url?: string | null;
  printer?: {
    display_name: string;
    state: "online" | "offline" | "not_set_up";
    hardware_verified: boolean;
  } | null;
};
```

Replace the doc comment above `usePrinterStatus` with:

```ts
/**
 * Reads a booth's printer from printkit, which owns that fact for every kind
 * of printer -- a cloud printer, a 4G printer and a Bluetooth bridge all
 * report the same way. The call goes through qkit's own route handler so the
 * printkit secret never reaches the browser.
 *
 * `manageUrl` is the printkit page for this booth's printer, as printkit
 * names it, or null when printkit named none.
 */
```

Replace

```ts
setView(
  body.printer
    ? {
        kind: "printer",
        printer: {
          displayName: body.printer.display_name,
          state: body.printer.state,
          hardwareVerified: body.printer.hardware_verified,
        },
      }
    : { kind: "none" },
);
```

with

```ts
const manageUrl = body.manage_url ?? null;
setView(
  body.printer
    ? {
        kind: "printer",
        printer: {
          displayName: body.printer.display_name,
          state: body.printer.state,
          hardwareVerified: body.printer.hardware_verified,
        },
        manageUrl,
      }
    : { kind: "none", manageUrl },
);
```

and replace the last line of the hook

```ts
return boothId ? view : { kind: "none" };
```

with

```ts
return boothId ? view : { kind: "none", manageUrl: null };
```

- [ ] **Step 4: Thin the section**

In `src/app/dashboard/booths/printing-section.tsx`, delete the `printkitLink` function, its comment, and the `printerHint` function (lines 19 to 30).

Replace

```tsx
const hasPrinter = status.kind === "printer";
const online = hasPrinter && status.printer.state === "online";
const choosePrinterLink = printkitLink("/dashboard/printers");
const guideLink = printkitLink("/guides/bluetooth-printers");
```

with

```tsx
const hasPrinter = status.kind === "printer";
const online = hasPrinter && status.printer.state === "online";
// printkit names the page for this booth's printer. qkit builds no
// printkit path of its own and carries no printer advice.
const manageUrl =
  status.kind === "printer" || status.kind === "none" ? status.manageUrl : null;
```

Replace the two blocks that begin `{value && (` and `{value && !hasPrinter && (` (the link-or-hint paragraph and the advice paragraph, everything between the warning banner and `<AlertDialog`) with:

```tsx
{
  value && manageUrl && (
    <p className="px-1 text-sm text-muted-foreground">
      <a
        href={manageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        {hasPrinter
          ? "Manage this booth's printer in printkit →"
          : "Choose the printer for this booth →"}
      </a>
    </p>
  );
}

{
  value && !boothId && (
    <p className="px-1 text-sm text-muted-foreground">
      Save this booth first to choose its printer in printkit.
    </p>
  );
}
```

Leave the switch row, the `PrinterStatus` line, the "Printing is on, but no printer is set up" banner, `handleToggle` and the "Printer offline" `AlertDialog` exactly as they are.

- [ ] **Step 5: Bring the two neighbours in line**

In `src/app/dashboard/booths/printer-status.dom.test.tsx`, add `manageUrl: null,` as the last property of both `kind: "printer"` views, and replace `view={{ kind: "none" }}` with `view={{ kind: "none", manageUrl: null }}`.

In `src/app/dashboard/booths/booking-status-section.tsx`, replace the comment

```ts
// General entry point for finding/creating a booking before pasting its ID
// here — mirrors printing-section.tsx's printkitDashboardLink() pattern.
```

with

```ts
// General entry point for finding/creating a booking before pasting its ID
// here.
```

- [ ] **Step 6: Run the tests and the type check**

Run: `pnpm vitest run src/app/dashboard/booths/printing-section.dom.test.tsx src/app/dashboard/booths/printer-status.dom.test.tsx`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

Run: `pnpm exec eslint src/app/dashboard/booths/printing-section.tsx src/hooks/use-printer-status.ts`
Expected: exit 0 (this is where the no-em-dash gate runs).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-printer-status.ts src/app/dashboard/booths/printing-section.tsx src/app/dashboard/booths/printing-section.dom.test.tsx src/app/dashboard/booths/printer-status.dom.test.tsx src/app/dashboard/booths/booking-status-section.tsx
git commit -m "feat: the booth Printing section links where printkit says, and drops its own advice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The print-status callback accepts `source_ref` or `order_id`

**Files:**

- Modify: `src/app/api/printkit/print-status/route.ts` (`bodySchema`, lines 7 to 11)
- Modify: `src/app/api/printkit/print-status/route.test.ts`

**Interfaces:**

- Consumes: printkit's callback body from Task 3: `{ source_ref, order_id, status, attempt_at }`. Bodies from a printkit that sends only `order_id` must keep working.
- Produces: `POST /api/printkit/print-status` accepts `{ source_ref?: uuid, order_id?: uuid, status, attempt_at }`. At least one of the two ids is required; when both are present they must be equal. Otherwise 400. Responses and every later line of the handler are unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/printkit/print-status/route.test.ts`, add after the `ORDER_ID` constant:

```ts
const OTHER_ORDER_ID = "22222222-2222-2222-2222-222222222222";
```

and add inside `describe("POST /api/printkit/print-status", ...)`:

```ts
it("accepts source_ref as the order's id", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);

  const res = await POST(
    requestWith({ source_ref: ORDER_ID, status: "printed" }),
  );

  expect(res.status).toBe(200);
  expect(updateMock).toHaveBeenCalledWith({
    print_status: "printed",
    print_status_updated_at: ATTEMPT_AT,
  });
  expect(eqMock).toHaveBeenCalledWith("id", ORDER_ID);
});

it("accepts a body that carries both names for the same order", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);

  const res = await POST(
    requestWith({ source_ref: ORDER_ID, order_id: ORDER_ID, status: "failed" }),
  );

  expect(res.status).toBe(200);
  expect(eqMock).toHaveBeenCalledWith("id", ORDER_ID);
});

it("returns 400 when source_ref and order_id name different orders", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);

  const res = await POST(
    requestWith({
      source_ref: ORDER_ID,
      order_id: OTHER_ORDER_ID,
      status: "failed",
    }),
  );

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: "source_ref and order_id disagree",
  });
  expect(updateMock).not.toHaveBeenCalled();
});

it("returns 400 when the body names no order at all", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);

  const res = await POST(requestWith({ status: "failed" }));

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "source_ref is required" });
  expect(updateMock).not.toHaveBeenCalled();
});

it("returns 400 on a non-UUID source_ref", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);

  const res = await POST(
    requestWith({ source_ref: "order-1", status: "failed" }),
  );

  expect(res.status).toBe(400);
  expect(updateMock).not.toHaveBeenCalled();
});

it("returns 404 when no order matches source_ref", async () => {
  printkitCallbackBearerOkMock.mockReturnValue(true);
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  existsMock.mockResolvedValue({ data: null, error: null });

  const res = await POST(
    requestWith({ source_ref: ORDER_ID, status: "printed" }),
  );

  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/api/printkit/print-status`
Expected: FAIL on "accepts source_ref as the order's id" (400 today), "returns 400 when source_ref and order_id name different orders" (200 today), "returns 400 when the body names no order at all" (wrong message) and "returns 404 when no order matches source_ref" (400 today). The other two new tests pass already.

- [ ] **Step 3: Accept either name**

In `src/app/api/printkit/print-status/route.ts`, replace

```ts
const bodySchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["printed", "failed"]),
  attempt_at: z.string().datetime({ precision: 6 }),
});
```

with

```ts
// printkit names the order `source_ref`, the word its own API uses for a
// calling kit's reference. `order_id` is the name its earlier releases
// send, and a release in between sends both with the same value. Either is
// accepted. A body whose two names disagree is refused rather than guessed
// at.
const bodySchema = z
  .object({
    source_ref: z.string().uuid().optional(),
    order_id: z.string().uuid().optional(),
    status: z.enum(["printed", "failed"]),
    attempt_at: z.string().datetime({ precision: 6 }),
  })
  .transform((body, ctx) => {
    const orderId = body.source_ref ?? body.order_id;
    if (!orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_ref is required",
      });
      return z.NEVER;
    }
    if (body.order_id && body.order_id !== orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_ref and order_id disagree",
      });
      return z.NEVER;
    }
    return {
      order_id: orderId,
      status: body.status,
      attempt_at: body.attempt_at,
    };
  });
```

Nothing below the schema changes: the handler keeps reading `parsed.data.order_id`, `parsed.data.status` and `parsed.data.attempt_at`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/api/printkit/print-status`
Expected: PASS, every test in the file, including the existing `order_id` cases and the `attempt_at` cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/printkit/print-status/route.ts src/app/api/printkit/print-status/route.test.ts
git commit -m "feat: the print-status callback accepts source_ref or order_id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: qkit stops writing and reading `printkit_location_id`

**Files:**

- Modify: `src/app/dashboard/booths/actions.ts` (import on line 6; `syncPrintLocation`, lines 50 to 87)
- Modify: `src/app/dashboard/booths/actions.test.ts`
- Modify: `src/app/dashboard/booths/[boothId]/page.tsx` (the `select` string and the `initial` prop)
- Modify: `src/app/dashboard/booths/booth-form.tsx` (the `initial` prop type, line 88)
- Modify: `src/app/dashboard/booths/booth-form.dom.test.tsx` (7 fixture lines)
- Modify: `supabase/tests/rls.test.sql` (one comment, near line 1114)

**Interfaces:**

- Consumes: `registerPrintLocation({ vendorId, sourceRef, label, active }): Promise<PrintkitResult<{ id: string }>>` from `@/lib/printkit/client`. Unchanged; its `id` is no longer used.
- Produces: `saveBooth` and `deleteBooth` keep their signatures and results. `syncPrintLocation` still registers the location with printkit and writes nothing to `booths`. `BoothForm`'s `initial` prop no longer has `printkit_location_id`.

- [ ] **Step 1: Write the failing test**

In `src/app/dashboard/booths/actions.test.ts`, inside `describe("saveBooth — printkit location registration", ...)`, delete the tests "mirrors printkit's returned location id onto the booth row on success" and "does not touch printkit_location_id when registerPrintLocation fails", and add in their place:

```ts
it("stores nothing from printkit's answer on the booth row", async () => {
  registerPrintLocationMock.mockResolvedValue({
    ok: true,
    data: { id: "loc-42" },
  });

  const res = await saveBooth(
    makeBooth({ boothId: BOOTH_ID, print_enabled: true }),
  );

  expect(res).toEqual({ success: true, boothId: "b-edit" });
  expect(registerPrintLocationMock).toHaveBeenCalled();
  expect(h.updateSpy).toHaveBeenCalledTimes(1);
  expect(h.updateSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({ printkit_location_id: expect.anything() }),
  );
});
```

In the test "(e) allows re-activating the SAME booth being edited (excluded via neq)", replace

```ts
// The booth row update, plus syncPrintLocation's own printkit_location_id
// mirror update once registerPrintLocation succeeds.
expect(h.updateSpy).toHaveBeenCalledTimes(2);
```

with

```ts
expect(h.updateSpy).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/dashboard/booths/actions.test.ts`
Expected: FAIL on those two tests (`updateSpy` is called twice today).

- [ ] **Step 3: Stop the write**

In `src/app/dashboard/booths/actions.ts`, replace line 6

```ts
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
```

with

```ts
import { createServerClient } from "@/lib/supabase/server";
```

and replace the whole `syncPrintLocation` function and the comment above it with:

```ts
// Tells printkit whether this booth prints. Best-effort, same contract as
// notifyPrintkit: a failure is logged and never fails the caller. printkit
// keys the location on the booth id, so nothing from its answer is stored.
async function syncPrintLocation(
  vendorId: string,
  boothId: string,
  label: string,
  active: boolean,
  context: string,
) {
  try {
    const result = await registerPrintLocation({
      vendorId,
      sourceRef: boothId,
      label,
      active,
    });
    if (!result.ok)
      console.error(
        `${context}: registerPrintLocation failed`,
        result.status,
        result.error,
      );
  } catch (err) {
    console.error(`${context}: registerPrintLocation failed`, err);
  }
}
```

- [ ] **Step 4: Remove the dead part of the test's fake client**

In `src/app/dashboard/booths/actions.test.ts`:

Delete the line `printkitMirrorError: null as { message: string } | null,` from the hoisted `state`, and the line `h.state.printkitMirrorError = null;` from `beforeEach`.

Replace the `update` fake

```ts
        update: (row: unknown) => {
          h.updateSpy(row);
          return {
            // Two distinct callers share this mock: the main booth
            // upsert chains .select().maybeSingle(); syncPrintLocation's
            // printkit_location_id mirror write awaits the .eq() result
            // directly. Thenable + chainable so both shapes work.
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve(h.state.updateResult),
              }),
              then: (
                resolve: (v: { error: { message: string } | null }) => void,
              ) => resolve({ error: h.state.printkitMirrorError }),
            }),
          };
        },
```

with

```ts
        update: (row: unknown) => {
          h.updateSpy(row);
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve(h.state.updateResult),
              }),
            }),
          };
        },
```

Leave `createServiceClient: makeClient` in the mock's return value.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/dashboard/booths/actions.test.ts`
Expected: PASS, every test in the file, including the `deleteBooth` deregistration tests.

- [ ] **Step 6: Stop the read**

In `src/app/dashboard/booths/[boothId]/page.tsx`, in the `select` string, remove `printkit_location_id, ` so it reads:

```ts
      "id, name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm, walkup_default, print_enabled, paykit_booking_id, daily_cup_cap, max_items_per_order",
```

and delete the line

```tsx
          printkit_location_id: booth.printkit_location_id,
```

In `src/app/dashboard/booths/booth-form.tsx`, delete the line

```ts
printkit_location_id: string | null;
```

from the `initial` prop type.

In `src/app/dashboard/booths/booth-form.dom.test.tsx`, delete all 7 lines that read `printkit_location_id: null,`.

In `supabase/tests/rls.test.sql`, replace

```sql
-- 0091: printkit_location_id is server-assigned only (syncPrintLocation
-- writes it via service-role) -- vendor D still owns this booth here.
```

with

```sql
-- 0091: printkit_location_id is not writable by a vendor. No application
-- code writes it; the column and this revoke stay -- vendor D still owns
-- this booth here.
```

- [ ] **Step 7: Check nothing else reads it, and that types and tests hold**

Run: `git grep -n "printkit_location_id" -- src`
Expected: matches only in `src/lib/types.ts` (three lines) and in the one test added in Step 1.

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

Run: `pnpm vitest run src/app/dashboard/booths/booth-form.dom.test.tsx "src/app/dashboard/booths/[boothId]/page.dom.test.tsx"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/booths/actions.ts src/app/dashboard/booths/actions.test.ts "src/app/dashboard/booths/[boothId]/page.tsx" src/app/dashboard/booths/booth-form.tsx src/app/dashboard/booths/booth-form.dom.test.tsx supabase/tests/rls.test.sql
git commit -m "refactor: stop storing printkit's location id on the booth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: qkit docs, gate, PR, live check

**Files:**

- Modify: `src/app/dashboard/booths/README.md`
- Modify: `src/hooks/README.md`
- Modify: `src/lib/printkit/README.md`
- Modify: `src/app/api/printkit/README.md`
- Modify: `src/app/api/printkit/print-status/README.md`
- Modify: `src/app/api/printkit/printer-status/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the qkit PR.

- [ ] **Step 1: Update the READMEs**

`src/app/dashboard/booths/README.md`: replace the sentence "Printing registration is best effort after a successful booth save/delete." with:

```markdown
Printing registration is best effort after a successful booth save/delete,
and nothing from Printkit's answer is stored on the booth
(`booths.printkit_location_id` is an unused column). The Printing section is
a switch, a status badge and one link. The link's address is the
`manage_url` Printkit sends with the status, so qkit builds no Printkit path
and carries no printer advice; both live in Printkit.
```

`src/hooks/README.md`: in the `use-printer-status.ts` bullet, replace "`none` (no printer set up), or `printer` with its name and whether it is online." with:

```markdown
`none` (no printer set up), or `printer` with its name and whether it is
online. `none` and `printer` also carry `manageUrl`, the printkit page for
this booth's printer as printkit names it, or null.
```

`src/lib/printkit/README.md`: at the end of the paragraph that begins "`getPrinterStatus(boothId)` is the newest of the three", add:

```markdown
Its answer also carries `manage_url`, the printkit page for this booth's
printer. The client keeps it only when it is an http(s) URL and reads
anything else, including no field at all, as null: the link is optional and
a bad one must never cost the vendor the status.
```

In the same file's Connectivity section, replace the sentence that begins "`NEXT_PUBLIC_PRINTKIT_URL` is also read directly (client-side," and runs to the end of that paragraph with:

```markdown
No browser code reads `NEXT_PUBLIC_PRINTKIT_URL`: the Printing section's
link comes from printkit's `manage_url`, not from a path built here.
`registerPrintLocation`'s returned id is not stored; printkit keys a
location on the booth id.
```

`src/app/api/printkit/README.md`: in the `printer-status/` bullet, after "whether a booth has a printer and whether it is reachable.", add:

```markdown
The answer also carries `manage_url`, the printkit page for that booth's
printer.
```

`src/app/api/printkit/print-status/README.md`: in the `route.ts` bullet, replace

```markdown
(`{order_id: string, status: "printed"|"failed", attempt_at: string}`) with a
local Zod schema,
```

with

```markdown
(`{source_ref?: string, order_id?: string, status: "printed"|"failed",
  attempt_at: string}`) with a local Zod schema. The order is named by
`source_ref`, or by `order_id` from a printkit release that predates it;
one is required, and a body where the two differ is a 400,
```

and in the `route.test.ts` bullet, add "and both names for the order" after "the 401/400/200/503 branches".

`src/app/api/printkit/printer-status/README.md`: at the end of the first `route.ts` paragraph, after "Then delegates to `getPrinterStatus` (`@/lib/printkit/client`).", add:

```markdown
The answer is the client's own, `manage_url` included, plus
`reachable: true`.
```

- [ ] **Step 2: Update the changelog**

In `CHANGELOG.md`, under `## [Unreleased]`, add as the **last** entry of its `### Changed` list (the entry directly above the next `### Added` heading), so the hunk sits away from other open PRs' entries:

```markdown
- The booth form's Printing section is a switch, the printer's status and one link. The link opens the page printkit names for that booth: the printer picker when the booth has no printer, the booth's printer when it has one. Advice on which printer to buy now lives in printkit only, where it is kept current. While printkit cannot be reached there is no link, since printkit is what supplies it.
- qkit no longer stores printkit's location id on a booth. `booths.printkit_location_id` stays as an unused column; no migration.
- The print-status callback accepts the order's id as `source_ref` or `order_id`.
```

- [ ] **Step 3: Run the full gate**

Run: `pnpm check`
Expected: exit 0.

Run: `pnpm test`
Expected: exit 0. About 13 minutes; run it in the background, keep the whole log, and run nothing else heavy meanwhile.

`pnpm test:e2e` is not run: this machine has no local Supabase. No e2e spec covers the Printing section or either printkit route.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add src/app/dashboard/booths/README.md src/hooks/README.md src/lib/printkit/README.md src/app/api/printkit/README.md src/app/api/printkit/print-status/README.md src/app/api/printkit/printer-status/README.md CHANGELOG.md
git commit -m "docs: record the thin Printing section and the callback's two names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/sharp-tesla-f7daf4
gh pr create --repo merqo-io/Qkit --base main --title "feat: the booth Printing section links where printkit says" --body "$(cat <<'EOF'
## What

- `printing-section.tsx` is a switch, the status badge and one link. The link's address is `manage_url` from printkit's status answer. The advice paragraph and both hardcoded printkit routes (`/dashboard/printers`, `/guides/bluetooth-printers`) are deleted. The "Printer offline" confirmation stays.
- `POST /api/printkit/print-status` accepts the order's id as `source_ref` or `order_id`. Both present and different is a 400.
- `saveBooth` no longer writes `booths.printkit_location_id` and the booth page no longer reads it. The column stays; no migration.
- Adds this phase's plan under `docs/superpowers/plans/`.

## Why

Phase R1 of `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`: printer knowledge and printkit's routes belong to printkit.

## Merge order

**Merge after merqo-io/Printkit's "name the printkit page for a location" PR is deployed.** Against a printkit without `manage_url` this branch shows the badge and no link.

## Behaviour that changes

- While printkit cannot be reached, the section shows no link. Before, it showed one built from `NEXT_PUBLIC_PRINTKIT_URL`.
- No browser code reads `NEXT_PUBLIC_PRINTKIT_URL` any more. If `.env.example` describes it as used for the booth page's link, that comment is now out of date; the agent does not read or edit env files.

## Verified

- `pnpm check && pnpm test` pass locally.
- DOM tests for the four status views (loading, unreachable, no printer, printer online and offline), route tests for both callback field names, client tests for a missing or unsafe `manage_url`.
- Not run: `pnpm test:e2e` (no local Supabase on this machine). No e2e spec covers these paths.
- Not verified live: state here what the check on TEST · Printing's edit page showed, once both PRs are deployed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Run the push in the background with a 600000 ms timeout and keep its log. If `CHANGELOG.md` or `src/app/dashboard/booths/README.md` conflicts with `main` because #219 merged first, sync `main` with the app's tool, keep both sides' text, and push again.

Expected: PR URL printed. Do not merge. Report both PR URLs to the owner, with the merge order: printkit first, deployed, then qkit.

- [ ] **Step 5: After both are live, check the booth edit page**

Only on the owner's go-ahead. Read-only: do not press Save, do not flip the switch, do not place an order.

1. Open `https://qkit.merqo.io/dashboard/booths/b979f487-c1a4-4208-a128-6e4d7afb6fde` (TEST · Printing) in the owner's signed-in browser.
2. In the Printing section, expect: the switch on, a status badge ("Printer connected" or "Printer offline") with the printer's name, and one link, "Manage this booth's printer in printkit →".
3. Read the link's `href`. Expect printkit's production host and the path `/dashboard/printers` with a `#booth-<id>` fragment.
4. Expect no sentence about iPads or Bluetooth, and no "read why" link.
5. Open the `href`. Expect printkit's printers list, signed in, with that booth's row in view.

Report what each step showed. The "no printer" link (to the picker) cannot be checked live: no test booth has printing on without a printer. It is covered by tests only. A real print through the callback's new field is the owner's to run.

Update the PR body's "Not verified live" line with the result.
