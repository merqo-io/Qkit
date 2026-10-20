// "Order ready" alerts. Best-effort, browser-gated progressive enhancement:
//
//   1. Title flash + chime  — work in any browser while the tab is open, once
//      audio has been unlocked by a user gesture (see unlockAudio).
//   2. Notification          — a system popup shown via the service worker
//      (registration.showNotification). Reaches the customer when the tab is
//      backgrounded. Works on desktop + Android Chrome with granted permission,
//      and on iOS only inside an installed PWA. A normal iOS Safari tab has no
//      Notification API, so it feature-detects to false and degrades to (1).
//
// Permission is requested only from an explicit user gesture, never auto-prompted
// on load (web.dev "just-in-time / double opt-in" guidance).

import type { SoundId } from "@/lib/types";

export function isNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | null {
  return isNotifySupported() ? Notification.permission : null;
}

export async function requestNotifyPermission(): Promise<NotificationPermission | null> {
  if (!isNotifySupported()) return null;
  try {
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}

/**
 * Show a system popup. Prefers the service worker's showNotification (the only
 * form Android Chrome allows — the page-level `new Notification()` constructor
 * throws there); falls back to the constructor on desktop, where it still
 * works without a controlling SW. Silent no-op if both paths fail.
 */
async function showNotification(
  title: string,
  options: NotificationOptions,
): Promise<void> {
  // SW path — required on Android Chrome. `controller` set means an active SW is
  // controlling this page, so `ready` resolves immediately (it would hang if no
  // SW were ever registered).
  const sw =
    typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (sw?.controller) {
    try {
      const reg = await sw.ready;
      await reg.showNotification(title, options);
      return;
    } catch {
      // fall through to the page-level constructor
    }
  }

  try {
    new Notification(title, options);
  } catch {
    // Page-level constructor is illegal on some engines (Android Chrome) — ignore.
  }
}

/**
 * Text of the "your order is ready" popup. Shared by the page's own popup and
 * the server's web push (src/lib/push/send.ts), so the two carry the same tag
 * and an open tab shows one popup, not two.
 */
export function readyNotificationContent(
  boothName: string,
  orderNumber: string,
): { title: string; body: string; tag: string } {
  return {
    title: `Order #${orderNumber} is ready`,
    body: `${boothName}. Please collect it now.`,
    tag: `qkit-order-${orderNumber}`,
  };
}

/** "Your order is ready" popup for the customer status page. */
export async function fireReadyNotification(
  boothName: string,
  orderNumber: string,
  url?: string,
): Promise<void> {
  if (!isNotifySupported() || Notification.permission !== "granted") return;
  const { title, body, tag } = readyNotificationContent(boothName, orderNumber);
  // Same tag coalesces repeats into one popup if the effect re-fires.
  await showNotification(title, { body, tag, data: { url: url ?? "/" } });
}

/**
 * "New order" popup for the vendor board (opt-in via board_settings.desktop_notify,
 * only fired while the tab is backgrounded — see realtime-order-board.tsx).
 */
export async function fireNewOrderNotification(
  boothName: string,
  orderNumber: string,
  url?: string,
): Promise<void> {
  if (!isNotifySupported() || Notification.permission !== "granted") return;
  await showNotification(`New order #${orderNumber}`, {
    body: `${boothName}. Tap to view.`,
    tag: `qkit-new-order-${orderNumber}`,
    data: { url: url ?? "/dashboard" },
  });
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

// One shared AudioContext, cached on `window`. Mobile (iOS Safari, Android
// Chrome) starts a context `suspended` and only lets a user gesture resume it;
// a context created per-chime outside a gesture stays silent. Reusing the one
// unlocked context is what makes the later (non-gesture) "ready" chime audible.
// Storing it on `window` also keeps tests isolated — stubbing window drops it.
function sharedCtx(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  const w = window as Window & { __qkitAudioCtx?: AudioContext };
  if (!w.__qkitAudioCtx) {
    try {
      w.__qkitAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return w.__qkitAudioCtx;
}

/** Create + resume the shared AudioContext. Call from a user gesture (tap). */
export function unlockAudio(): void {
  const ctx = sharedCtx();
  if (!ctx || ctx.state !== "suspended") return;
  try {
    ctx.resume().catch(() => undefined);
  } catch {
    // Audio is optional; browser restrictions must not interrupt the gesture.
  }
}

// Notes still ringing from a previous playNotes call on a given context —
// tracked so a rapid re-trigger (spamming sound presets) cuts the old ones
// off instead of layering into a cacophony. Keyed by context so tests, which
// stub a fresh context per case, never see stale entries from another test.
const activeNotesByCtx = new WeakMap<
  AudioContext,
  { osc: OscillatorNode; gain: GainNode }[]
>();

function stopActiveNotes(ctx: AudioContext): void {
  const now = ctx.currentTime;
  for (const { osc, gain } of activeNotesByCtx.get(ctx) ?? []) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      osc.stop(now + 0.02);
    } catch {
      // already stopped
    }
  }
  activeNotesByCtx.set(ctx, []);
}

// seconds between note onsets (no overlap → no clip)
const NOTE_SPACING = 0.2;
const NOTE_DURATION = 0.22;
const PEAK_GAIN = 0.4;

// Schedules a sequence of notes on the shared context — the engine behind
// every board sound preset. Square waves carry a full stack of odd harmonics
// (triangle's roll off fast, reading thin/hollow next to stall noise) — that's
// what gives an alert its "solid", cut-through-a-crowd character. Awaits
// resume first so a context suspended by backgrounding wakes before the notes
// are scheduled. Returns true if it scheduled sound, false on any failure.
function playNotes(
  notes: number[],
  noteDuration: number,
  spacing: number = NOTE_SPACING,
): Promise<boolean> {
  const ctx = sharedCtx();
  if (!ctx) return Promise.resolve(false);
  return (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      stopActiveNotes(ctx);
      const start = ctx.currentTime;
      const scheduled: { osc: OscillatorNode; gain: GainNode }[] = [];
      notes.forEach((freq, i) => {
        const at = start + i * spacing;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + noteDuration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + noteDuration + 0.02);
        scheduled.push({ osc, gain });
      });
      activeNotesByCtx.set(ctx, scheduled);
      return true;
    } catch {
      return false;
    }
  })();
}

