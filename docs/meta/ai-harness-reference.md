# AI harness reference

Moved from `AGENTS.md` (context diet). `AGENTS.md` keeps a short summary of what each hook class enforces.

## AI Harness

PreToolUse: `protect-files.sh` normalizes Windows and relative paths and
hard-blocks (exit 2) reads/writes to `.env*` (except `.env.example`/`.env.default`),
secrets directories and cert/credential files, and asks for human approval (via a `permissionDecision`
JSON payload) on other protected files (`AGENTS.md`/`CLAUDE.md`,
`docs/CONSTITUTION.md`, `.claude/settings.json`, `.claude/hooks/*`,
`.claude/agents/*`, `.mcp.json`, the harness manifest/verifier/regen scripts,
`Dockerfile`, `.gitleaks.toml`, `.husky/*`); `block-no-verify.sh`
blocks `--no-verify`/`-n` on `git commit`, `HUSKY=0`/`HUSKY_SKIP_HOOKS`/
`core.hooksPath=` bypasses, direct commits to `main`, force-push to a protected
branch, `git checkout/restore` on guard-layer files, and recursive-force `rm`
on source directories. App code, skills and specs are unrestricted. CI/CD workflow writes ask for
human approval; they are not hard-blocked. Governance reads are permitted.
UserPromptSubmit: `user-prompt-guard.cjs` emits advisory context for injection phrases
(so legitimate security investigation is permitted) and blocks embedded credentials — AWS keys, GitHub PATs,
Anthropic API keys, PEM blocks, DB/broker URLs (OWASP LLM02); exit 2 blocks.
PostToolUse: `post-edit-typecheck.sh` runs incremental `tsc --noEmit` after
every Edit/Write to a `.ts`/`.tsx` file and returns any errors through
`additionalContext` (feedback-only); `skill-usage-log.sh` logs every skill
invocation to `.claude/skill-usage.log`.
Stop: `stop-checks.sh` exits 0 when `stop_hook_active` (no re-entry loop) or
when nothing is uncommitted (no tracked change, no new untracked file); else
runs the test suite, exit 2 feeds failures back, exit 0 on pass.
SubagentStop: `subagent-stop.sh` type-gates a subagent's uncommitted `.ts`/`.tsx`
changes before it can hand back control; read-only `Explore`/`Plan` agents and
clean trees skip it.
Every hook command is anchored on `${CLAUDE_PROJECT_DIR}` and each script
`cd`s there first, so the hooks keep working after the shell changes
directory; each carries a timeout.
SessionStart (startup|resume|clear|compact): `session-context.sh` re-injects
all of `docs/CONSTITUTION.md` and a fixed list of always-on invariants (this
file is read through `CLAUDE.md`, not printed). PostCompact also fires after compaction and its
stdout is injected as context too — both PostCompact and
`SessionStart(source: compact)` are valid re-injection mechanisms, but
SessionStart also covers session resume and startup, so it stays the single
seeded path here.
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; static `deny` rules cover common secret
filenames and directories. The file-tool hook covers all `.env*` variants
except the blank templates. Static rules also cover build-artefact reads
(`node_modules`, `.next`, `dist`, `coverage`, `.turbo`, `*.tsbuildinfo`, root
and `./**/` forms), and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). `ask`
gates `Edit(...)` (covers both Edit and Write calls) on the medium-security
governance files: `AGENTS.md`,
`CLAUDE.md`, `docs/CONSTITUTION.md`, `.claude/harness.json`, `.claude/settings.json`,
`.claude/settings.local.json`. Deny always wins over ask/allow (enforced even
under bypass); it's a guardrail, not a sandbox — prefix-matched and
wrapper-bypassable. CI security: `.github/workflows/security.yml`
(gitleaks v3 + CodeQL + the fail-closed deps gate `.claude/deps-gate.sh`) and `.github/dependabot.yml` (security-only).
Git hooks (husky): `pre-commit` runs format/lint (`prettier`+`eslint --fix`
on staged `.ts/.tsx/.js/.mjs/.cjs`), format-docs (`prettier --write` on staged
`.json/.md/.css`), `tsc --noEmit`, a frozen-lockfile install check, a gitleaks
secret-scan on staged files (if gitleaks is installed), and the README-coupling
nudge (`.husky/lib/readme-coupling.sh`); `commit-msg` enforces Conventional
Commits (`.husky/lib/commit-msg-check.sh`); `pre-push` runs
`.claude/verify-harness.sh` (integrity check) plus `pnpm run check && pnpm
test`. The integrity verifier checks committed HEAD blobs; it does not check
uncommitted guard edits and is not currently a CI job. Config: `.husky/` (plain shell hook files, no native binary — migrated
2026-08-01 off lefthook, whose unsigned `lefthook.exe` Windows Smart App
Control blocks unconditionally; a cross-repo decision, see the
workspace-level design doc at
`../docs/superpowers/specs/2026-08-01-lefthook-to-husky-migration-design.md`,
outside this repo's own git tree).
Secret-scan ruleset: `.gitleaks.toml`.
RLS isolation: `supabase/tests/rls.test.sql` via `supabase test db`.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`
