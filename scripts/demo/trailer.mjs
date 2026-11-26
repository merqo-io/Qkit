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
const FADE_S = 0.6;

// Beat = index into steps.json's steps; the cut starts `lead` seconds before it
// (default LEAD_S). `drop` removes a stretch of the window, given as seconds
// before another step's start, so a loading frame inside a source clip never
// reaches the trailer (the paynow customer pane reloads just before step 3).
const CUTS = [
  { scene: "live-pop", step: 3 },
  {
    scene: "paynow",
    step: 2,
    lead: 3.4,
    drop: { step: 2, fromBefore: 1.5, toBefore: 0.3 },
  },
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
    // Each clip ends with its own fade-out and outro card; stop before them so
    // the cut never dips to black mid-trailer.
    const mainEnd = probe(file) - OUTRO_S - FADE_S;
    const wanted = Math.max(
      0,
      steps[c.step].startMs / 1000 - (c.lead ?? LEAD_S),
    );
    let drop = null;
    if (c.drop) {
      const at = steps[c.drop.step].startMs / 1000;
      drop = { from: at - c.drop.fromBefore, to: at - c.drop.toBefore };
    }
    const dropLen = drop ? drop.to - drop.from : 0;
    const start = Math.max(0, Math.min(wanted, mainEnd - CUT_S - dropLen));
    const win = CUT_S + dropLen;
    const cutOut = drop
      ? `,select='not(between(t,${(drop.from - start).toFixed(2)},${(drop.to - start).toFixed(2)}))'`
      : "";
    inputs.push("-i", file);
    graph.push(
      `[${i}:v]trim=start=${start.toFixed(2)}:duration=${win.toFixed(2)},setpts=PTS-STARTPTS,fps=30${cutOut},setpts=N/30/TB,setsar=1[v${i}]`,
      `[${i}:a]atrim=start=${start.toFixed(2)}:duration=${win.toFixed(2)},asetpts=PTS-STARTPTS,aresample=44100${drop ? cutOut.replace("select", "aselect") : ""},asetpts=N/SR/TB[a${i}]`,
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
