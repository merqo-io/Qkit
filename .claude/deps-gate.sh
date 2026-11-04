#!/usr/bin/env bash
# Dependency-audit merge gate (templateCentral ci-gates.sh `deps`, pnpm branch only).
# Usage: bash .claude/deps-gate.sh   (run from the repo root; takes no arguments)
# Audits pnpm-lock.yaml for high/critical advisories and fails closed: a missing tool, no network, an
# unparseable or empty report all fail the gate. There is no label bypass: only .claude/dep-audit-allow.txt,
# whose entries expire, suppresses an advisory.
set -uo pipefail

MAX_EXPIRY_DAYS=180   # an allowlist entry may not silence an advisory for longer than this
allow=".claude/dep-audit-allow.txt"

fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$1"; else echo "ERROR: $1" >&2; fi
  exit 1
}

tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/deps.XXXXXX")
trap 'rm -rf "$tmp"' EXIT   # fail() exits, so this also covers every failure path
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 not found — install it before the deps gate"; }

# pnpm's own suppression settings would bypass the expiring allowlist, so they are rejected outright.
# package.json is parsed (any JSON layout, a parse failure fails closed); the YAML files and .npmrc are
# matched by text. Not detected: the YAML complex-key form (`? audit`), which pnpm does not document.
# pnpm also reads package.json5 and package.yaml; they are not parsed here, so they fail closed.
for f in package.json5 package.yaml; do
  [ ! -f "$f" ] || fail "unsupported pnpm manifest format: $f — use package.json"
done
if [ -f package.json ]; then
  need node
  rc=0
  node -e '
    let pkg;
    try { pkg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, "")); } catch (e) { process.exit(2); }
    const walk = (v) => v !== null && typeof v === "object" &&
      Object.entries(v).some(([k, x]) => k === "ignoreGhsas" || k === "ignoreCves" || walk(x));
    const pnpm = pkg && typeof pkg === "object" ? pkg.pnpm : undefined;
    const native = pnpm !== null && typeof pnpm === "object" && ("audit" in pnpm || "auditConfig" in pnpm);
    process.exit(native || walk(pkg) ? 1 : 0);
  ' package.json || rc=$?
  [ "$rc" -ne 2 ] || fail "package.json is not valid JSON — the deps gate cannot check it for advisory suppressions"
  [ "$rc" -eq 0 ] || fail "advisory suppressions belong in $allow, not package.json"
fi
q="[\"']"   # an optionally quoted key: audit, "audit" or 'audit'
for f in pnpm-workspace.yaml .npmrc; do
  [ -f "$f" ] || continue
  # Flow style (audit: { ignore: [...] }) and block style are both caught; any `ignore` under an audit key fails closed.
  if grep -qE "auditConfig|ignoreGhsas|ignoreCves|(^|[^[:alnum:]_.-])${q}?audit${q}?[[:space:]]*:[[:space:]]*\\{" "$f" \
    || awk -v q="$q" '$0 ~ "^" q "?audit" q "?[[:space:]]*:" { inblock = 1; if ($0 ~ /ignore/) found = 1; next } /^[^[:space:]#]/ { inblock = 0 } inblock && /ignore/ { found = 1 } END { exit !found }' "$f"; then
    fail "advisory suppressions belong in $allow, not $f"
  fi
done