// G5 · C6 · E6 (major triad), rising, then the triad again. ~1.2s total — loud
// and long enough to catch a customer/vendor not staring at the screen.
const CHIME_NOTES = [784, 1047, 1319, 784, 1047, 1319];
// Two low tones, clearly separated — "toot toot".
const BELL_NOTES = [523, 523];
const BELL_DURATION = 0.35;
const BELL_SPACING = 0.5;
// Single high tone with a long decay — the quiet/subtle option.
const DING_NOTES = [1568];
const DING_DURATION = 0.75;
// Two bright, brassy tones, further apart than the bell — a deliberate
// "honk honk" pitched like an actual car horn rather than a low buzz.
const HORN_NOTES = [440, 440];
const HORN_DURATION = 0.55;
const HORN_SPACING = 0.65;
// Three quick ascending beeps — the most urgent-sounding preset.
const TRIPLE_NOTES = [880, 988, 1109];
const TRIPLE_DURATION = 0.15;
const TRIPLE_SPACING = 0.18;

export async function playReadyChime(): Promise<boolean> {
  return playNotes(CHIME_NOTES, NOTE_DURATION);
}

/** Play a vendor's chosen new-order sound preset. "none" is a silent no-op. */
export async function playSound(soundId: SoundId): Promise<boolean> {
  switch (soundId) {
    case "chime":
      return playNotes(CHIME_NOTES, NOTE_DURATION);
    case "bell":
      return playNotes(BELL_NOTES, BELL_DURATION, BELL_SPACING);
    case "ding":
      return playNotes(DING_NOTES, DING_DURATION);
    case "horn":
      return playNotes(HORN_NOTES, HORN_DURATION, HORN_SPACING);
    case "triple":
      return playNotes(TRIPLE_NOTES, TRIPLE_DURATION, TRIPLE_SPACING);
    case "none":
      return true;
  }
}
