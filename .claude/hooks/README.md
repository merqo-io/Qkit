# hooks

## Purpose

The scripts `.claude/settings.json` wires to Claude Code lifecycle events —
the actual guardrail logic (secret/CI protection, commit hygiene, type
feedback, prompt-injection screening, skill-usage logging) behind the
harness.

## Contents

- `block-no-verify.sh` — PreToolUse(Bash): blocks `--no-verify`/`-n` on `git commit`, `HUSKY=0`/`HUSKY_SKIP_HOOKS`/`core.hooksPath=` bypasses, direct commits to `main`, force-push to a protected branch, `git checkout/restore` on guard-layer files, and recursive-force `rm` on source directories; exit 2 blocks
  Windows drive-letter paths (`C:\…`, `C:/…`) and quoted paths with spaces
  are normalised before the branch is judged, so worktree commits on feature
  branches pass.
- `block-no-verify.test.sh` — regression tests for the hook (run `bash .claude/hooks/block-no-verify.test.sh`).
- `post-edit-typecheck.sh` — PostToolUse(Edit\|Write), `.ts`/`.tsx` files only: runs incremental `tsc --noEmit` and surfaces the last 5 lines; feedback-only, never blocks
- `post-edit-comment-check.sh` — PostToolUse(Edit\|Write), `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs` files only: scans the edited file for change-narration comments (`// was X, now Y`) and oversized (`>5`-line) comment blocks against the patterns in `../comment-hygiene-patterns.txt`, surfacing hits via `hookSpecificOutput.additionalContext`; feedback-only, never blocks
- `post-tool-failure.sh` — PostToolUseFailure: writes the failed tool's name/error to stderr so the model can self-correct; always exits 0
- `protect-files.sh` — PreToolUse(Read\|Edit\|Write): normalizes relative and Windows paths; denies secret/credential reads and writes except blank environment templates; permits ordinary reads and application edits; asks before governance or CI/CD writes.
- `session-context.sh` — SessionStart(startup\|resume\|clear\|compact): re-injects the first 30 lines of `AGENTS.md`, all of `docs/CONSTITUTION.md` if present, and a fixed list of always-on invariants (secrets guard, quality gate, feature-branch rule, protected files, architecture boundaries)
- `skill-usage-log.sh` — PostToolUse(`Skill__.*`): appends a `timestamp\tskill-name` line to `.claude/skill-usage.log`; always exits 0; the data source for a future skill-usage audit
- `stop-checks.sh` — Stop: runs `pnpm test`; on failure, tails the last 20 lines to stderr and exits 2 to force a fix before the turn ends; short-circuits to exit 0 when `stop_hook_active` is true, avoiding a re-entry loop
- `subagent-stop.sh` — SubagentStop: if tracked `.ts`/`.tsx` files differ from HEAD or the index contains such changes, runs `tsc --noEmit` and exits 2 with the last 20 lines of errors, blocking a handback of broken code; untracked-only TypeScript files do not activate this gate
- `user-prompt-guard.cjs` — UserPromptSubmit: injection phrases produce advisory context so quoted attack examples can be investigated; credential-shaped input remains blocked (exit 2).
- `verify.sh` — standalone verification gate (`pnpm build && pnpm check && pnpm test`); not wired to any event in `settings.json`, kept as a manual/on-demand full-suite gate

## Connectivity

Every script here is inert on its own — `.claude/settings.json` is what
binds a script to a lifecycle event (matcher + command), and that binding
is what makes it a "hook" rather than a loose shell script. Most scripts
read the tool-call JSON from stdin (via an inline Node one-liner) to pull
`tool_input.file_path`/`command`/`prompt`; exit code conventions are
consistent across the set — `exit 2` blocks/forces a fix (stderr surfaces
to the model), a `permissionDecision: "ask"` JSON payload on stdout with
`exit 0` requires human approval, a `hookSpecificOutput.additionalContext`
JSON payload on stdout with `exit 0` surfaces feedback without blocking
(the only way a `PostToolUse` hook's output reaches the model — a plain
`echo` there goes to the debug log only), plain `exit 0` allows.
`post-edit-comment-check.sh` shares its pattern list with the warn-only
`.husky/lib/comment-hygiene.sh` pre-commit check and the hard
`comment-hygiene` CI gate in `.github/workflows/ci.yml` — one canonical
source, three enforcement surfaces of increasing strictness.
`verify-harness.sh`
(one level up, in `.claude/`) checks only manifest-listed enforcement paths using committed HEAD blobs.
Uncommitted changes are not verified; this sensor runs on pre-push and is not
currently a CI job.

## Parent

[.claude](../README.md)
