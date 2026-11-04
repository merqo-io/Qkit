# .claude

## Purpose

The Claude Code agent harness for this project: hooks, project skills, harness integrity scripts, and the harness manifest that records what templateCentral seeded.

## Contents

- `deps-gate.sh` + `dep-audit-allow.txt`: the fail-closed dependency-audit gate
  run by `security.yml`, and its expiring advisory allowlist.
- `harness.json` — templateCentral drift-tracking manifest: records `templatecentral_version` (5.15.0), the stack adaptation note ("Next 16 + Supabase — not better-auth/Drizzle"), a running `review_note` log of what was/wasn't adopted from later templateCentral versions, `adoWiki`/`richReadme` (per-folder-README opt-ins from 5.10/5.11 — both explicit booleans, not left implicit), and `seeded_files` (per-file SHA-256 `origin_hash`) used to detect drift against the upstream template — now covering the full husky-based hook/git-hook layer plus the 5.13 comment-hygiene enforcement layer (see below), not just the pre-migration set.
- `comment-hygiene-patterns.txt` — the canonical change-narration/oversized-comment-block pattern list (13 lines: 10 anchored keyword patterns + a date/ticket-ref/issue-ref set) read at runtime by `hooks/post-edit-comment-check.sh`, `.husky/lib/comment-hygiene.sh`, and the `comment-hygiene` CI job — one source, three enforcement surfaces.
- `hooks/` — shell/JS scripts invoked by the hook commands wired in `settings.json`: `protect-files.sh`, `block-no-verify.sh`, `user-prompt-guard.cjs`, `post-edit-typecheck.sh`, `post-edit-comment-check.sh`, `post-tool-failure.sh`, `stop-checks.sh`, `subagent-stop.sh`, `session-context.sh`, `skill-usage-log.sh`, plus the pre-existing manual `verify.sh` gate (own README).
- `settings.json` — the hook wiring (`PreToolUse`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop`, `SessionStart`) plus the `permissions.allow/ask/deny` lists and `skillOverrides` that disable the templateCentral `add`/`scaffold`/`migrate` skills for this repo; see Connectivity below for what each hook actually runs.
- `verify-harness.sh` — harness integrity sensor: recomputes sha256 for every seeded file matched by a path guard (`hooks/`, `settings.json`, harness verifier/regen scripts, `comment-hygiene-patterns.txt`, `.husky/`, `.gitleaks.toml`, `.github/workflows/`) and compares to `harness.json`'s `origin_hash` baseline; read-only, exits non-zero on drift; run by husky's `pre-push` hook. It hashes committed HEAD blobs, not working-tree edits, and is not currently wired into CI.
- `regen-harness.sh` — human-run-only: rewrites every `origin_hash` in `harness.json` to match committed HEAD blobs, blessing an intentional harness edit; `protect-files.sh` requires human approval before an agent can even edit it.
- `skills/` — this project's slash-command skills (`changelog`, `next-verify`, `security-scan`, `supabase-migrate`).

## Connectivity

`settings.json` is the actual hook wiring (described narratively in `AGENTS.md`'s "AI Harness" section): `PreToolUse` runs `protect-files.sh` (secret/CI/governance-file protection, hard-block or ask-for-approval) and `block-no-verify.sh` (blocks hook-bypass and destructive git commands) on `Read|Edit|Write`/`Bash` respectively; `UserPromptSubmit` runs `user-prompt-guard.cjs` (advisory injection-phrase context and blocking credential screening); `PostToolUse` runs `post-edit-typecheck.sh` (incremental `tsc --noEmit` on `.ts`/`.tsx` edits, feedback-only), `post-edit-comment-check.sh` (change-narration/oversized-comment-block scan on TS/JS edits, feedback-only via `additionalContext`), and `skill-usage-log.sh` (logs skill invocations); `PostToolUseFailure` runs `post-tool-failure.sh` (surfaces failure context); `Stop` runs `stop-checks.sh` (full test suite, exit 2 forces a fix); `SubagentStop` runs `subagent-stop.sh` (type-gates a subagent's uncommitted TS changes); `SessionStart` (on `startup|resume|clear|compact`) runs `session-context.sh` (re-injects `AGENTS.md` routing context + `docs/CONSTITUTION.md` + always-on invariants). `hooks/verify.sh` remains a separate, manually-invoked verification gate (`pnpm build && pnpm check && pnpm test`) — not wired into any hook event itself. `skills/*/SKILL.md` are the slash commands Claude Code loads directly. Git-hook enforcement (pre-commit/commit-msg/pre-push) now lives outside `.claude/` in `.husky/` (repo root) — `verify-harness.sh` treats that, plus everything in `hooks/` and `settings.json` itself, as the integrity-checked enforcement layer recorded in `harness.json`.

## Parent

[qkit](../README.md)
