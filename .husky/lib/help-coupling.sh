#!/usr/bin/env bash
# Help-article freshness nudge. Invoked by husky's pre-commit hook. Never fails
# the commit; a parse problem prints nothing rather than blocking.
staged=$(git diff --cached --name-only 2>/dev/null || true)
[ -n "$staged" ] || exit 0
hits=""
for f in src/content/help/*/*.ts; do
  [ -f "$f" ] || continue
  info=$(awk '
    /^  slug: "/ && slug == "" { s = $0; sub(/^  slug: "/, "", s); sub(/".*/, "", s); slug = s }
    /^  title: "/ && title == "" { t = $0; sub(/^  title: "/, "", t); sub(/",?$/, "", t); title = t }
    /^  covers: \[/ { incov = 1; next }
    incov && /^  \]/ { incov = 0 }
    incov && /"/ { c = $0; sub(/^[^"]*"/, "", c); sub(/".*/, "", c); covers = covers c "\n" }
    END { printf "%s\t%s\n%s", slug, title, covers }
  ' "$f" 2>/dev/null) || continue
  head=$(printf '%s\n' "$info" | head -n 1)
  covers=$(printf '%s\n' "$info" | tail -n +2 | grep -v '^$' || true)
  [ -n "$covers" ] || continue
  matched=$(printf '%s\n' "$staged" | grep -Fxf <(printf '%s\n' "$covers") || true)
  if [ -n "$matched" ]; then
    slug=${head%%$'\t'*}
    title=${head#*$'\t'}
    hits="$hits  - $slug ($title)\n"
  fi
done
if [ -n "$hits" ]; then
  echo "⚠ staged files are covered by vendor help articles (commit still proceeds):"
  printf '%b' "$hits"
  echo "  Re-check these articles and bump their 'reviewed' date."
fi
exit 0
