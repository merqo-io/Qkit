# Demo video generator

Produces vertical (9:16) screen footage of qkit for sending to a prospect and
for an Instagram series, one reel per feature. Each **scene** is recorded with
`record.mjs`, then composed with `compose.mjs` into a 1080x1920 mp4 with a hook
headline, step captions and an order chime. The default scene, `tour`, is the
full walkthrough: **register, name your stall, add menu, QR, customer orders,
order lands live, turn on payment, customer pays, vendor taps Mark paid &
start, Mark Ready, Mark Picked Up**.

> Runs against `DEMO_BASE_URL` (default `http://localhost:3000`). If port 3000
> is taken, start `pnpm dev` on another port and set `DEMO_BASE_URL` to match.
> Only loopback HTTP(S) origins are accepted, for every browser context. This
> guard limits the app target; run that app against local Supabase and a local
> paykit as well.

Spec: [`docs/superpowers/specs/2026-06-24-demo-video-generator-design.md`](../../docs/superpowers/specs/2026-06-24-demo-video-generator-design.md).
The stages stay decoupled by file: `compose.mjs` runs from `out/<scene>/`
alone, so a caption or layout change never needs a re-record.

## Scenes

`node scripts/demo/record.mjs --list` prints this table. Unknown scene names
exit non-zero with the list.

| Scene         | Episode | Layout | Status      | Notes                                                                                        |
| ------------- | ------- | ------ | ----------- | -------------------------------------------------------------------------------------------- |
| `tour`        | none    | single | implemented | Full flow. Payment beats run against the paykit mock (`pnpm demo:paykit`).                   |
| `live-pop`    | 1       | split  | implemented | Customer orders, ticket pops on the board, chime.                                            |
| `setup`       | 2       | single | implemented | Sign up, stall name, menu, QR, all on camera.                                                |
| `paynow`      | 3       | split  | implemented | Shows paykit's real hosted pay page; needs the local paykit stack (see "Real paykit stack"). |
| `status`      | 4       | split  | implemented | Two orders seeded ahead, so "orders ahead of you" shows.                                     |
| `tv-screen`   | 5       | single | implemented | Landscape 1280x720 pickup screen.                                                            |
| `options`     | 6       | single | implemented | Milk and Sugar options, then the ticket.                                                     |
| `walk-up`     | 7       | split  | implemented | QR order, then New order for a walk-up.                                                      |
| `batch`       | 8       | single | implemented | 8 seeded orders; Start all, Mark all ready, Select all, Picked Up.                           |
| `sold-out`    | 9       | single | implemented | Needs the qkit tier (stock limits); see `DEMO_DB_URL`.                                       |
| `stats`       | 10      | single | implemented | Free plan only: no history, trends or margin.                                                |
| `multi-booth` | 11      | single | implemented | Needs the qkit tier (3 booths); see `DEMO_DB_URL`.                                           |
| `im-here`     | 12      | split  | implemented | Booth set to hold prep until arrival.                                                        |
| `come-back`   | 13      | single | implemented | Needs `pnpm demo:merqo` and a dev server with its env; socials seeded by `seed-socials.sql`. |

Never on camera: label or sticker printing, iOS web-push prompts, loopkit
loyalty stamps, card payments.

Shared setup (sign up, onboarding, booth and menu) runs **unrecorded** for every
scene except `tour` and `setup`, so the clip opens on the interesting part.

## Files

| File                  | Does                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `scenes.mjs`          | Scene registry (hook and captions), argument parsing, caption wrapping. Pure.                              |
| `filters.mjs`         | ffmpeg filtergraph builders: single and split layout, captions, chime. Pure.                               |
| `paykit-stack.mjs`    | Copies paykit's migrations to a scratch Supabase project and starts or stops it (`pnpm demo:paykit-stack`) |
| `seed-paykit.sql`     | Per-run paykit rows: the demo vendor's PayNow config and qkit's kit key                                    |
| `merqo-mock.mjs`      | Stand-in for merqo's connect-token and notify endpoints (`pnpm demo:merqo`)                                |
| `seed-socials.sql`    | Gives the demo booth social links for the come-back footer                                                 |
| `reset.sql`           | Wipes the fixed demo account so each run starts identical                                                  |
| `grant-qkit-tier.sql` | Gives the demo vendor the qkit tier; run by `record.mjs` only for scenes that show a gated feature         |
| `record.mjs`          | Drives the real app, records `out/<scene>/<role>.webm` + `steps.json`                                      |
| `compose.mjs`         | ffmpeg: layout, captions, chime, optional `assets/` music, writes `out/<scene>.mp4`                        |
| `base-url.mjs`        | Loopback-only guards for the app origin and `DEMO_DB_URL`                                                  |
| `out/`                | Generated artifacts (git-ignored)                                                                          |

