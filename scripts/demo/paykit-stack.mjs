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
const WORKDIR =
  process.env.DEMO_PAYKIT_WORKDIR ?? path.join(os.tmpdir(), "qkit-demo-paykit");
const PORT_SHIFT = 100;
const PROJECT_ID = "paykit_demo";

/** Shift every active `*port = N` line and rename the project. */
export function patchConfig(toml) {
  return toml
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*project_id\s*=/.test(line))
        return `project_id = "${PROJECT_ID}"`;
      if (/^\s*\[local_smtp\]/.test(line)) return "[inbucket]";
      if (line.trimStart().startsWith("#")) return line;
      return line.replace(
        /^(\s*\w*port\s*=\s*)(\d+)/,
        (_, head, port) => `${head}${Number(port) + PORT_SHIFT}`,
      );
    })
    .join("\n");
}

function prepare() {
  const dest = path.join(WORKDIR, "supabase");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
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
  return execFileSync(
    "pnpm",
    ["exec", "supabase", ...args, "--workdir", WORKDIR],
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
