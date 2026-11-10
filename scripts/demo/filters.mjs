// ffmpeg filtergraph builders for compose.mjs. Strings in, strings out: all
// file and process work stays in compose.mjs so the layout maths and the
// graph shape can be asserted in unit tests without running ffmpeg.

import { wrapCaption } from "./scenes.mjs";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const FPS = 30;
const BG = "0x181410"; // Market Ochre dark, the pillarbox backdrop
const PANEL_BORDER = "0x3a3128";

const HOOK = { fontsize: 62, maxChars: 24, y: 64, lineHeight: 78 };
const STEP = { fontsize: 52, maxChars: 28, y: 1540, lineHeight: 74 };
// Consecutive steps share an exact boundary and between() is inclusive on both
// ends, so without a gap the boundary frame would draw two captions at once.
const CAPTION_GAP_S = 0.15;

// Two phones side by side in a portrait frame: 2 x (panel + border) + gap +
// side margins = 1080.
export const SPLIT = {
  panelW: 500,
  border: 8,
  gap: 16,
  margin: 16,
  top: 300,
  labelY: 244,
};

const even = (n) => Math.round(n / 2) * 2;

/** Panel size for a viewport scaled to the split panel width. */
export function panelSize(viewport) {
  return {
    w: SPLIT.panelW,
    h: even((SPLIT.panelW * viewport.height) / viewport.width),
  };
}

/** x of the left edge of panel `index` (0 = left) including its border. */
export function panelX(index) {
  const outer = SPLIT.panelW + SPLIT.border * 2;
  return SPLIT.margin + index * (outer + SPLIT.gap);
}

/**
 * Escape a filesystem path for an ffmpeg filtergraph option (fontfile=,
 * textfile=). A lone backslash is the filter escape char, and Windows accepts
 * forward slashes, so every backslash becomes "/"; the drive-letter colon
 * would parse as the option separator, so it gets a "\:".
 */
export function ffEscapePath(p) {
  // The path sits inside a single-quoted filter option, where a quote cannot
  // be escaped portably, so refuse it rather than build a broken graph.
  if (p.includes("'")) {
    throw new Error(
      `Path contains a single quote, which ffmpeg filters cannot take: ${p}. Use a path without one (DEMO_FONT, TEMP).`,
    );
  }
  return p.replace(/[\\:]/g, (ch) => (ch === ":" ? "\\:" : "/"));
}

/**
 * The caption lines to burn in, each with its on-screen window in seconds.
 * The hook shows for the whole clip; step captions show for their beat.
 * Text goes through textfile= (see drawtext below), so quotes, colons and
 * percent signs in copy need no escaping.
 */
export function captionItems(meta, durS) {
  const items = [];
  if (meta.hook) {
    wrapCaption(meta.hook, HOOK.maxChars).forEach((text, i) => {
      items.push({
        text,
        ...HOOK,
        y: HOOK.y + i * HOOK.lineHeight,
        start: 0,
        end: durS,
      });
    });
  }
  for (const s of meta.steps) {
    const start = s.startMs / 1000;
    const end = Math.max(s.startMs, s.endMs - CAPTION_GAP_S * 1000) / 1000;
    wrapCaption(s.caption, STEP.maxChars).forEach((text, i) => {
      items.push({
        text,
        ...STEP,
        y: STEP.y + i * STEP.lineHeight,
        start,
        end,
      });
    });
  }
  return items;
}

/** One drawtext filter; `textPath` is an already-written UTF-8 file. */
function drawtext(item, textPath, fontPath) {
  return (
    `drawtext=fontfile='${fontPath}':textfile='${ffEscapePath(textPath)}':` +
    `expansion=none:fontsize=${item.fontsize}:fontcolor=white:box=1:` +
    `boxcolor=0x000000@0.55:boxborderw=22:x=(w-text_w)/2:y=${item.y}:` +
    `enable='between(t,${item.start.toFixed(2)},${item.end.toFixed(2)})'`
  );
}

function roleLabel(text, index, fontPath) {
  const cx = panelX(index) + (SPLIT.panelW + SPLIT.border * 2) / 2;
  return (
    `drawtext=fontfile='${fontPath}':text='${text}':fontsize=34:` +
    `fontcolor=0xCBBFB0:x=${cx}-text_w/2:y=${SPLIT.labelY}`
  );
}

const pad = (s) => s.toFixed(2);

/**
 * Video graph from the recordings to the labelled `[v]` output (main clip
 * followed by the outro card).
 *
 * `videos` is steps.json's list in input order: {role, startMs, durS,
 * viewport}. A recording that began after the scene clock is delayed with
 * tpad, so two contexts opened at different moments line up on one timeline.
 * `textPaths[i]` is the file holding `items[i].text`.
 */
const WARMUP_S = 0.3;

