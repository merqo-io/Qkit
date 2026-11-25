export type SetupFlag = "payment-skipped" | "qr-viewed";

const PREFIX = "qkit:setup:";
const CHANGE_EVENT = "qkit:setup-change";
export const HIDDEN_KEY = `${PREFIX}hidden`;
export const TV_OPENED_KEY = `${PREFIX}tv-opened`;

/** Keeps a choice for this page load when storage refuses the write. */
const memory = new Set<string>();

/** Drops the in-page choices; storage itself is untouched. Used by tests. */
export function resetSetupMemory(): void {
  memory.clear();
}

const flagKey = (flag: SetupFlag, boothId: string) =>
  `${PREFIX}${flag}:${boothId}`;

function isSet(key: string): boolean {
  return memory.has(key) || window.localStorage.getItem(key) === "1";
}

function remember(key: string): void {
  memory.add(key);
  window.localStorage.setItem(key, "1");
}

/** Storage can be missing or throw (private mode, blocked cookies); that reads as "not set". */
export function readSetupFlag(flag: SetupFlag, boothId: string): boolean {
  try {
    return isSet(flagKey(flag, boothId));
  } catch {
    return false;
  }
}

export function writeSetupFlag(flag: SetupFlag, boothId: string): void {
  try {
    remember(flagKey(flag, boothId));
  } catch {
    return;
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** The TV step is one setup per vendor, so it is not keyed by booth. */
export function readTvOpened(): boolean {
  try {
    return isSet(TV_OPENED_KEY);
  } catch {
    return false;
  }
}

export function writeTvOpened(): void {
  try {
    remember(TV_OPENED_KEY);
  } catch {
    return;
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function readChecklistHidden(): boolean {
  try {
    return isSet(HIDDEN_KEY);
  } catch {
    return false;
  }
}

export function writeChecklistHidden(): void {
  try {
    remember(HIDDEN_KEY);
  } catch {
    return;
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** For useSyncExternalStore: fires on writes in this tab and on changes from other tabs. */
export function subscribeSetupStorage(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
