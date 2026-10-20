# qkit — Operations Runbook

Symptom-level triage for live-event issues. For a bad app deploy or a bad
migration specifically, see `ROLLBACK.md` instead — this doc is about
day-to-day operational symptoms, most of which need no code change at all.

## Self-serve, no dev needed

| Symptom                                                        | Fix                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A vendor's order is stuck in one status                        | The **vendor** advances/cancels it from their own dashboard board — this is normal vendor self-service, not an admin action. If they say they can't, check they're signed in as the right vendor. |
| Whole site / a booth page 500s right after a deploy            | Vercel dashboard → Deployments → find the last known-good one → "..." → **Promote to Production**. Instant, no rebuild. See `ROLLBACK.md`.                                                        |
| Customer says login redirects to `/login?error=oauth`          | They're on a preview (`*.vercel.app`) link, not `qkit.merqo.io`. `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` is Production-only by design (2026-08-13 incident) — send them the real domain.                 |
| Need to comp/extend a vendor's pass, resolve a support message | Already self-serve at `qkit.merqo.io/admin` — vendor detail page has Grant pass / Downgrade / Revoke; Feedback tab surfaces support messages.                                                     |
| Vendor asks to reconnect Telegram alerts                       | They reconnect once via merqo's own `/profile` page — old qkit-bot links don't carry over (Phase A2 migration, 2026-08-16), this is expected, not a bug.                                          |

## Check an env var before assuming a bug

These integrations **fail silently** by design — a missing/wrong secret looks
exactly like "the feature just doesn't fire," not an error. Before treating
any of these as a bug, check the var is set on Vercel → Production first:

| Reported symptom                                         | Env var to check                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PayNow / checkout doesn't show for a booth               | `PAYKIT_KIT_SECRET`                                                                                  |
| A payment changed in paykit but the order did not follow | `PAYKIT_CALLBACK_SECRET`, and `callback_url` / `callback_secret` on qkit's `paykit.kit_api_keys` row |
| Order never auto-prints                                  | `PRINTKIT_KIT_SECRET`, `PRINTKIT_CALLBACK_SECRET`, `NEXT_PUBLIC_PRINTKIT_URL`                        |
| No Telegram ping to vendor or customer                   | `MERQO_CUSTOMER_SECRET`, `MERQO_BASE_URL`                                                            |
| "Earn a stamp" link missing on order-status              | `NEXT_PUBLIC_LOOPKIT_URL`                                                                            |

## Migration-bearing PRs: staging first

Before merging a PR that adds a file under `supabase/migrations/`:

1. Apply only the new file(s) to the staging project, from the PR branch
   checkout, with `STAGING_DB_URL` set to the staging session pooler URI
   (merqo's `docs/STAGING.md`, setup step 2):
   `docker run --rm -e STAGING_DB_URL -v "${PWD}:/repo:ro" postgres:17.6-alpine sh /repo/scripts/staging-migrate.sh supabase/migrations/<new-file>.sql`
2. Check the PR's own Vercel preview end to end. Its `Preview` env vars
   already point at the staging project and merqo's staging host.
3. Merge the PR.
4. Apply the same file to production the usual way (Supabase SQL Editor).

## When it actually needs a dev (me)

- The env var above is confirmed set correctly and the feature still doesn't
  fire.
- A 500 that Promote-to-Production doesn't fix (points at a bad migration,
  not a bad deploy — see `ROLLBACK.md`'s DB section).
- Anything not covered above, or a genuinely new failure mode.

Hand over: exact error text, timestamp, vendor/booth name. Check
`qkit.merqo.io/admin`'s "Stuck Orders" tile and the vendor's "Last order"
timestamp first — both require authenticated platform-admin access and narrow
down whether it's one vendor or the whole platform.

## Parent

[docs](README.md)
