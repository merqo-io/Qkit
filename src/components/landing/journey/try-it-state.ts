export const MAX_KOPI = 6;
export const SAMPLE_QTY = 2;
export const SAMPLE_NAME = "Ada";
export const VISITOR_NAME = "You";
export const ORDER_NUMBER = "0042";

/** Where the visitor's own order is: not placed yet, then the product's stages. */
export type Stage = "menu" | "preparing" | "ready" | "done";

/** What the board and queue screen show, which may be the sample order. */
export type Phase = "none" | "preparing" | "ready" | "done";

export type TryItState = {
  /** The visitor has tapped chapter 1, so taps (not scroll) drive the phone. */
  taken: boolean;
  qty: number;
  stage: Stage;
};

export type TryItAction =
  | { type: "add" }
  | { type: "remove" }
  | { type: "place" }
  | { type: "ready" }
  | { type: "pickedUp" }
  | { type: "replay" }
  | { type: "reset" };

export const INITIAL_STATE: TryItState = {
  taken: false,
  qty: 0,
  stage: "menu",
};

/**
 * Order again keeps the takeover flag: scroll play stays off, so the phone
 * shows the empty menu wherever the page is scrolled and the pinned track
 * (already cut short by the first takeover, or still full for the untouched
 * sample) is neither restored nor resized under the visitor.
 */
const REPLAYED_STATE: TryItState = { taken: true, qty: 0, stage: "menu" };

/**
 * Taking over discards any progress made on the sample order, so the visitor's
 * own order always starts from an empty menu.
 */
function takeOver(state: TryItState): TryItState {
  return state.taken ? state : { taken: true, qty: 0, stage: "menu" };
}

export function tryItReducer(
  state: TryItState,
  action: TryItAction,
): TryItState {
  switch (action.type) {
    case "add": {
      const s = takeOver(state);
      if (s.stage !== "menu") return s;
      return { ...s, qty: Math.min(s.qty + 1, MAX_KOPI) };
    }
    case "remove": {
      const s = takeOver(state);
      if (s.stage !== "menu") return s;
      return { ...s, qty: Math.max(s.qty - 1, 0) };
    }
    case "place":
      return state.taken && state.stage === "menu" && state.qty > 0
        ? { ...state, stage: "preparing" }
        : state;
    case "ready":
      return phaseOf(state) === "preparing"
        ? { ...state, stage: "ready" }
        : state;
    case "pickedUp":
      return phaseOf(state) === "ready" ? { ...state, stage: "done" } : state;
    case "replay":
      return REPLAYED_STATE;
    case "reset":
      return INITIAL_STATE;
  }
}

/**
 * The sample ticket is on the board until the visitor takes over, so a visitor
 * who only scrolls can still press Mark Ready.
 */
export function phaseOf(state: TryItState): Phase {
  if (state.stage === "menu") return state.taken ? "none" : "preparing";
  return state.stage;
}

export function ticketOf(state: TryItState): { name: string; qty: number } {
  return state.taken
    ? { name: VISITOR_NAME, qty: state.qty }
    : { name: SAMPLE_NAME, qty: SAMPLE_QTY };
}

export const PHONE_STATUS: Record<Phase, string> = {
  none: "Waiting for an order",
  preparing: "Preparing your order",
  ready: "Ready. Collect at the counter.",
  done: "Picked up. Enjoy your kopi.",
};

/** One short sentence for the single live region; empty until the visitor acts. */
export function announcement(state: TryItState): string {
  switch (state.stage) {
    case "menu":
      return "";
    case "preparing":
      return `Order placed, number ${ORDER_NUMBER}. Preparing.`;
    case "ready":
      return `Order ${ORDER_NUMBER} is ready.`;
    case "done":
      return `Order ${ORDER_NUMBER} picked up.`;
  }
}
