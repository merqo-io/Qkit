#!/usr/bin/env bash
# Harness integrity sensor. Recomputes sha256 of the enforcement-layer seeded files and
# compares to the origin_hash baseline in .claude/harness.json. Read-only; exits non-zero
# on drift. Wired into CI and husky pre-push. Bless intentional changes with regen-harness.sh.
set -euo pipefail
manifest=".claude/harness.json"
[ -f "$manifest" ] || { echo "verify-harness: $manifest missing" >&2; exit 2; }

guard='^(\.claude/hooks/|\.claude/settings\.json$|\.claude/(verify|regen)-harness\.sh$|\.claude/comment-hygiene-patterns\.txt$|\.husky/|\.gitleaks\.toml$|\.github/workflows/)'

# Hashes the blob git actually has stored at HEAD for this path, not the working-tree
# file — a raw disk read is not portable: Windows checkouts with core.autocrlf=true
# silently rewrite LF blobs to CRLF on checkout, so hashing the disk copy produces a
# different digest than a fresh Linux/CI checkout of the exact same commit ever will.
sha() {
  if command -v sha256sum >/dev/null 2>&1; then
    git show "HEAD:$1" 2>/dev/null | sha256sum | cut -d' ' -f1
  else
    git show "HEAD:$1" 2>/dev/null | shasum -a 256 | cut -d' ' -f1
  fi
}
read_manifest() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.seeded_files | to_entries[] | "\(.value.path)\t\(.value.origin_hash)"' "$manifest"
  elif command -v node >/dev/null 2>&1; then
    node -e 'const m=require("./.claude/harness.json");for(const v of Object.values(m.seeded_files))console.log(v.path+"\t"+v.origin_hash)'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json;m=json.load(open(".claude/harness.json"));[print(v["path"]+"\t"+v["origin_hash"]) for v in m["seeded_files"].values()]'
  else echo "verify-harness: need jq, node, or python3" >&2; exit 3; fi
}

# A manifest that cannot be read, or that lists nothing to guard, must fail: an
# empty list would otherwise walk zero files and report the harness as intact.
entries=$(read_manifest | tr -d '\r') || { echo "verify-harness: $manifest is not readable JSON" >&2; exit 2; }
guarded=$(printf '%s\n' "$entries" | cut -f1 | grep -cE "$guard" || true)
[ "${guarded:-0}" -gt 0 ] || { echo "verify-harness: $manifest lists no enforcement files" >&2; exit 2; }

drift=0
while IFS=$'\t' read -r path origin; do
  printf '%s' "$path" | grep -qE "$guard" || continue
  case "$origin" in "<"*) continue;; esac
  if ! git cat-file -e "HEAD:$path" 2>/dev/null; then echo "MISSING:  $path" >&2; drift=1; continue; fi
  [ "$(sha "$path")" = "$origin" ] || { echo "MODIFIED: $path" >&2; drift=1; }
done <<< "$entries"

if [ "$drift" -ne 0 ]; then
  echo "❌ harness integrity drift. If intentional, a human runs: bash .claude/regen-harness.sh" >&2
  exit 1
fi
echo "✓ harness integrity OK"
