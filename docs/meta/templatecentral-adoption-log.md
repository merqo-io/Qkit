# templateCentral adoption log

Moved from `AGENTS.md` (context diet). Dated review and migration decisions, kept as history. A non-adoption recorded here is a deliberate choice, not drift to fix.

**5.0 → 5.7 review (2026-07-03):** version marker + `harness.json` bumped to 5.7.0.
Deliberately **not** adopted (Supabase-variant / bespoke-harness divergence, each
a conscious choice — don't let a future drift-check "fix" them):

- **pino route-logging enforcement** (5.7) — pino was removed as an unused dep;
  qkit's API surface (one route) logs via `console.error`, not the tc `withLogging`
  wrapper. No `scripts/check-route-logging.mjs` gate.
- ~~**lefthook** (5.2) — qkit uses husky + lint-staged; not migrating the git-hook system.~~
  Superseded — see the 2026-07-24 entry below.
- **tc CI gates + `.harness-base`** (5.2–5.3) — qkit has its own CI
  (`.github/workflows/{ci,security}.yml`); no harness re-sync base exists (seeded
  pre-5.3), so `migrate` Phase-5 3-way merge is N/A. (`verify-harness.sh` itself
  _was_ adopted as part of the 2026-07-24 lefthook migration, without the
  `.harness-base` 3-way-merge machinery.)
- **password min-12 on the login schema** (5.5) — would lock out existing 8-char
  sign-ins; Supabase Auth config owns the real policy.
- **`src/features/<name>/`** (2026-10-09 structure cleanup) — a feature's
  components live beside its routes in `src/app/**`, each folder with its own
  README. Moving them is hundreds of import edits for a layout that reads no
  better. Shared pieces do follow the standard: `src/components/widgets/`,
  `src/components/layout/`, `src/components/ui/`.
- **Barrel `index.ts` files** (same cleanup) — these folders mix Server and
  Client Components. A barrel re-exporting both pulls server code towards
  client bundles, and a Server Component importing a plain value through a
  `"use client"` barrel gets a client reference, not the value (the
  `SOCIAL_LINK_FIELDS` crash of 2026-09-18). Import by full path.

Adopted: build-artefact `Read` denies in `settings.json` (context hygiene, 5.4).

**Cherry-picked 5.8 comment gate (2026-07-10):** not a full 5.7→5.9 re-review,
just this one delta. `no-inline-comments` flipped `warn` → `error` (own-line
comments only, ignore-pattern for `eslint-`/`@ts-`/`prettier-`/coverage
directives) and `sonarjs/no-commented-code` added at `error` (blocks
committing dead commented-out code) — `eslint-plugin-sonarjs` is a new
devDependency. Both hard-block `pnpm check`/CI now. Test files and `scripts/`
keep `no-inline-comments` off (unchanged rationale: table-driven fixtures read
better with a trailing note).

**Unused-vars gate + harness permission fix (2026-07-16):** neither `tsconfig.json`
(no `noUnusedLocals`/`noUnusedParameters`) nor `eslint-config-next`'s own
`next/typescript` block flagged unused vars/imports — a real gap, found by
diffing against templateCentral 5.11's scaffold `eslint.config.mjs`. Added
`@typescript-eslint/no-unused-vars: 'warn'` (`^_`-prefix ignore pattern,
matching this project's existing convention), reusing the `@typescript-eslint`
plugin instance `eslint-config-next` already registers rather than adding a
second direct dependency on it. Caught one real dead import on first run
(`OrderStatusBadge` in the order-status page), now removed.

**Permission-rule correction (2026-07-17):** the 2026-07-16 entry above added
separate `Write(...)` ask-rules alongside `Edit(...)` for the governance files,
believing `Edit`/`Write` were independently matched. Verified this is wrong:
the permission-rule matcher covers `Write(path)` under `Edit(path)` — only
`Edit(...)` is needed. The redundant `Write(...)` entries were removed from
`.claude/settings.json`, back to `Edit(...)`-only.

**Lefthook migration (2026-07-24):** superseded the 2026-06-05 husky decision;
migrated the git-hook layer to lefthook and split the previously-inline
`node -e` one-liners in `.claude/settings.json` into standalone
`.claude/hooks/*` script files, to match the other 3 built-out kits'
(loopkit/stockkit/paykit) and merqo's harness architecture. `husky` +
`lint-staged` and `.husky/` are gone; `scripts/check-readme-freshness.mjs`
was replaced by `.lefthook/readme-coupling.sh` (same non-blocking nudge,
now run as a lefthook pre-commit command instead of a husky script).
Net-new: `lefthook.yml`, `.lefthook/`, `.gitleaks.toml`,
`.claude/verify-harness.sh` (harness integrity sensor, wired into
`pre-push` and CI) and `.claude/regen-harness.sh` (human-run-only baseline
rewrite). This also picks up the security hardening already reflected in
the hook scripts themselves: the `LEFTHOOK=0`/`core.hooksPath=` bypass block,
a broadened `--no-verify` regex, protected-branch/force-push/guard-file-checkout
guards, environment-file write protection, and OWASP LLM02 credential-leak detection in the prompt guard.
`SubagentStop` is a net-new hook (qkit previously had none). `harness.json`'s
`templatecentral_version` marker moved 5.7.0 → 5.11.0 — the 5.8–5.11 feature
deltas (comment gate, README governance/richReadme, unused-vars gate) were
already reviewed in the entries above; this migration closes the one
remaining architectural gap (the git-hook layer + hook-script-file layout).

**husky migration (2026-08-01):** superseded the 2026-07-24 lefthook decision
— lefthook's `lefthook.exe` is unsigned and Windows Smart App Control blocks
it unconditionally on this machine (Code Integrity events, "did not meet the
Enterprise signing level requirements"), which has no signed-binary
workaround (winget's `evilmartians.lefthook` package ships the identical
unsigned upstream binary). husky v9 has no native binary in its execution
path. Same enforcement rigor (every lefthook check ported into `.husky/*`
shell scripts); the Windows-path-with-space workarounds
(`.lefthook/commit-msg/commit-msg.sh`'s argv-rejoin wrapper) are deleted, not
ported — husky has no equivalent templating bug to work around. This was a
cross-repo decision (qkit/loopkit/stockkit/paykit/merqo all made the same
lefthook→husky call, not a qkit-local one) — see the workspace-level design
doc at `../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree, alongside the other cross-kit specs.

**No-em-dash hard gate (2026-09-01):** the house "no em dash in user-facing
copy" convention (already a standing rule, e.g. `[[project_tour_guide_retrigger_fix]]`'s
walk-up-copy fix) kept recurring because nothing actually enforced it — a
memory note isn't a gate. `eslint.config.mjs` now hard-blocks the literal
character (`—`) in `.tsx` `JSXText`, in the handful of JSX attrs that
routinely carry copy (`aria-label`/`title`/`placeholder`/`label`/`content`/
`description`), and in `toast.*` call arguments — scoped narrowly so it
can't false-positive on internal log/error strings or non-UI constants,
and it doesn't touch `.md` files at all (READMEs/CHANGELOG/specs keep
their own em-dash-heavy prose style, unaffected). Test files are excluded,
same as the other UI-only lint gates. Found and fixed 5 pre-existing
violations on first run (`banner-form.tsx` x2, `menu-manager.tsx`,
`settings-form.tsx`, `telegram-connect.tsx`).

**templateCentral 6.0.1 review (2026-10-11):** version marker and
`harness.json` moved 5.15.0 → 6.0.1. 6.0's headline claim, that 5.x hooks
never ran, did not apply here: it concerns an array-valued `command`, and
qkit's were shell strings that did fire. Adopted, each because it fixed
something real in this repo:

- Hook commands anchored on `${CLAUDE_PROJECT_DIR}`, with timeouts. The old
  relative paths resolved against the shell's current directory, so after a
  `cd` they could miss, or pick up another worktree's copy of the scripts.
- `stop-checks.sh` skips the test run on a clean tree; `subagent-stop.sh`
  skips read-only agents; `post-edit-typecheck.sh` reports through
  `additionalContext` (its plain stdout never reached the agent).
- The skill-usage matcher (`Skill__.*` never matched; now `Skill`).
- The per-segment `block-no-verify.sh`, ported to husky: closes a
  hook-skipping flag on push, `--force-with-lease`, `HEAD:main`, deleting a
  protected branch and `bash -c` wrappers, and stops blocking a commit piped
  to `tail -n`. A multi-line `-m "…"` message that quotes a blocked command
  is still read as a command; pass the message with `-F`.
- `protect-files.sh`: symlinked parents resolved, `notebook_path` read,
  relative paths anchored on the project root.
- `verify-harness.sh` fails on an unreadable or empty manifest.
- The commit-msg gate accepts `type(scope)!:` and the messages git writes
  itself (`Revert "…"`, `fixup!`, `squash!`, `amend!`).
- `post-tool-failure.sh` removed (the agent already sees tool errors).

Deliberately **not** adopted:

- **Exec-form hooks** (`"command": "bash", "args": [...]`). On Windows a
  bare `bash` resolved without a shell can be `System32\bash.exe`, the WSL
  launcher, rather than Git Bash, which would silently stop every hook. The
  shell-string form with a quoted `${CLAUDE_PROJECT_DIR:-.}` gets the same
  directory independence and was confirmed firing.
- **Stop timeout 300s.** This suite takes 9 to 16 minutes locally; 1200s.
- **`gitleaks git --pre-commit` and `[[allowlists]]`.** gitleaks is not
  installed on the machine this review ran on and the CI action's bundled
  scanner version is unverified, so neither form could be tested. The
  current `gitleaks protect --staged` and `[allowlist]` still work.
- **Narrowing the prompt guard's "disregard your" / "override your"
  phrases.** They only raise an advisory here, never a block.
- **lefthook, ESLint 10, pnpm 12, the CI gitleaks CLI, `.harness-base`,
  better-auth / Drizzle items.** Unchanged reasons; see the entries above.
- **pnpm ≥ 11.11.0 and `eslint-plugin-sonarjs` 4.2.2** are wanted (pnpm for
  two security advisories) and left for their own dependency PR.

**templateCentral 6.0.4 review (2026-10-12):** version marker and
`harness.json` moved 6.0.1 → 6.0.4. Adopted:

- 6.0.4's `block-no-verify.sh` change, ported line for line. A bare
  `git commit` / `git push` is judged by the branch it can land on: the
  hook input's `cwd`, plus every literal `cd`/`pushd`/`env -C`/`sudo -D`
  target in the command. Any protected candidate blocks. Before, a hook
  started from the session root read the main checkout's branch, so a
  worktree commit was blocked whenever that checkout sat on `main`.
  Anything the hook cannot resolve (a variable, `$(…)`, `eval`, a shell
  function, `--git-dir`) also judges the project root, so
  `cd "$W" && git commit` still blocks when the project root is on `main`;
  use a bare `git commit` or `git -C <literal path>`. A Windows drive path
  (`C:/…`) as a `cd` target counts as unresolved and falls back the same way.
- 6.0.2's fail-closed fix, applied to the `comment-hygiene` CI job: it now
  fails when `origin/<base>` is missing (an empty diff used to pass it) and
  reads the base branch from `env` instead of an inline
  `${{ github.base_ref }}`.

Already true here: CI/CD workflow edits ask for approval and are not
hard-blocked, and no `Edit`/`Write` deny sits on a CI or governance path.
Not adopted: the shared `.claude/ci-gates.sh` (qkit keeps its own CI),
`.claude/hooks/local/` (the hooks here are a hand-kept husky port, not a
canonical copy a re-sync overwrites), and every Azure DevOps and OpenCode
item in 6.0.2 to 6.0.4 (GitHub-only repo, Claude Code only).

## templateCentral 7.2.2 review (2026-11-04)

`harness.json` moved 6.0.4 → 7.2.2 by 3-way merge (6.0.4 upstream → 7.2.2
upstream, applied onto this repo's files so its local lines are kept), ported
from merqo-io/Merqo#128. Adopted:

- **6.0.5 `block-no-verify.sh` strict `&&` chain:** `cd <repo> && git commit` is
  judged only by the directories git runs in, so it passes from a `main`
  checkout when the `cd` lands on a feature branch. Anything that is not a
  strict chain of literal `cd`s keeps the starting directory as a candidate.
  Upstream's test cases are ported into `block-no-verify.test.sh`.
- **7.0.0 `session-context.sh`:** no longer prints `head -30 AGENTS.md`; the
  always-on invariants and `docs/CONSTITUTION.md` stay.
- **7.2.2 security:** `engines.node >=24.22.1` in `package.json` so no runtime
  trusts the compromised eMudhra intermediate CAs. Every `setup-node` step in
  `ci.yml` and `security.yml` is pinned to `node-version: 24.22.1`, because a
  bare `24` does not enforce the floor; bump the pin deliberately.
  `staging-sync.yml` and `tag-release.yml` set no Node version.
- **6.1.0/6.1.1 deps gate:** the `deps` case of upstream `ci-gates.sh` ported
  as a standalone `.claude/deps-gate.sh` (pnpm branch only). Fail-closed on
  high/critical advisories, a missing tool, no network or an unparseable
  report; rejects pnpm-native suppressions; expiring allowlist in
  `.claude/dep-audit-allow.txt`. `security.yml` runs it in place of
  `pnpm audit --prod --audit-level=high` and the informational `|| true` step.
  `protect-files.sh` asks before edits to the allowlist.

Not adopted:

- Authz helpers: better-auth only; authorization here is RLS.
- Portal `frame-ancestors`: appCentral only.
- Azure DevOps and OpenCode items.
- Template trees, `tc-copy.sh` and scaffold internals.
- Lefthook-only items (this repo is on husky).
- Prose prune of upstream docs.
- Build-artefact `Read` denies and the `skill-usage.log` gitignore entry: already present.
