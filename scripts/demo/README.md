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

| Scene         | Episode | Layout | Status        | Notes                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------- | ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tour`        | none    | single | live-verified | Full flow. Payment beats run against the paykit mock (`pnpm demo:paykit`).                                                                                                                                                                                                                                                                           |
| `live-pop`    | 1       | split  | implemented   | Customer orders, ticket pops on the board, chime.                                                                                                                                                                                                                                                                                                    |
| `setup`       | 2       | single | implemented   | Vendor signed in unrecorded; on camera: add booth, sample menu, Go live card and QR, test order on the board. End card "Free to start". Skips PayNow; with the paykit mock up the Payment row shows ticked (only "Change payment" is visible, no PayNow details). The board's loading skeleton is cut out of the webm (`offCamera` in `record.mjs`). |
| `paynow`      | 3       | split  | live-verified | Runs against the paykit mock (`pnpm demo:paykit`). The mock pay page mirrors paykit (QR, screenshot upload, I've paid).                                                                                                                                                                                                                              |
| `status`      | 4       | split  | implemented   | Two orders seeded ahead, so "orders ahead of you" shows.                                                                                                                                                                                                                                                                                             |
| `tv-screen`   | 5       | single | implemented   | Portrait 640x880 pickup screen (landscape shrinks to unreadable text on a phone). Needs the qkit tier; see `DEMO_DB_URL`.                                                                                                                                                                                                                            |
| `options`     | 6       | single | implemented   | Milk and Sugar options, then the ticket.                                                                                                                                                                                                                                                                                                             |
| `walk-up`     | 7       | split  | implemented   | QR order, then New order for a walk-up.                                                                                                                                                                                                                                                                                                              |
| `batch`       | 8       | single | implemented   | 40 seeded orders; Start all, Mark all ready, Select all, Picked Up.                                                                                                                                                                                                                                                                                  |
| `sold-out`    | 9       | single | implemented   | Needs the qkit tier (stock limits); see `DEMO_DB_URL`.                                                                                                                                                                                                                                                                                               |
| `stats`       | 10      | single | implemented   | Free plan only: no history, trends or margin.                                                                                                                                                                                                                                                                                                        |
| `multi-booth` | 11      | single | implemented   | Needs the qkit tier (3 booths); see `DEMO_DB_URL`.                                                                                                                                                                                                                                                                                                   |
| `im-here`     | 12      | split  | implemented   | Booth set to hold prep until arrival.                                                                                                                                                                                                                                                                                                                |
| `come-back`   | 13      | single | live-verified | Needs `pnpm demo:merqo` and a dev server with its env; socials seeded by `seed-socials.sql`.                                                                                                                                                                                                                                                         |

Never on camera: label or sticker printing, iOS web-push prompts, loopkit
loyalty stamps, card payments.

Shared setup (sign up, onboarding, booth and menu) runs **unrecorded** for every
scene except `tour` and `setup`, so the clip opens on the interesting part. `setup`
records the booth and menu itself and only signs up and names the stall unrecorded.
A scene's optional `endLine` in `scenes.mjs` replaces the end card's subtitle.

## Files

| File                  | Does                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `scenes.mjs`          | Scene registry (hook and captions), argument parsing, caption wrapping. Pure.                          |
| `filters.mjs`         | ffmpeg filtergraph builders: single and split layout, captions, chime. Pure.                           |
| `reset.sql`           | Wipes the fixed demo account so each run starts identical                                              |
| `grant-qkit-tier.sql` | Gives the demo vendor the qkit tier; run by `record.mjs` only for scenes that show a gated feature     |
| `record.mjs`          | Drives the real app, records `out/<scene>/<role>.webm` + `steps.json`                                  |
| `merqo-mock.mjs`      | Stand-in for merqo's connect-token and notify endpoints (`pnpm demo:merqo`)                            |
| `seed-socials.sql`    | Gives the demo booth social links for the `come-back` footer; run by `record.mjs`                      |
| `trailer.mjs`         | Cuts `out/tour-trailer.mp4` (about 28s) from the composed live-pop, paynow, status and tv-screen clips |
| `compose.mjs`         | ffmpeg: layout, captions, chime, optional `assets/` music, writes `out/<scene>.mp4`                    |
| `base-url.mjs`        | Loopback-only guards for the app origin and `DEMO_DB_URL`                                              |
| `out/`                | Generated artifacts (git-ignored)                                                                      |

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
   use real payment credentials.
   For `come-back` also run `pnpm demo:merqo` (127.0.0.1:4320) and add
   `MERQO_BASE_URL=http://127.0.0.1:4320 MERQO_CUSTOMER_SECRET=demo-merqo-secret`
   to the dev server env. Without it the Telegram link is absent and the beat
   times out. The link shows only for orders that are not ready yet.