export function buildVideoGraph({
  mode,
  videos,
  items,
  textPaths,
  fontPath,
  durS,
  outroS,
}) {
  const graph = [];
  const caps = items.map((it, i) => drawtext(it, textPaths[i], fontPath));
  const finish = (inLabel, extra) =>
    `${inLabel}${[...extra, ...caps].join(",")}${extra.length || caps.length ? "," : ""}` +
    `fps=${FPS},format=yuv420p,fade=t=out:st=${pad(durS - 0.6)}:d=0.6[vmain]`;

  // A recording opens on a blank or skeleton page. Drop that warm-up (up to
  // readyMs when the recorder saw the page settle, else a fixed 0.3s) and hold
  // the first settled frame for the same time plus the start offset, so every
  // pane shows its page from frame 0 and later frames stay aligned.
  const timeline = (v) => {
    const warm =
      typeof v.readyMs === "number" && v.readyMs > v.startMs
        ? (v.readyMs - v.startMs) / 1000
        : WARMUP_S;
    return (
      `trim=start=${pad(warm)},setpts=PTS-STARTPTS,` +
      `tpad=start_mode=clone:start_duration=${pad(v.startMs / 1000 + warm)},` +
      `tpad=stop_mode=clone:stop_duration=30,` +
      `trim=duration=${pad(durS)},setpts=PTS-STARTPTS`
    );
  };

  if (mode === "split") {
    const sizes = videos.map((v) => panelSize(v.viewport));
    const ph = Math.max(...sizes.map((s) => s.h));
    const outerW = SPLIT.panelW + SPLIT.border * 2;
    const outerH = ph + SPLIT.border * 2;
    videos.forEach((v, i) => {
      graph.push(
        `[${i}:v]fps=${FPS},scale=${sizes[i].w}:${sizes[i].h},setsar=1,` +
          `pad=${outerW}:${outerH}:${SPLIT.border}:${SPLIT.border}:color=${PANEL_BORDER},` +
          `${timeline(v)}[p${i}]`,
      );
    });
    graph.push(
      `color=c=${BG}:s=${CANVAS_W}x${CANVAS_H}:d=${pad(durS)}:r=${FPS},setsar=1[bg]`,
    );
    let prev = "[bg]";
    videos.forEach((_v, i) => {
      const out = `[b${i}]`;
      graph.push(`${prev}[p${i}]overlay=x=${panelX(i)}:y=${SPLIT.top}${out}`);
      prev = out;
    });
    const labels = videos.map((v, i) =>
      roleLabel(v.role.toUpperCase(), i, fontPath),
    );
    graph.push(finish(prev, labels));
  } else {
    const v = videos[0];
    graph.push(
      finish(
        `[0:v]fps=${FPS},` +
          `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,` +
          `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,` +
          `${timeline(v)},`,
        [],
      ),
    );
  }

  graph.push(
    `color=c=${BG}:s=${CANVAS_W}x${CANVAS_H}:d=${outroS}:r=${FPS},setsar=1,format=yuv420p,` +
      `drawtext=fontfile='${fontPath}':text='qkit':fontsize=148:` +
      `fontcolor=white:x=(w-text_w)/2:y=h/2-160,` +
      `drawtext=fontfile='${fontPath}':` +
      `text='Run your booth, watch orders land live':` +
      `fontsize=44:fontcolor=0xCBBFB0:x=(w-text_w)/2:y=h/2+40,` +
      `fade=t=in:st=0:d=0.7[vout]`,
    `[vmain][vout]concat=n=2:v=1:a=0[v]`,
  );
  return graph;
}

// The app's real "order ready" chime (src/lib/order-alerts.ts): a major triad
// rising, played twice, replicated so the demo's ding matches the product.
const CHIME_NOTES = [784, 1047, 1319, 784, 1047, 1319];
const CHIME_SPACING_MS = 200;

/**
 * Audio graph ending in `[a]`: silence the length of the video, the chime at
 * `popSec`, and optional music (input index `musicInput`) mixed under.
 */
export function buildAudioGraph({ popSec, totalS, musicInput = null }) {
  const graph = [];
  const labels = [];
  CHIME_NOTES.forEach((freq, i) => {
    const delay = Math.round(popSec * 1000 + i * CHIME_SPACING_MS);
    labels.push(`[n${i}]`);
    graph.push(
      // ffmpeg's sine source is about -18 dB, so volume=3 lifts the chime to a
      // clear -9 dB peak that sits above the background music.
      `sine=frequency=${freq}:duration=0.28:sample_rate=44100,` +
        `afade=t=in:st=0:d=0.006,afade=t=out:st=0.08:d=0.2,` +
        `volume=3.0,adelay=${delay}|${delay}[n${i}]`,
    );
  });
  graph.push(
    `${labels.join("")}amix=inputs=${CHIME_NOTES.length}:normalize=0[chime]`,
  );
  graph.push(`anullsrc=r=44100:cl=stereo,atrim=0:${pad(totalS)}[base]`);
  const mixIns = ["[base]", "[chime]"];
  if (musicInput !== null) {
    graph.push(
      `[${musicInput}:a]atrim=0:${pad(totalS)},aresample=44100,volume=0.3,` +
        `afade=t=out:st=${pad(totalS - 3)}:d=3[music]`,
    );
    mixIns.push("[music]");
  }
  graph.push(
    `${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0:duration=first[a]`,
  );
  return graph;
}