# Allowlist lines: <ADVISORY-ID> <YYYY-MM-DD expiry> <reason>. An entry stops suppressing on its expiry date.
today=$(date -u +%Y-%m-%d)
latest=$(date -u -d "+$MAX_EXPIRY_DAYS days" +%Y-%m-%d 2>/dev/null || date -u -v"+${MAX_EXPIRY_DAYS}d" +%Y-%m-%d) || fail "cannot compute the expiry horizon"
: > "$tmp/allowed"
if [ -f "$allow" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    line=${line#"${line%%[![:space:]]*}"}
    line=${line%"${line##*[![:space:]]}"}
    case "$line" in ''|'#'*) continue ;; esac
    if ! printf '%s\n' "$line" | grep -qiE '^(GHSA-[A-Za-z0-9-]+|CVE-[0-9]{4}-[0-9]+)[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+[^[:space:]]'; then
      echo "malformed allowlist line: $line" >&2
      fail "$allow has a malformed line. Format: <GHSA|CVE id> <YYYY-MM-DD expiry> <reason>"
    fi
    read -r id expiry _ <<< "$line"
    y=${expiry%%-*}; md=${expiry#*-}; m=$((10#${md%%-*})); d=$((10#${md#*-}))
    case $m in 1|3|5|7|8|10|12) dim=31 ;; 4|6|9|11) dim=30 ;; 2) dim=28
      if [ $((10#$y % 4)) -eq 0 ] && { [ $((10#$y % 100)) -ne 0 ] || [ $((10#$y % 400)) -eq 0 ]; }; then dim=29; fi ;; *) dim=0 ;; esac
    if [ "$d" -lt 1 ] || [ "$d" -gt "$dim" ]; then
      echo "malformed allowlist line (not a calendar date): $line" >&2
      fail "$allow has an invalid expiry date: $expiry"
    fi
    if [[ ! "$today" < "$expiry" ]]; then
      echo "expired allowlist entry: $id (expired $expiry)" >&2
      fail "$allow entry for $id expired on $expiry. Fix the dependency or renew the entry with a new date and reason."
    fi
    if [[ "$expiry" > "$latest" ]]; then
      echo "allowlist entry too far out: $id ($expiry)" >&2
      fail "$allow entry for $id has an expiry more than $MAX_EXPIRY_DAYS days out ($expiry). Use a date on or before $latest."
    fi
    printf '%s\n' "$id" | tr '[:lower:]' '[:upper:]' >> "$tmp/allowed"
  done < "$allow"
fi

[ -f pnpm-lock.yaml ] || fail "no lockfile found (pnpm-lock.yaml) — nothing to audit"
need pnpm
: > "$tmp/found"   # one line per finding: <package>|<severity>|<ids>
pnpm audit --json --prod > "$tmp/report.json" 2> "$tmp/err.txt"   # exits non-zero when it finds anything: the report decides
node - "$tmp/report.json" >> "$tmp/found" <<'JS'
const fs = require("fs");
let report;
try { report = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); } catch { process.exit(3); }
if (!report || typeof report.advisories !== "object" || report.advisories === null) process.exit(3);
const meta = report.metadata || {};
const total = Number.isFinite(meta.totalDependencies) ? meta.totalDependencies
  : ["dependencies", "devDependencies", "optionalDependencies"].reduce((n, k) => n + (Number.isFinite(meta[k]) ? meta[k] : 0), 0);
if (!(total > 0)) process.exit(4);
for (const a of Object.values(report.advisories)) {
  if (a.severity !== "high" && a.severity !== "critical") continue;
  const ids = [a.github_advisory_id, ...(Array.isArray(a.cves) ? a.cves : [])].filter(Boolean);
  console.log((a.module_name || "unknown") + "|" + a.severity + "|" + (ids.length ? ids : ["advisory-" + a.id]).join(" "));
}
JS
rc=$?
[ "$rc" -ne 4 ] || fail "dependency audit covered no packages (pnpm audit)"
[ "$rc" -eq 0 ] || { cat "$tmp/err.txt" >&2; fail "dependency audit returned no report (pnpm audit)"; }

blocked=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  pkg=${line%%|*}; rest=${line#*|}; sev=${rest%%|*}; ids=${rest#*|}
  covered=0
  for id in $ids; do
    if printf '%s\n' "$id" | tr '[:lower:]' '[:upper:]' | grep -qxFf "$tmp/allowed" -; then covered=1; break; fi
  done
  [ "$covered" -eq 1 ] || blocked="$blocked${blocked:+$'\n'}  - $pkg: $ids ($sev)"
done < <(sort -u "$tmp/found")
if [ -n "$blocked" ]; then
  printf '%s\n' "$blocked" >&2
  fail "High/critical advisories (listed above). Upgrade the dependency, or allowlist an audited advisory in $allow with an expiry date and a reason."
fi
echo "deps gate: no unallowlisted high/critical advisories"
