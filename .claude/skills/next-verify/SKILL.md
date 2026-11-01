---
name: next-verify
description: Run typecheck + lint + test + production build for this project in one pass.
allowed-tools: "Bash(pnpm *)"
---

Run `pnpm check && pnpm test && pnpm build` and report the results.

- `pnpm check` = `prettier --check` + `eslint` + `tsc --noEmit`; `pnpm test` = `vitest run`;
  `pnpm build` = production build, the only gate that catches Next.js
  client/server bundle-boundary errors.
- On failure, surface the failing output so it gets fixed at the root — never
  skip, `.skip`, or disable a check or test just to go green.

Note: the harness already covers part of this — the PostToolUse hook runs
incremental `tsc` after each edit and the Stop hook runs `pnpm test`. This skill's
unique value is the lint + format gate and the production build (no hook runs
those) plus one full-suite pass on demand.