## Prerequisites

1. **Docker Desktop running.**
2. Local Supabase up + schema applied:
   ```bash
   pnpm exec supabase start
   pnpm exec supabase db reset
   ```
3. **The paykit mock and `pnpm dev`.** The recorder starts neither. In one
   terminal run `pnpm demo:paykit` (the e2e mock on 127.0.0.1:4319; it serves
   checkout, claim, confirm, the pay page and a PayNow vendor config, which
   unlocks the "Take payment" switch). In another, start the app with the
   mock in the process env (these override `.env.local`):
   ```bash
   NEXT_PUBLIC_PAYKIT_URL=http://127.0.0.1:4319 PAYKIT_KIT_SECRET=e2e-mock-secret pnpm dev
   ```
   The mock's pay page is a plain test fixture, not paykit's real page. Do not
   use real payment credentials. `paynow` shows the real page instead; see
   "Real paykit stack" below.
   For `come-back` also run `pnpm demo:merqo` (127.0.0.1:4320) and add
   `MERQO_BASE_URL=http://127.0.0.1:4320 MERQO_CUSTOMER_SECRET=demo-merqo-secret`
   to the dev server env. Without it the Telegram link is absent and the beat times out. The link shows
   only for orders that are not ready yet.
4. **ffmpeg** on PATH.
5. For `sold-out`, `multi-booth` and `come-back`: `DEMO_DB_URL` set to the local
   Postgres URL (from `pnpm exec supabase status`) and `psql` on PATH. Free
   plan has no stock limits and one booth, so these scenes run
   `grant-qkit-tier.sql` after sign-up. Loopback hosts only. Without `psql`,
   the recorder pipes the SQL through `docker exec` into the container named by
   `DEMO_DB_CONTAINER` (default `supabase_db_qkit`). That fallback ignores
   `DEMO_DB_URL` for the connection, but the variable must still be set (for
   example `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## Real paykit stack (for `paynow`)

paykit's own Supabase project would collide with qkit's ports, so the helper
copies paykit's migrations into a scratch project (id `paykit_demo`, every port
shifted by +100) outside both repos. Nothing in `../paykit` or qkit's
`supabase/config.toml` is touched.

```bash
export DEMO_PAYKIT_REPO="/path/to/paykit"   # default ../paykit; needed from a nested worktree
pnpm demo:paykit-stack up                    # scratch stack: API 54421, DB 54422, studio 54423
```

Then run paykit with the scratch stack's URL and keys (from
`pnpm exec supabase status -o env --workdir <tmpdir>/qkit-demo-paykit`):

```bash
# in the paykit repo
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... pnpm exec next dev -p 3002
```

and run qkit as a production build with the kit secret and callback secret (any
64 hex chars for the kit secret; paykit stores only its sha256). Use
`pnpm build && pnpm start`, not `pnpm dev`: in dev, React StrictMode closes the
board's realtime channel on its double mount, so the vendor board shows "Live
updates interrupted, reconnecting" for the whole recording.

```bash
NEXT_PUBLIC_PAYKIT_URL=http://127.0.0.1:3002 PAYKIT_KIT_SECRET=<64 hex> PAYKIT_CALLBACK_SECRET=<any> pnpm build
PAYKIT_KIT_SECRET=<64 hex> PAYKIT_CALLBACK_SECRET=<any> pnpm start -p 3001
```

Record with the same values so the recorder can seed paykit per run
(`seed-paykit.sql`):

```bash
DEMO_PAYKIT_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres DEMO_PAYKIT_KIT_SECRET=<the PAYKIT_KIT_SECRET above> DEMO_PAYKIT_CALLBACK_SECRET=<the PAYKIT_CALLBACK_SECRET above> node scripts/demo/record.mjs --scene paynow
```

`DEMO_PAYKIT_DB_CONTAINER` (default `supabase_db_paykit_demo`) is the `docker exec`
fallback when `psql` is missing. paykit only calls a kit back over https, which
a loopback stack cannot serve, so after the customer claims, the recorder posts
the same notification to qkit's `/api/paykit/payment-status`; qkit then reads
the status from paykit as in production. Stop the stack with
`pnpm demo:paykit-stack down`.

## Run

```bash
# 1. Clean state (every run, local db url from `pnpm exec supabase status`)
psql "<LOCAL_DB_URL>" -f scripts/demo/reset.sql

# 2. Record one scene (opens headed phone-sized browsers and drives the flow)
node scripts/demo/record.mjs --scene live-pop

# 3. Compose the captioned vertical mp4
node scripts/demo/compose.mjs --scene live-pop
#    -> scripts/demo/out/live-pop.mp4
```

Omit `--scene` for the full `tour`. Run `reset.sql` before every record, since
each scene signs the demo account up itself.

## Split mode

Split scenes record two browser contexts, `customer` (390x844 phone) and
`vendor` (the board, also phone size), and compose puts them side by side with
CUSTOMER and VENDOR labels, the hook on top and step captions below.

- The two recordings start at different moments. `record.mjs` writes each one's
  `startMs` on the scene clock (zero at the first recorded context) into
  `steps.json`; compose delays the later one with `tpad` so frames line up.
- Captions and the chime (`popMs`, when the order lands or turns Ready) use that
  same clock.
- `steps.json` shape: `{scene, mode, hook, popMs, videos: [{role, file,
startMs, viewport}], steps: [{caption, startMs, endMs}]}`.

## Tuning

- **Copy:** hook and step captions live in `scenes.mjs`; no em dash (a test in
  `test/demo-scenes.test.ts` enforces it). Compose reads them from `steps.json`
  for steps, and the hook from there too, so edit `steps.json` to retune copy
  without re-recording.
- **Pacing:** `DEMO_SPEED` (default 0.75, lower is faster) and the `beat(...)`
  waits in `record.mjs`. Unrecorded setup runs without waits.
- **Identity / menu:** the `EMAIL` / `STALL` / `ITEMS` constants at the top of
  `record.mjs` (keep `EMAIL` in sync with `reset.sql` and `grant-qkit-tier.sql`).
- **Captions blank?** ffmpeg can't find the font. Set `DEMO_FONT` to a `.ttf`.
- **A beat times out?** The app markup moved. Fix that locator in `record.mjs`,
  not the timeout.
- **QR/share-link shows `localhost`?** Start the dev server with
  `NEXT_PUBLIC_DEMO_ORIGIN_OVERRIDE` set to the real domain (see
  `booth-qr-poster.tsx`). Never set it on a real dev/prod server.
- **Background music:** see `assets/README.md`. No file means chime only.

## Notes

- Records against **local** Supabase only, never prod.
- The "other person" in a scene (a walk-in, the crowd on a busy board) is an
  unrecorded browser context, so tickets arrive through the real realtime
  subscription.
- Verification status: `tour`, `paynow`, `sold-out`, `multi-booth`,
  `come-back`, `options` and `live-pop` were recorded and composed end to end
  against a local stack. The other scenes' locators were read from the
  components but not yet run live.
- `reset.sql` also seeds a cached "legal current" row for the demo email. The
  dashboard's legal gate asks merqo, which a local stack cannot reach, and
  would otherwise send the new vendor to `/legal/accept`.
- Run `reset.sql` only against the local stack (the `docker exec` into `supabase_db_qkit` below), never against a hosted database; nothing in code guards it.
- Without `psql` on PATH, pipe the SQL through the db container:
  `Get-Content scripts/demo/reset.sql | docker exec -i supabase_db_qkit psql -U postgres`.
- The board's live pop needs a working Realtime. An old local volume run with
  an older Realtime image than the one that created it fails with
  `ArgumentError ... out of range` on subscribe and the ticket never appears;
  `supabase stop` then `supabase start` on a current CLI, or a fresh volume,
  fixes it. Apply any newer migrations with `pnpm exec supabase migration up`.
- A new booth's menu is built on its own page after the first save, so the
  recorder saves the booth, then adds items on `/menu` and lands on the QR page.

## Structure

### Contents

- `assets/`
- `base-url.mjs`
- `compose.mjs`
- `filters.mjs`
- `record.mjs`
- `reset.sql`
- `scenes.mjs`
- `grant-qkit-tier.sql`

### Connectivity

`scenes.mjs` is the contract between the stages. `record.mjs` drives the real
app and writes `out/<scene>/` (webms + `steps.json`); `compose.mjs` reads those
and `filters.mjs` builds the ffmpeg graph, rendering `out/<scene>.mp4`.
`assets/` holds the optional music bed.

## Parent

[scripts](../README.md)
