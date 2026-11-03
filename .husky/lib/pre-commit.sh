#!/usr/bin/env bash
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)

ts_files=$(printf '%s\n' "$staged" | grep -E '\.(ts|tsx|js|mjs|cjs)$' | grep -vE '(^|/)\.claude/hooks/|(^|/)\.claude/\.harness-base/' || true)
if [ -n "$ts_files" ]; then
  printf '%s\n' "$ts_files" | tr '\n' '\0' | xargs -0 pnpm exec prettier --write
  printf '%s\n' "$ts_files" | tr '\n' '\0' | xargs -0 pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored
  printf '%s\n' "$ts_files" | tr '\n' '\0' | xargs -0 git add
fi

docs_files=$(printf '%s\n' "$staged" | grep -E '\.(json|md|css)$' | grep -vE '(^|/)\.claude/\.harness-base/' || true)
if [ -n "$docs_files" ]; then
  printf '%s\n' "$docs_files" | tr '\n' '\0' | xargs -0 pnpm exec prettier --write
  printf '%s\n' "$docs_files" | tr '\n' '\0' | xargs -0 git add
fi

pnpm exec tsc --noEmit

if printf '%s\n' "$staged" | grep -qx 'package.json'; then
  pnpm install --frozen-lockfile
fi

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --no-banner
fi

bash .husky/lib/readme-coupling.sh
bash .husky/lib/help-coupling.sh
bash .husky/lib/comment-hygiene.sh
