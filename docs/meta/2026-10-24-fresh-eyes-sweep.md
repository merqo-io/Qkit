# Fresh-eyes sweep, close-out slice a (2026-10-24 roadmap, phase 8)

## Scope and method

Mechanical cleanup only: dead code reported by knip (backlog X-14) and the
CHANGELOG release stamp (X-15). No behaviour change.

Command, run from the worktree root: `pnpm dlx knip@6.44.2 --no-progress`.
knip is not a dependency.

| Category               | Before | After |
| ---------------------- | -----: | ----: |
| Unused files           |      4 |     0 |
| Unused devDependencies |      2 |     0 |
| Unlisted binaries      |      3 |     0 |
| Unused exports         |     54 |     0 |
| Unused exported types  |     22 |     0 |
| Duplicate exports      |      1 |     0 |
| Total                  |     86 |     0 |

Tests: no test file was added, removed or weakened, and the only change in
`test/` is dropping `export` from the `luminance` helper. The suite count is
unchanged from the staging baseline.

## Fixed

- Unused `export` keyword dropped where the symbol is still used in its own
  module: `CODE` (e2e), the `scripts/demo/filters.mjs` constants and `drawtext`,
  `DEFAULT_SCENE`, `RangeControl`, `PAYMENT_BUTTON`, `AmountDue`,
  `decodeEntities`, `stripComments`, `WEEKDAY_KEYS`, `TERMINAL_STATUSES`,
  `MAX_ORDER_LABELS`, `BOOTH_TZ`, `luminance`, the `schemas.ts` constants and
  schemas (`PASSWORD_MIN_LENGTH`, `MAX_MONEY_CENTS`, `MAX_CART_LINES`,
  `optionChoiceSchema`, `optionGroupSchema`, `selectedOptionSchema`,
  `menuCategorySchema`, `boothHoursSchema`, `printStatusSchema`,
  `orderItemSchema`), and the types `MenuGroupEntry`, `RenderMenuItem`,
  `TicketOption`, `TicketLine`, `PrinterSummary`, `VendorActivityMetric`,
  `EventPassWindow`, `OrderRef`, `HourBucket`, `GrossMargin`, `AllergenTag`.
- Symbols with no use at all removed: `sceneNames`, `entitlementResponseSchema`,
  `EntitlementPayload` and `EntitlementTier` (the only user of the payload
  alias), `PushSubscriptionInput`, `DisplayNameInput`, `PasswordChangeInput`,
  and the unused row aliases `Booth`, `Payment`, `Feedback`, `Admin`,
  `AdminAudit`, `OrderStatusEvent` in `src/lib/types.ts`. Regenerating types
  may bring the row aliases back; that is harmless but knip will flag them
  again.
- `HELP_CATEGORY_IDS` became the `HelpCategoryId` string union directly, since
  the array was only ever read as a type.
- shadcn files deleted: `src/components/ui/input-group.tsx` and
  `radio-group.tsx` (a full-repo grep found no reference). Unused parts removed
  from `dropdown-menu.tsx`, `popover.tsx`, `sheet.tsx` (`SheetTrigger`) and
  `toggle.tsx` (`Toggle`; `toggleVariants` stays for `toggle-group.tsx`).
  `AlertDialogPortal` and `AlertDialogOverlay` stay in the file and only leave
  the export list.
- Dev dependencies `@eslint/eslintrc` and `@tailwindcss/typography` removed.
  Neither is referenced from `eslint.config.mjs`, PostCSS, Vitest, Playwright,
  the CSS `@plugin` and `@import` lines or `.github/workflows`. The lockfile was
  updated with `pnpm remove`.
- READMEs updated: `src/components/ui/README.md`, `src/content/help/README.md`.
- CHANGELOG: `[Unreleased]` stamped as `## [0.5.0] - 2026-11-10` with no bullet
  lost, `package.json` version 0.4.4 to 0.5.0. Git tags come from
  `.github/workflows/tag-release.yml`, which patch-bumps the latest tag and
  reads neither `package.json` nor the CHANGELOG, so the bump does not affect
  tagging.

## Kept with reason

`knip.json` ignores `.claude/**` (other worktrees pollute the results) and:

- `public/sw.js`, issue type `files`: the service worker is loaded by URL from
  `service-worker-registrar.tsx`, so no import edge exists.
- `ffmpeg`, `ffprobe`, `psql` binaries: system tools called by the demo scripts
  in `scripts/demo/`, not packages.
- `src/lib/schemas.ts`, issue type `duplicates`: `orderBoothIdSchema` and
  `orderTokenSchema` are deliberate named aliases of `uuidSchema` that
  callers import for intent.

## Deferred

- None from knip. The `HELP_CATEGORY_IDS` array form could not stay without an
  export because ESLint rejects a value used only as a type.

## Needs owner

- Whether regenerated `src/lib/types.ts` should keep the unused row aliases.

## Not done here

- Loading skeletons (X-16) and folder READMEs (X-20) land in a follow-up PR.
- The `templatecentral:standards` drift check and a bundle-size comparison were
  not possible from a builder session.
