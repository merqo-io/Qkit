#!/usr/bin/env bash
# Conventional Commits gate. Invoked by husky's commit-msg hook with the message file as $1.
set -euo pipefail
msg=$(head -1 "$1")

case "$msg" in
  Merge\ *|"chore(release):"*) exit 0 ;;
  # What git writes itself: `git revert`, and the autosquash markers.
  Revert\ \"*|fixup!\ *|squash!\ *|amend!\ *) exit 0 ;;
esac

# `!` before the colon marks a breaking change (Conventional Commits 1.0).
pattern='^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\([a-z0-9/_-]+\))?!?: .{1,100}$'
if ! printf '%s' "$msg" | grep -qE "$pattern"; then
  {
    echo "❌ Commit message must follow Conventional Commits:"
    echo "   <type>(<scope>): <description>   e.g.  feat(auth): add OAuth2 sign-in"
    echo "   types: feat fix chore docs style refactor test ci perf build revert"
    echo "   your message: $msg"
  } >&2
  exit 1
fi
