#!/usr/bin/env bash
# PreToolUse(Bash) — block hook-bypass and destructive git/shell commands. Exit 2 = block.
# Best-effort tripwire, not a security boundary: a determined shell can always obfuscate.
# The husky + CI layers are the backstop.
orig_dir=$PWD   # Claude's current directory — used to resolve the branch a bare `git commit` targets
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || { echo "BLOCKED: block-no-verify.sh cannot cd to the project root — refusing the command." >&2; exit 2; }
input=$(cat)
cmd=$(printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{process.stdout.write(((JSON.parse(b||'{}').tool_input)||{}).command||'')}catch(e){process.stdout.write('')}})" 2>/dev/null)
[ -z "$cmd" ] && exit 0
# Drop heredoc bodies (a commit message saying "git push --force origin main" is text, not a command):
# from a line opening `<<WORD` / `<<-'WORD'` / `<<"WORD"` (not the `<<<` here-string) through the
# line equal to WORD (leading tabs allowed for `<<-`). The opening line itself is still scanned.
cmd=$(printf '%s\n' "$cmd" | awk '
  inh { t = $0; if (tabs) sub(/^\t+/, "", t); if (t == w) inh = 0; next }
  { print; l = $0; gsub(/<<</, "", l)
    if (match(l, /<<-?[[:space:]]*["\047]?[A-Za-z_][A-Za-z0-9_]*/)) {
      w = substr(l, RSTART, RLENGTH); tabs = (w ~ /^<<-/); sub(/^<<-?[[:space:]]*["\047]?/, "", w); inh = 1 } }')
block() { echo "BLOCKED: $1" >&2; exit 2; }
# Branch a bare commit/push targets: Claude's cwd first, else the project root.
cur_branch() { git -C "$orig_dir" ${cdir:+-C "$cdir"} rev-parse --abbrev-ref HEAD 2>/dev/null || git ${cdir:+-C "$cdir"} rev-parse --abbrev-ref HEAD 2>/dev/null; }
protected='main'

# Normalise before flag-matching:
#  1. unwrap `bash|sh|zsh -c "…"` / `eval "…"` so a wrapped command is scanned, not scrubbed away;
#  2. unquote quoted single words ("--no-verify", "main") — the shell strips those quotes too;
#  3. replace remaining (multi-word) quoted strings with a placeholder (Q) so text inside
#     -m "…" can't false-trigger. Double quotes are handled before single quotes so an
#     apostrophe inside "it's done" can't pair with a later ' and swallow real flags.
sq="'"
scan=$(printf '%s' "$cmd" | sed -E \
  -e "s/(^|[[:space:];&|(])(bash|sh|zsh|eval)([[:space:]]+-[a-z]*c)?[[:space:]]+\"([^\"]*)\"/\1 \4 /g" \
  -e "s/(^|[[:space:];&|(])(bash|sh|zsh|eval)([[:space:]]+-[a-z]*c)?[[:space:]]+${sq}([^${sq}]*)${sq}/\1 \4 /g" \
  -e "s/\"([^\"${sq}[:space:]]*)\"/\1/g" -e "s/\"[^\"]*\"/ Q /g" \
  -e "s/${sq}([^${sq}[:space:]]*)${sq}/\1/g" -e "s/${sq}[^${sq}]*${sq}/ Q /g")

# Hook-layer bypass via environment or a persisted alias/config (whole-command checks).
lower_cmd=$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')
if printf '%s' "$scan" | grep -qE '(^|[^A-Za-z0-9_])HUSKY(_SKIP_HOOKS)?=' && printf '%s' "$scan" | grep -qE '(^|[^A-Za-z0-9_-])git([[:space:]]|$)'; then
  block "HUSKY=0 / HUSKY_SKIP_HOOKS disables husky's hook layer (pre-commit/commit-msg/pre-push) — the same bypass as --no-verify. Fix the failure instead."
fi
if printf '%s' "$lower_cmd" | grep -qE 'git_config_(parameters|key_[0-9]+)' && printf '%s' "$lower_cmd" | grep -q 'hookspath'; then
  block "GIT_CONFIG_* overriding core.hooksPath disables the git-hook layer. Fix the failure instead."
fi
if printf '%s' "$lower_cmd" | grep -q 'alias\.' && printf '%s' "$lower_cmd" | grep -q 'no-verify'; then
  block "a git alias wrapping --no-verify is the same bypass as --no-verify. Fix the failure instead."
fi

# Evaluate each simple command separately: split on && || ; | & ( ) ` and newlines.
segments=$(printf '%s\n' "$scan" | tr ';|&()`' '\n\n\n\n\n\n')
while IFS= read -r seg; do
  read -ra t <<< "$seg"
  n=${#t[@]}; i=0
  while [ "$i" -lt "$n" ]; do              # locate the git executable (git, /usr/bin/git, \git)
    w="${t[$i]#\\}"
    [[ "$w" == git || "$w" == */git ]] && break
    i=$((i + 1))
  done
  [ "$i" -ge "$n" ] && continue
  i=$((i + 1)); cdir=""
  while [ "$i" -lt "$n" ] && [[ "${t[$i]}" == -* ]]; do   # git global options precede the subcommand
    o="${t[$i]}"
    case "$o" in
      -C) cdir="${t[$((i + 1))]:-}"; i=$((i + 2)); continue ;;
      -c|--config-env)
        printf '%s' "${t[$((i + 1))]:-}" | grep -qi 'core\.hookspath' && block "'git -c core.hooksPath=…' disables the git-hook layer — the same bypass as --no-verify. Fix the failure instead."
        i=$((i + 2)); continue ;;
      --git-dir|--work-tree|--namespace|--exec-path|--super-prefix) i=$((i + 2)); continue ;;
    esac
    printf '%s' "$o" | grep -qi 'core\.hookspath' && block "overriding core.hooksPath disables the git-hook layer. Fix the failure instead."
    i=$((i + 1))
  done
  sub="${t[$i]:-}"; i=$((i + 1))
  args=("${t[@]:$i}")

  case "$sub" in
    commit|push|merge|am|rebase|cherry-pick|revert|pull)
      for a in "${args[@]}"; do
        [ "$a" = "--" ] && break
        [[ "$a" == --no-veri* ]] && block "--no-verify on 'git $sub' bypasses the git hooks. Fix the failure instead."
      done ;;
  esac

  case "$sub" in
    commit)
      skip=0
      for a in "${args[@]}"; do
        [ "$a" = "--" ] && break
        if [ "$skip" -eq 1 ]; then skip=0; continue; fi
        case "$a" in
          --*) ;;
          -?*)   # short-flag cluster: walk letters; a value-taking flag consumes the rest (or the next word)
            f="${a#-}"
            while [ -n "$f" ]; do
              c="${f:0:1}"; f="${f:1}"
              case "$c" in
                n) block "-n (--no-verify) on git commit bypasses the pre-commit hooks. Fix the failure instead." ;;
                m|F|c|C|t|S|u) [ -z "$f" ] && [ "$c" != "S" ] && [ "$c" != "u" ] && skip=1; break ;;
              esac
            done ;;
        esac
      done
      branch=$(cur_branch)
      [[ "$branch" =~ ^($protected)$ ]] && block "direct commit to protected branch '$branch'. Create a feature branch first."
      ;;
    push)
      force=0; target=0; explicit=0; pos=0
      for a in "${args[@]}"; do
        case "$a" in
          --force|--force=*|--force-with-lease|--force-with-lease=*|--force-if-includes|--mirror) force=1 ;;
          --delete) force=1 ;;
          --*) ;;
          -*) [[ "${a#-}" == *[fd]* ]] && force=1 ;;
          *)
            pos=$((pos + 1))
            [ "$pos" -eq 1 ] && continue   # first positional is the remote
            explicit=1
            [[ "$a" == +* || "$a" == :* ]] && force=1   # +refspec forces; :branch deletes
            [[ "$a" =~ ^\+?((refs/heads/)?($protected)|[^:]*:(refs/heads/)?($protected))$ ]] && target=1
            # `HEAD` / `@` (no `:dst`) pushes the current branch to its same-named remote branch
            if [[ "$a" =~ ^\+?(HEAD|@)$ ]]; then branch=$(cur_branch); [[ "$branch" =~ ^($protected)$ ]] && target=1; fi ;;
        esac
      done
      if [ "$explicit" -eq 0 ]; then
        branch=$(cur_branch)
        [[ "$branch" =~ ^($protected)$ ]] && target=1
      fi
      [ "$force" -eq 1 ] && [ "$target" -eq 1 ] && block "force-push/delete on a protected branch (--force, --force-with-lease, -f, +refspec, HEAD:main). Open a PR instead."
      ;;
    config)
      if printf '%s ' "${args[@]}" | grep -qi 'core\.hookspath' && ! printf ' %s ' "${args[@]}" | grep -qE ' (--get|--get-all|--get-regexp|get|-l|--list) '; then
        block "'git config core.hooksPath' re-points or disables the git-hook layer. Confirm with a human first."
      fi ;;
    checkout|restore)
      if printf ' %s' "${args[@]}" | grep -qE '[[:space:]](\./)?(\.claude/|\.claude([[:space:]]|$)|\.husky/|\.github/|\.gitleaks\.toml|AGENTS\.md|CLAUDE\.md|docs/CONSTITUTION\.md)'; then
        block "'git checkout/restore' on a guard-layer file discards enforcement config (this is how settings.json gets silently wiped). Confirm with a human first."
      fi ;;
  esac
done <<< "$segments"

if echo "$cmd" | grep -qE '(^|[[:space:]])rm([[:space:]]|$)' && echo "$cmd" | grep -qE '[[:space:]]-[a-zA-Z]*r|[[:space:]]--recursive' && echo "$cmd" | grep -qE '[[:space:]]-[a-zA-Z]*f|[[:space:]]--force' && echo "$cmd" | grep -qE '(^|[[:space:]/"])(src|app|lib|test|\.claude|\.husky|\.git|node_modules)([[:space:]/"]|$)'; then
  block "recursive rm on a source directory. Confirm with a human first."
fi
exit 0
