export type Screen = "phone" | "board";
export type StoryStep = 1 | 2 | 3;
export type StoryAct = "place" | "start" | "ready" | "pickup" | "replay";

export const MENU = [
  { key: "kopi", name: "Kopi", option: "Iced", cents: 180 },
  { key: "teh", name: "Teh", option: "Less sugar", cents: 200 },
  { key: "toast", name: "Kaya Toast", option: "", cents: 250 },
  { key: "milo", name: "Milo", option: "Hot", cents: 220 },
] as const;

export type MenuKey = (typeof MENU)[number]["key"];

/** Stages 0 to 4 are menu, sent, preparing, ready and collected. */
export const STEP_OF: readonly StoryStep[] = [1, 2, 3, 3, 3];

/** The stage a step button or a scroll position plays to. */
export const CANON: Record<StoryStep, number> = { 1: 0, 2: 1, 3: 2 };

/** The screen worth looking at after each stage when nobody has chosen one. */
const AUTO: readonly Screen[] = ["phone", "board", "board", "phone", "phone"];

/** The screen holding the next button to tap, or null once the order is done. */
const NEXT_ON: readonly (Screen | null)[] = [
  "phone",
  "board",
  "board",
  "board",
  null,
];

export const PHONE_STATUS = [
  "Menu open",
  "Order sent",
  "Preparing",
  "Ready to collect",
  "Collected",
] as const;

export const BOARD_STATUS = [
  "2 active",
  "New order 0042",
  "Preparing 0042",
  "0042 ready",
  "2 active",
] as const;

export const CLOCKS = ["12:40", "12:41", "12:42", "12:44", "12:45"] as const;

/** Seconds a ready sample order waits before it clears itself. */
export const AUTO_CLEAR_SECONDS = 10;

const ACT_TO: Record<StoryAct, number> = {
  place: 1,
  start: 2,
  ready: 3,
  pickup: 4,
  replay: 0,
};

const ACT_FROM: Record<Exclude<StoryAct, "replay">, number> = {
  place: 0,
  start: 1,
  ready: 2,
  pickup: 3,
};

/** The story step an act lands on, which is where the page follows it. */
export function stepAfter(act: StoryAct): StoryStep {
  return STEP_OF[ACT_TO[act]];
}

export type StoryState = {
  stage: number;
  prev: number;
  /** A screen the visitor picked on a phone, or null to follow the story. */
  override: Screen | null;
  qty: Record<MenuKey, number>;
};

export type StoryAction =
  | { type: "qty"; key: MenuKey; delta: 1 | -1 }
  | { type: "act"; act: StoryAct; wide: boolean }
  | { type: "autoClear"; wide: boolean }
  | { type: "go"; step: StoryStep }
  | { type: "scroll"; step: StoryStep }
  | { type: "tab"; screen: Screen }
  | { type: "settle" };

export const INITIAL_STATE: StoryState = {
  stage: 0,
  prev: 0,
  override: null,
  qty: { kopi: 2, teh: 0, toast: 1, milo: 0 },
};

export function focusOf(state: StoryState): Screen {
  return state.override ?? AUTO[state.stage];
}

export function itemCount(state: StoryState): number {
  return MENU.reduce((sum, m) => sum + state.qty[m.key], 0);
}

export function totalCents(state: StoryState): number {
  return MENU.reduce((sum, m) => sum + state.qty[m.key] * m.cents, 0);
}

function move(state: StoryState, to: number, keepScreen: boolean): StoryState {
  return {
    ...state,
    prev: state.stage,
    stage: to,
    override: keepScreen ? focusOf(state) : null,
  };
}

function applyAct(state: StoryState, act: StoryAct, wide: boolean): StoryState {
  if (act === "replay") {
    return state.stage >= 3 ? move(state, 0, !wide) : state;
  }
  if (state.stage !== ACT_FROM[act]) return state;
  if (act === "place" && itemCount(state) === 0) return state;
  return move(state, ACT_TO[act], !wide);
}

export function storyReducer(
  state: StoryState,
  action: StoryAction,
): StoryState {
  switch (action.type) {
    case "qty": {
      const next = Math.max(
        0,
        Math.min(9, state.qty[action.key] + action.delta),
      );
      return { ...state, qty: { ...state.qty, [action.key]: next } };
    }
    case "act":
      return applyAct(state, action.act, action.wide);
    case "autoClear":
      return state.stage === 3 ? move(state, 4, !action.wide) : state;
    case "go": {
      const to = CANON[action.step];
      if (to === state.stage) return { ...state, override: null };
      return move(state, to, false);
    }
    case "scroll":
      return STEP_OF[state.stage] === action.step
        ? state
        : move(state, CANON[action.step], false);
    case "tab":
      return { ...state, override: action.screen };
    case "settle":
      return state.stage === 4 ? state : move(state, 4, false);
  }
}

/** Which tab, if any, should flash because the next tap is on that screen. */
export function cuedScreen(state: StoryState): Screen | null {
  const next = NEXT_ON[state.stage];
  return next !== null && next !== focusOf(state) ? next : null;
}

/** The line under a tab: what that screen shows, or the nudge to switch. */
export function tabSubtitle(state: StoryState, screen: Screen): string {
  if (cuedScreen(state) === screen) return "Tap to continue";
  return screen === "phone"
    ? PHONE_STATUS[state.stage]
    : BOARD_STATUS[state.stage];
}

/** True when the screen's status changed with the last move and it is hidden. */
export function tabFlashes(state: StoryState, screen: Screen): boolean {
  if (state.stage === state.prev || focusOf(state) === screen) return false;
  return screen === "phone"
    ? PHONE_STATUS[state.stage] !== PHONE_STATUS[state.prev]
    : BOARD_STATUS[state.stage] !== BOARD_STATUS[state.prev];
}

/** One sentence for the single live region; empty until something happens. */
export function announcement(state: StoryState): string {
  if (state.stage === state.prev) return "";
  return `Phone: ${PHONE_STATUS[state.stage]}. Board: ${BOARD_STATUS[state.stage]}.`;
}
