# actions

## Purpose

Server actions shared across routes rather than colocated with a single page — analytics events, feedback submission, purchase (upgrade) requests, and vendor support messages.

## Contents

- `events.ts` — `logEvent(type: EventType, metadata?)`. `EventType` is a Zod enum allowlist (`landing_cta`, `upgrade_cta`, `booth_view`, `order_placed`); rejects any other type and drops non-object or >1000-char-serialized `metadata` rather than risk a bad insert. Rate-limits 40 events/60s per client IP (via `clientIp`/`rateLimit` from `@/lib/rate-limit`, generous since several fire per page visit; fails open if the limiter RPC itself errors) before inserting. Best-effort/fire-and-forget: inserts into the `events` table via the server-only service client and never throws. Direct anonymous/authenticated inserts are revoked by migration `0095`, so clients cannot bypass this validation and limiter.
- `events.test.ts` — Vitest coverage for `logEvent`: allowlisted insert, rejection of an out-of-allowlist type, dropping oversized/non-object metadata, never throwing when the insert itself fails, dropping the event when rate-limited, and still logging (fail-open) when the limiter RPC itself errors.
- `feedback.ts` — `submitFeedback(input: FeedbackInput): Promise<ActionResult>`. Validates with `feedbackSchema`, rate-limits 3 submissions/5min per client IP (via `clientIp`/`rateLimit` from `@/lib/rate-limit`), then inserts through the `submit_feedback` SECURITY DEFINER RPC (the `feedback` table has no public INSERT policy) — the RPC re-derives `vendor_id` from `auth.uid()` for vendor-sourced feedback and validates the order access token for customer-sourced feedback.
- `feedback.test.ts` — tests customer/vendor submission paths, access-token threading, schema rejection of an empty submission, the rate-limit denial message, and RPC-failure handling.
- `purchase.test.ts` — tests the Zod rejection, the sign-in requirement, the rate-limit denial (before the idempotency check even runs), the idempotent no-op, a successful insert, and insert-failure handling.
- `support.ts` — `submitSupportMessage(input: SupportMessageInput): Promise<ActionResult>`. Validates via `supportMessageSchema`, requires a signed-in vendor, and files the message into the shared cross-kit `merqo.support_messages` table via the `merqo.submit_support_message` SECURITY DEFINER RPC (Task 5 exported as `submitSupportMessage` from `@/lib/merqo/support`) — the RPC derives `vendor_id` and `kit_slug` (="qkit") from `auth.uid()` and the kit context.
- `support.test.ts` — tests the signed-in RPC-call path with correct kit slug and parameters, empty-body rejection, bad-category rejection, the "please sign in" path, and RPC-failure handling.

## Connectivity

Each file is a `"use server"` module imported directly by the client components that trigger it (e.g. feedback forms, the support form), there is no shared dispatcher. Feedback, purchase and support use the session client and RLS or SECURITY DEFINER RPC authorization. Analytics uses the service client only after validating its public input; the shared rate limiter also uses the service client because its generic RPC is private. `events.ts`'s `logEvent` is also called from the landing page's CTAs and the order flow to track the scan→order conversion funnel that `admin/page.tsx` and `admin/activation-funnel.tsx` summarize.

## Parent

[app](../README.md)
