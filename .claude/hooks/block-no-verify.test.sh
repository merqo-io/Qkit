#!/usr/bin/env bash
# Regression tests for block-no-verify.sh. Run: bash .claude/hooks/block-no-verify.test.sh
# Builds a throwaway repo (checkout on main) plus a feature-branch worktree under a path containing a
# space, then feeds the hook JSON inputs and asserts exit codes (0 = allowed, 2 = blocked).
set -u
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
hook="$here/block-no-verify.sh"
base=$(mktemp -d "${TMPDIR:-/tmp}/hook test XXXXXX")
trap 'rm -rf "$base"' EXIT

main="$base/main checkout"
wt="$base/work tree"
neutral="$base/neutral"
mkdir -p "$main" "$neutral"
git -C "$main" init -q -b main
git -C "$main" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$main" worktree add -q -b feature/x "$wt"

to_win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
to_mixed() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
to_posix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf '%s' "$1"; fi; }

fail=0
# usage: check <expected exit> <name> <hook cwd> <command>
check() {
  local want=$1 name=$2 cwd=$3 command=$4 json got
  json=$(CWD="$cwd" CMD="$command" node -e "process.stdout.write(JSON.stringify({cwd:process.env.CWD,tool_input:{command:process.env.CMD}}))")
  printf '%s' "$json" | CLAUDE_PROJECT_DIR="$(to_posix "$main")" bash "$hook" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then echo "ok   $name"; else echo "FAIL $name (want $want, got $got)"; fail=1; fi
}

wt_win=$(to_win "$wt");   wt_mixed=$(to_mixed "$wt");   wt_posix=$(to_posix "$wt")
mn_win=$(to_win "$main"); mn_mixed=$(to_mixed "$main"); mn_posix=$(to_posix "$main")

# Worktree on a feature branch: allowed.
check 0 "allow: git -C mixed-slash path"       "$neutral" "git -C \"$wt_mixed\" commit -m \"msg here\""
check 0 "allow: git -C posix /c/ path"         "$neutral" "git -C \"$wt_posix\" commit -m \"msg here\""
check 0 "allow: git -C backslash path"         "$neutral" "git -C \"$wt_win\" commit -m \"msg here\""
check 0 "allow: cd mixed-slash && git commit"  "$wt"      "cd \"$wt_mixed\" && git commit -m \"msg here\""
check 0 "allow: cd backslash && git commit"    "$wt"      "cd \"$wt_win\" && git commit -m \"msg here\""
check 0 "allow: bare commit, Windows-form cwd" "$wt_win"  "git commit -m \"msg here\""
check 0 "allow: git -C absolute from main cwd" "$main"    "git -C \"$wt_mixed\" commit -m \"msg here\""

# Checkout on main: still blocked.
check 2 "block: git -C mixed-slash path"       "$neutral" "git -C \"$mn_mixed\" commit -m \"msg here\""
check 2 "block: git -C posix /c/ path"         "$neutral" "git -C \"$mn_posix\" commit -m \"msg here\""
check 2 "block: git -C backslash path"         "$neutral" "git -C \"$mn_win\" commit -m \"msg here\""
check 2 "block: cd mixed-slash && git commit"  "$neutral" "cd \"$mn_mixed\" && git commit -m \"msg here\""
check 2 "block: cd backslash && git commit"    "$neutral" "cd \"$mn_win\" && git commit -m \"msg here\""
check 2 "block: bare commit, Windows-form cwd" "$mn_win"  "git commit -m \"msg here\""

# A cd target that cannot be resolved keeps the project-root (main) fallback.
check 2 "block: cd to unresolvable target"     "$wt"      "cd \"\$SOMEWHERE\" && git commit -m x"

# A strict && chain only reaches git after every cd before it succeeded, so a protected cwd drops out.
nl=$'\n'
q_wt="\"$wt_mixed\""
q_mn="\"$mn_mixed\""
check 0 "allow: strict chain cd feature && commit from main cwd"   "$main" "cd $q_wt && git commit -m x"
check 0 "allow: strict chain add && commit with 2>&1"              "$main" "cd $q_wt && git add -A && git commit -m x 2>&1"
check 0 "allow: strict chain true && cd && push -f HEAD"           "$main" "true && cd $q_wt && git push -f origin HEAD"
check 2 "block: strict chain cd feature && cd main && commit"      "$main" "cd $q_wt && cd $q_mn && git commit -m x"
check 2 "block: strict chain cd feature && git -C main commit"     "$main" "cd $q_wt && git -C $q_mn commit -m x"
# Anything short of a strict chain of literal cds keeps the protected cwd a candidate.
check 2 "block: cd feature || commit"                              "$main" "cd $q_wt || git commit -m x"
check 2 "block: subshell cd feature && commit"                     "$main" "(cd $q_wt && git commit -m x)"
check 2 "block: command cd inside chain"                           "$main" "cd $q_wt && command cd $q_mn && git commit -m x"
check 2 "block: env -C inside chain"                               "$main" "cd $q_wt && env -C $q_mn git commit -m x"
check 2 "block: assignment before git in chain"                    "$main" "cd $q_wt && x=1 git commit -m x"
check 2 "block: second line commit after chain"                    "$main" "cd $q_wt && git commit -m x${nl}git commit -m y"
check 2 "block: cd to missing dir && commit"                       "$main" "cd nosuch && git commit -m x"

# A hook cwd that does not exist must not weaken any check.
check 2 "block: missing cwd, --no-verify"      "C:\\nonexistent dir" "git commit --no-verify -m x"
check 2 "block: missing cwd, -n"               "C:\\nonexistent dir" "git commit -n -m x"
check 2 "block: missing cwd, bare commit (project root on main)" "C:\\nonexistent dir" "git commit -m x"

# Pre-existing protections.
check 2 "block: --no-verify"                   "$wt"      "git commit --no-verify -m x"
check 2 "block: force push to main"            "$wt"      "git push --force origin main"
check 2 "block: bash -c wrapper"               "$wt"      "bash -c \"git commit --no-verify -m x\""

exit "$fail"