4. **ffmpeg** on PATH.
5. For `sold-out`, `multi-booth` and `come-back`: `DEMO_DB_URL` set to the local
   Postgres URL (from `pnpm exec supabase status`) and `psql` on PATH. Free
   plan has no stock limits and one booth, so these scenes run
   `grant-qkit-tier.sql` after sign-up. Loopback hosts only.

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

## Single mode and trailer

Single scenes sit in their own band (`SINGLE` in `filters.mjs`) between the hook
and the step captions, so captions never cover app UI. The batch and come-back
scenes hide toasts (`hideToasts`, an adopted stylesheet because the CSP blocks
injected `<style>`), and a "Saving…" label is swapped for its idle text so a save
never shows its transient state. batch seeds 40 orders four at a time and cuts
each bulk action's settle wait out of the clip (`offCamera`), so it runs about
15s on camera. come-back cuts the order, vendor and reorder page loads the same way.
After composing live-pop, paynow, status and tv-screen, `node scripts/demo/trailer.mjs`
cuts the trailer from them. Each cut stops before its clip's fade-out, and the
paynow cut drops the customer pane's reload just before the vendor taps Mark paid.

## Split mode

Split scenes record two browser contexts, `customer` (390x844 phone) and
`vendor` (the board, also phone size), and compose puts them side by side with
CUSTOMER and VENDOR labels, the hook on top and step captions below.

- The two recordings start at different moments. `record.mjs` writes each one's
  `startMs` on the scene clock (zero at the first recorded context) into
  `steps.json`; compose delays the later one with `tpad` so frames line up.
- The customer pane loads the booth page before the board opens. `readyMs` in
  `steps.json` marks when it settled; compose drops everything before it (0.3s
  when absent) and holds the first settled frame, so no pane opens blank.
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
- Verification status: `options`, `live-pop`, `tour`, `paynow`, `sold-out`,
  `multi-booth` and `come-back` were recorded
  and composed end to end against a local stack. The other scenes' locators
  were read from the components but not yet run live.
- `reset.sql` also seeds a cached "legal current" row for the demo email. The
  dashboard's legal gate asks merqo, which a local stack cannot reach, and
  would otherwise send the new vendor to `/legal/accept`.
- Run `reset.sql` only against the local stack (the `docker exec` into `supabase_db_qkit` below), never against a hosted database; nothing in code guards it.
- Without `psql` on PATH, the recorder falls back to `docker exec` into the db
  container (`DEMO_DB_CONTAINER`, default `supabase_db_qkit`). To reset by hand, pipe the SQL through the db container:
  `Get-Content scripts/demo/reset.sql | docker exec -i supabase_db_qkit psql -U postgres`.
- The board's live pop needs a working Realtime. An old local volume run with
  an older Realtime image than the one that created it fails with
  `ArgumentError ... out of range` on subscribe and the ticket never appears;
  `supabase stop` then `supabase start` on a current CLI, or a fresh volume,
  fixes it. Apply any newer migrations with `pnpm exec supabase migration up`.
- A failed beat saves `failure-*.png` of every open page into `out/<scene>/`.
- `DEMO_BROWSER_CHANNEL=msedge` (or `chrome`) launches an installed browser when the Playwright download will not start.
- Run `pnpm demo:merqo` for every scene, not only `come-back`: its legal-status answer keeps the demo vendor past the gate once the cached acceptance from `reset.sql` ages out (5 minutes).
- After `supabase db reset`, apply `supabase/seed/e2e-merqo-stub.sql` (the board needs the merqo schema stub) and restart the stack's realtime container if tickets do not pop.
- The booth form's Printing card is hidden in recorded contexts, so label printing never shows on camera.
- The board dismisses its first-visit tour popover on arrival and flips the phone's Incoming/Preparing/Ready tab to find a ticket.
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
