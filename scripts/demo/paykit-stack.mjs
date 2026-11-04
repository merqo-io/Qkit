import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runs paykit's real Supabase schema on a scratch local stack so the demo can
// record paykit's own hosted pay page. The scratch copy lives outside both
// repos: paykit's own supabase/ dir is only read, and its ports (54321 and
// friends) are the same ones qkit's stack uses, so the copy shifts every port.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QKIT_ROOT = path.resolve(HERE, "..", "..");
const PAYKIT_SUPABASE =
  process.env.DEMO_PAYKIT_REPO !== undefined
    ? path.join(process.env.DEMO_PAYKIT_REPO, "supabase")
    : path.resolve(QKIT_ROOT, "..", "paykit", "supabase");
const WORKDIR = path.resolve(
  process.env.DEMO_PAYKIT_WORKDIR ?? path.join(os.tmpdir(), "qkit-demo-paykit"),
);
const PORT_SHIFT = 100;
export const PROJECT_ID = "paykit_demo";
// The supabase CLI names the db container after the project id.
export const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;
const MARKER = ".qkit-demo-scratch";

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Shift every active `*port = N` line and rename the project. */
export function patchConfig(toml) {
  return toml
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*project_id\s*=/.test(line))
        return `project_id = "${PROJECT_ID}"`;
      // paykit's config targets a newer CLI that calls this table local_smtp;
      // the CLI pinned here only knows inbucket and rejects the unknown key.
      if (/^\s*\[local_smtp\]/.test(line)) return "[inbucket]";
      if (line.trimStart().startsWith("#")) return line;
      return line.replace(
        /^(\s*\w*port\s*=\s*)(\d+)/,
        (_, head, port) => `${head}${Number(port) + PORT_SHIFT}`,
      );
    })
    .join("\n");
}

/** Only ever delete a previous scratch copy: inside tmp, outside both repos, marked. */
function assertScratchDest(dest) {
  const repos = [QKIT_ROOT, path.dirname(PAYKIT_SUPABASE)];
  if (
    !isInside(WORKDIR, os.tmpdir()) ||
    repos.some((r) => WORKDIR === r || isInside(WORKDIR, r))
  ) {
    throw new Error(
      `DEMO_PAYKIT_WORKDIR must be inside ${os.tmpdir()} and outside both repos`,
    );
  }
  if (fs.existsSync(dest) && !fs.existsSync(path.join(dest, MARKER))) {
    throw new Error(`${dest} is not a previous scratch copy (no ${MARKER})`);
  }
}

function prepare() {
  const dest = path.join(WORKDIR, "supabase");
  assertScratchDest(dest);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, MARKER), "");
  const config = fs.readFileSync(
    path.join(PAYKIT_SUPABASE, "config.toml"),
    "utf8",
  );
  fs.writeFileSync(path.join(dest, "config.toml"), patchConfig(config));
  fs.cpSync(
    path.join(PAYKIT_SUPABASE, "migrations"),
    path.join(dest, "migrations"),
    { recursive: true },
  );
}

function supabase(args, stdio = "inherit") {
  // pnpm is a .cmd shim on Windows, which Node refuses to spawn without a
  // shell, so the workdir is quoted for it instead.
  return execFileSync(
    "pnpm",
    ["exec", "supabase", ...args, "--workdir", `"${WORKDIR}"`],
    { cwd: QKIT_ROOT, stdio, shell: true },
  );
}

const cmd = process.argv[2];
if (process.argv[1]?.endsWith("paykit-stack.mjs")) {
  if (cmd === "up") {
    prepare();
    supabase(["start"]);
    console.log(`\nScratch paykit stack is up (workdir ${WORKDIR}).`);
  } else if (cmd === "down") {
    supabase(["stop"]);
  } else if (cmd === "status") {
    supabase(["status", "-o", "env"]);
  } else {
    console.error("Usage: node scripts/demo/paykit-stack.mjs up|down|status");
    process.exit(1);
  }
}
