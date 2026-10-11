#!/usr/bin/env bash
# PostToolUse(Skill) — silent skill-usage logger. Feeds /skill-audit. Always exits 0.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
input=$(cat)
name=$(printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const ti=(JSON.parse(b||'{}').tool_input)||{};process.stdout.write(String(ti.skill||'').replace(/[^A-Za-z0-9_:.\/-]/g,'').slice(0,120))}catch(e){process.stdout.write('')}})" 2>/dev/null)
[ -z "$name" ] && exit 0
printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" >> .claude/skill-usage.log
exit 0
