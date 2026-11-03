// qkit demo compositor: turns one scene's recording (scripts/demo/out/<scene>/)
// into a send-ready 1080x1920 mp4 with captions and audio (Playwright records
// none):
//   - single scenes: the phone capture centred on the canvas
//   - split scenes: customer phone and vendor board side by side, aligned by
//     the start offsets record.mjs wrote to steps.json
//   - the order "ready" chime, mixed in at the moment the order lands
//   - optional background music: drop a royalty-free track at
//     scripts/demo/assets/music.{mp3,m4a,wav,ogg}; no file means chime only
//
// Runs from the files in out/<scene>/ alone (steps.json + the webm(s)), so a
// caption or layout change never needs a re-record.
//
// Prereq: ffmpeg + ffprobe on PATH.
// Run: node scripts/demo/compose.mjs [--scene <name>] [--list]
//      -> scripts/demo/out/<scene>.mp4

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { formatSceneList, parseArgs, resolveScene } from "./scenes.mjs";
import {
  buildAudioGraph,
  buildVideoGraph,
  captionItems,
  ffEscapePath,
} from "./filters.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const ASSETS = path.join(HERE, "assets");
// Bold font for captions. Override with DEMO_FONT if this path is absent.
const FONT = process.env.DEMO_FONT ?? "C:/Windows/Fonts/arialbd.ttf";
const OUTRO_S = 2.8;

function probeDuration(src) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      src,
    ],
    { encoding: "utf8" },
  );
  const d = parseFloat((r.stdout || "").trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

function findMusic() {
  if (!fs.existsSync(ASSETS)) return null;
  const audio = fs
    .readdirSync(ASSETS)
    .filter((f) => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f))
    .sort();
  if (!audio.length) return null;
  // Prefer a file literally named music.*, else just take the first track found.
  const named = audio.find((f) => /^music\.(mp3|m4a|wav|ogg|aac)$/i.test(f));
  return path.join(ASSETS, named ?? audio[0]);
}

function loadMeta(sceneDir, sceneName) {
  const file = path.join(sceneDir, "steps.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `No recording for "${sceneName}" (${file}). Run: node scripts/demo/record.mjs --scene ${sceneName}`,
    );
  }
  const meta = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(meta.videos) || meta.videos.length === 0) {
    throw new Error(`${file} lists no videos. Re-record the scene.`);
  }
  if (meta.mode === "split" && meta.videos.length !== 2) {
    throw new Error(`${file}: a split scene needs exactly two videos.`);
  }
  return meta;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) throw new Error(args.error);
  if (args.list || args.help) {
    console.log(
      `Usage: compose.mjs [--scene <name>] [--list]\n${formatSceneList()}`,
    );
    return;
  }
  const scene = resolveScene(args.scene);
  if (scene instanceof Error) throw scene;

  const sceneDir = path.join(OUT, scene.name);
  const meta = loadMeta(sceneDir, scene.name);
  const videos = meta.videos.map((v) => {
    const file = path.join(sceneDir, v.file);
    if (!fs.existsSync(file)) {
      throw new Error(`Recording not found (${file}). Run record.mjs first.`);
    }
    const len = probeDuration(file);
    return { ...v, file, endS: v.startMs / 1000 + (len ?? 0) };
  });
  if (!fs.existsSync(FONT.replace(/\\:/g, ":"))) {
    console.warn(
      `! Font not found at ${FONT}. Set DEMO_FONT to a .ttf if captions are blank.`,
    );
  }

  const lastStepS = (meta.steps.at(-1)?.endMs ?? 0) / 1000;
  const durS = Math.max(lastStepS + 0.8, ...videos.map((v) => v.endS));
  const totalS = durS + OUTRO_S;
  const popSec =
    meta.popMs && meta.popMs > 0 ? meta.popMs / 1000 : Math.max(0, durS - 5);
  const music = findMusic();

  // Caption text goes through files so quotes and colons in copy need no
  // filtergraph escaping.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qkit-demo-"));
  try {
    const items = captionItems(meta, durS);
    const textPaths = items.map((it, i) => {
      const p = path.join(tmp, `cap-${i}.txt`);
      fs.writeFileSync(p, it.text, "utf8");
      return p;
    });

    const graph = [
      ...buildVideoGraph({
        mode: meta.mode,
        videos,
        items,
        textPaths,
        fontPath: ffEscapePath(FONT),
        durS,
        outroS: OUTRO_S,
      }),
      ...buildAudioGraph({
        popSec,
        totalS,
        musicInput: music ? videos.length : null,
      }),
    ];

    const dst = path.join(OUT, `${scene.name}.mp4`);
    const ffArgs = [
      "-y",
      ...videos.flatMap((v) => ["-i", v.file]),
      ...(music ? ["-stream_loop", "-1", "-i", music] : []),
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
      "-t",
      totalS.toFixed(2),
      dst,
    ];

    console.log(
      `Running ffmpeg (${scene.name}, ${meta.mode})... chime @ ${popSec.toFixed(1)}s; ` +
        (music
          ? `music: ${path.basename(music)}`
          : "no music track (chime only)"),
    );
    const res = spawnSync("ffmpeg", ffArgs, { stdio: "inherit" });
    if (res.status !== 0) throw new Error("ffmpeg failed. See output above.");

    console.log(`\n\u2713 ${dst}`);
    if (!music) {
      console.log(
        "Note: for background music, drop a royalty-free track at " +
          "scripts/demo/assets/music.mp3 and re-run.",
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error("\n\u2717 Compose failed:", err.message);
  process.exit(1);
}
