// Cuts a 25-30s trailer from already-composed scene clips (out/<scene>.mp4):
// one strongest beat from each of live-pop, paynow, status and tv-screen, then
// the last clip's outro card. Each cut keeps its own hook and step caption and
// chime, so nothing is re-captioned here.
//
// Prereq: node compose.mjs --scene <each scene below> has been run.
// Run: node scripts/demo/trailer.mjs  -> scripts/demo/out/tour-trailer.mp4

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const OUTRO_S = 2.8;
const LEAD_S = 2.2;
const CUT_S = 6.4;

// Beat = index into steps.json's steps; the cut starts just before it.
const CUTS = [
  { scene: "live-pop", step: 3 },
  { scene: "paynow", step: 2 },
  { scene: "status", step: 2 },
  { scene: "tv-screen", step: 2 },
];

function probe(src) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      src,
    ],
    { encoding: "utf8" },
  );
  return parseFloat(r.stdout);
}

function main() {
  const inputs = [];
  const graph = [];
  CUTS.forEach((c, i) => {
    const file = path.join(OUT, `${c.scene}.mp4`);
    const meta = path.join(OUT, c.scene, "steps.json");
    if (!fs.existsSync(file) || !fs.existsSync(meta)) {
      throw new Error(`Missing ${c.scene}. Record and compose it first.`);
    }
    const steps = JSON.parse(fs.readFileSync(meta, "utf8")).steps;
    const start = Math.max(0, steps[c.step].startMs / 1000 - LEAD_S);
    inputs.push("-i", file);
    graph.push(
      `[${i}:v]trim=start=${start.toFixed(2)}:duration=${CUT_S},setpts=PTS-STARTPTS,fps=30,setsar=1[v${i}]`,
      `[${i}:a]atrim=start=${start.toFixed(2)}:duration=${CUT_S},asetpts=PTS-STARTPTS,aresample=44100[a${i}]`,
    );
  });
  const last = CUTS.length - 1;
  const lastFile = path.join(OUT, `${CUTS[last].scene}.mp4`);
  const outroFrom = probe(lastFile) - OUTRO_S;
  inputs.push("-i", lastFile);
  graph.push(
    `[${CUTS.length}:v]trim=start=${outroFrom.toFixed(2)},setpts=PTS-STARTPTS,fps=30,setsar=1[vo]`,
    `[${CUTS.length}:a]atrim=start=${outroFrom.toFixed(2)},asetpts=PTS-STARTPTS,aresample=44100[ao]`,
  );
  const labels = [...CUTS.map((_, i) => `[v${i}][a${i}]`), "[vo][ao]"].join("");
  graph.push(`${labels}concat=n=${CUTS.length + 1}:v=1:a=1[v][a]`);

  const dst = path.join(OUT, "tour-trailer.mp4");
  const res = spawnSync(
    "ffmpeg",
    [
      "-y",
      ...inputs,
      "-filter_complex",
      graph.join(";"),
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      dst,
    ],
    { stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error("ffmpeg failed. See output above.");
  console.log(`\n✓ ${dst} (${probe(dst).toFixed(1)}s)`);
}

try {
  main();
} catch (err) {
  console.error("\n✗ Trailer failed:", err.message);
  process.exit(1);
}
