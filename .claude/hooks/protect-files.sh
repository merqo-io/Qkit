#!/usr/bin/env bash
# File-tool guard: secrets deny, governance writes ask, ordinary work allows.
# Fail closed: a guard that cannot locate the project root blocks rather than guessing.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || { echo "BLOCKED: protect-files.sh cannot cd to the project root — refusing the file access." >&2; exit 2; }
node -e '
const fs = require("node:fs");
const path = require("node:path");
let input;
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); }
catch { process.stderr.write("BLOCKED: invalid file-tool input\n"); process.exit(2); }
const raw = input.tool_input?.file_path || input.tool_input?.notebook_path || input.tool_input?.path;
if (!raw) process.exit(0);
// Resolve symlinks in the part of the path that exists, so a linked parent
// directory cannot disguise where the file really is.
const physical = (target) => {
  let existing = target;
  const rest = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return target;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  try { return path.join(fs.realpathSync.native(existing), ...rest); } catch { return target; }
};
const absolute = physical(path.resolve(raw.replace(/\\/g, "/")));
const relative = path.relative(physical(process.cwd()), absolute).replace(/\\/g, "/");
const rel = relative.toLowerCase();
const base = path.basename(absolute).toLowerCase();
const secret = (base.startsWith(".env") && ![".env.example", ".env.default"].includes(base))
  || /(^|\/)\.?secrets(\/|$)/.test(rel)
  || /\.(pem|key|p12|pfx|secret)$/.test(base)
  || ["credentials.json", ".netrc", ".secrets"].includes(base);
if (secret) {
  process.stderr.write("BLOCKED: secret or credential file access is not allowed. Use placeholders in .env.example.\n");
  process.exit(2);
}
if (input.tool_name === "Read") process.exit(0);
let reason = "";
if (["agents.md", "claude.md"].includes(base) || /(^|\/)docs\/constitution\.md$/.test(rel)) {
  reason = "agent instructions and binding invariants require human approval";
} else if (/(^|\/)\.claude\/(settings(\.local)?\.json|harness\.json|(verify|regen)-harness\.sh|comment-hygiene-patterns\.txt)$/.test(rel)
  || /(^|\/)\.claude\/(hooks|agents|\.harness-base)\//.test(rel)
  || /(^|\/)\.codex\/(hooks\.json|hooks\/)/.test(rel)
  || /(^|\/)\.husky\//.test(rel)
  || [".mcp.json", ".gitleaks.toml", "dockerfile"].includes(base)) {
  reason = "enforcement or execution configuration requires human approval";
} else if (/(^|\/)(\.github\/(workflows|actions)|\.azuredevops)\//.test(rel)
  || /^azure-pipelines.*\.ya?ml$/.test(base)
  || [".gitlab-ci.yml", "jenkinsfile"].includes(base)) {
  reason = "CI/CD execution changes require human review";
}
if (reason) process.stdout.write(JSON.stringify({hookSpecificOutput: {
  hookEventName: "PreToolUse",
  permissionDecision: "ask",
  permissionDecisionReason: `PROTECTED FILE: ${relative} — ${reason}.`
}}));
'
