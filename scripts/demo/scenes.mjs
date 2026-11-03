// Scene registry and argument handling shared by record.mjs and compose.mjs.
// Pure data and functions only (no browser, no ffmpeg), so the registry, the
// caption rules and the CLI contract are unit-testable and the two stages
// agree on scene names without importing each other.

const EM_DASH = "—";

/**
 * mode "single": one phone-sized recording. mode "split": two recordings
 * (customer phone and vendor board) composed side by side.
 * status "skeleton": the scene records, but part of what it shows needs data
 * or services this repo cannot drive on its own (see `note`).
 * `pro`: the demo vendor needs a paid plan for the feature on camera.
 * `hook` is the on-screen headline shown for the whole clip; `captions` are
 * the short step captions record.mjs burns in per beat.
 */
export const SCENES = [
  {
    name: "tour",
    episode: null,
    mode: "single",
    status: "implemented",
    hook: null,
    captions: {
      signup: "Sign up in seconds",
      stall: "Name your stall",
      guide: "A guided tour, built in",
      menu: "Add your menu & options",
      qr: "Customers scan this",
      order: "They customize & order",
      live: "Orders land live. No payment required.",
      payment: "Want to get paid? Turn on payment",
      pay: "Customers pay you directly. You keep it all.",
      confirm: "One tap: Mark paid & start",
      fulfil: "Mark Ready. Mark Picked Up. Done.",
    },
    note: "Needs a paykit with PayNow on file for the demo vendor (payment beats).",
  },
  {
    name: "live-pop",
    episode: 1,
    mode: "split",
    status: "implemented",
    hook: "Your customers order. You just make.",
    captions: {
      open: "Customer opens your QR link",
      pick: "Picks a drink",
      order: "Taps Place order",
      pop: "The ticket pops on your board",
    },
  },
  {
    name: "setup",
    episode: 2,
    mode: "single",
    status: "implemented",
    hook: "I set up QR ordering before my coffee went cold",
    captions: {
      signup: "Sign up",
      stall: "Name your stall",
      menu: "Add your menu",
      qr: "Print your QR",
    },
  },
  {
    name: "paynow",
    episode: 3,
    mode: "split",
    status: "implemented",
    hook: "Grab takes 30%. We take 0.",
    captions: {
      pay: "Customer pays you by PayNow",
      proof: "Sends the payment screenshot",
      tap: "You tap Mark paid & start",
    },
    note: "Needs a paykit with PayNow on file for the demo vendor. The screenshot upload lives on paykit's pay page; it is skipped when that page has no upload field.",
  },
  {
    name: "status",
    episode: 4,
    mode: "split",
    status: "implemented",
    hook: "No more 'is mine ready yet?'",
    captions: {
      queue: "Customers see their place in line",
      ready: "You tap Mark Ready",
      seen: "They see it. Ready.",
    },
  },
  {
    name: "tv-screen",
    episode: 5,
    mode: "single",
    status: "implemented",
    hook: "Turn an old iPad into a pickup screen",
    captions: {
      open: "Open the pickup screen",
      preparing: "New orders show as Preparing",
      ready: "Mark Ready and it flips",
    },
  },
  {
    name: "options",
    episode: 6,
    mode: "single",
    status: "implemented",
    hook: "Less sugar, oat milk, extra shot. All on the ticket.",
    captions: {
      pick: "Customer picks their options",
      ticket: "Your ticket shows short codes",
    },
  },
  {
    name: "walk-up",
    episode: 7,
    mode: "split",
    status: "implemented",
    hook: "Not everyone scans. That's fine.",
    captions: {
      qr: "A QR order comes in",
      walkup: "Tap New order for a walk-up",
      both: "Both on the same board",
    },
  },
  {
    name: "batch",
    episode: 8,
    mode: "single",
    status: "implemented",
    hook: "40 orders. 2 taps.",
    captions: {
      busy: "A busy board",
      start: "Start all",
      ready: "Mark all ready",
      pickup: "Select all, then Picked Up",
    },
  },
  {
    name: "sold-out",
    episode: 9,
    mode: "single",
    status: "implemented",
    pro: true,
    hook: "Stop taking orders you can't make",
    captions: {
      limit: "Set a limit on an item",
      hit: "The limit gets hit",
      menu: "Customers see Sold out",
    },
  },
  {
    name: "stats",
    episode: 10,
    mode: "single",
    status: "implemented",
    hook: "Your best seller might be losing you money",
    captions: {
      sells: "See what sells",
      busy: "See when you are busiest",
    },
  },
  {
    name: "multi-booth",
    episode: 11,
    mode: "single",
    status: "implemented",
    pro: true,
    hook: "3 booths. 1 board.",
    captions: {
      board: "Every booth on one board",
      dots: "Each booth has its colour",
      filter: "Or filter to just one",
    },
  },
  {
    name: "im-here",
    episode: 12,
    mode: "split",
    status: "implemented",
    hook: "Ice cream doesn't wait.",
    captions: {
      order: "Customer orders ahead",
      hold: "Your board holds it",
      here: "They tap I'm here",
      start: "Now you make it",
    },
  },
  {
    name: "come-back",
    episode: 13,
    mode: "single",
    status: "skeleton",
    hook: "Turn the queue into followers",
    captions: {
      footer: "Your socials, on every order page",
      telegram: "Updates on Telegram, no app",
      reorder: "One tap to order again",
    },
    note: "Socials and the Telegram link come from merqo (vendor profile, connect token); a local qkit stack without merqo shows neither, so those captions land on whatever is on screen.",
  },
];

export const DEFAULT_SCENE = "tour";

export function sceneNames() {
  return SCENES.map((s) => s.name);
}

export function findScene(name) {
  return SCENES.find((s) => s.name === name) ?? null;
}

/** One line per scene, for --list and for the unknown-scene error. */
export function formatSceneList() {
  const pad = (v, n) => String(v).padEnd(n);
  return SCENES.map((s) => {
    const episode = s.episode === null ? "-" : "ep" + s.episode;
    return `  ${pad(s.name, 12)} ${pad(episode, 5)} ${pad(s.mode, 7)} ${s.status}`;
  }).join("\n");
}

/**
 * Parse `--scene <name>`, `--scene=<name>`, `--list` and `--help`.
 * Returns {scene, list, help, error}; never throws or exits, so the CLI
 * wrappers decide what to print.
 */
export function parseArgs(argv) {
  const out = { scene: DEFAULT_SCENE, list: false, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list") out.list = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--scene") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        out.error = "--scene needs a name";
        break;
      }
      out.scene = value;
      i++;
    } else if (arg.startsWith("--scene=")) {
      out.scene = arg.slice("--scene=".length);
      if (!out.scene) {
        out.error = "--scene needs a name";
        break;
      }
    } else {
      out.error = `Unknown argument: ${arg}`;
      break;
    }
  }
  return out;
}

/** Scene for the parsed args, or an Error whose message lists the scenes. */
export function resolveScene(name) {
  const scene = findScene(name);
  if (scene) return scene;
  return new Error(`Unknown scene "${name}". Scenes:\n${formatSceneList()}`);
}

/** Every string a viewer reads on screen for a scene (hook + step captions). */
export function sceneCaptionTexts(scene) {
  return [
    ...(scene.hook ? [scene.hook] : []),
    ...Object.values(scene.captions),
  ];
}

export function hasEmDash(text) {
  return text.includes(EM_DASH);
}

/**
 * Break a caption into lines of at most `maxChars`. drawtext cannot wrap, and
 * a long hook would run off a 1080px frame. A word longer than the limit is
 * kept whole rather than split.
 */
export function wrapCaption(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
