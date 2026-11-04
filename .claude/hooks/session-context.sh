#!/usr/bin/env bash
# SessionStart(startup|resume|clear|compact) — re-inject the universal invariants.
# AGENTS.md is not printed here: CLAUDE.md imports it (@AGENTS.md), so it is already in context.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

if [ -f docs/CONSTITUTION.md ]; then
  echo ""
  echo "=== Project invariants (docs/CONSTITUTION.md) ==="
  cat docs/CONSTITUTION.md
fi

cat <<'EOF'

## Always-on invariants (survive compaction)
1. Secrets are never read or written by the agent — .env*, secrets/** and .secrets/** are guarded.
2. Run the quality gate (pnpm check && pnpm test) before declaring any task done.
3. Work on a feature branch — never commit directly to main.
4. Protected files — AGENTS.md, CLAUDE.md, Dockerfile, .claude/settings.json, .claude/hooks/*, docs/CONSTITUTION.md — require human approval.
5. Respect the architecture/dependency boundaries documented in AGENTS.md and docs/CONSTITUTION.md.
EOF
