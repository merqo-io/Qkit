/**
 * How far a pinned step has played, 0 to 1. The track is a tall block holding
 * a sticky panel; the panel is stuck from the moment the track's top reaches
 * `pinTop` until the track's bottom reaches the panel's bottom, which is
 * `trackHeight - panelHeight` of scrolling. Before the pin it is 0, after the
 * release it stays 1, and a track no taller than its panel has no scroll to
 * play with, so it reads as finished.
 */
export function pinnedProgress(m: {
  trackTop: number;
  trackHeight: number;
  panelHeight: number;
  pinTop: number;
}): number {
  const distance = m.trackHeight - m.panelHeight;
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  const p = (m.pinTop - m.trackTop) / distance;
  return Math.max(0, Math.min(1, p));
}

/**
 * Whether a panel can be pinned at `pinTop` without any of it running past the
 * bottom of the viewport. Pinning a panel taller than the space under the nav
 * would hide its start behind the nav or its controls below the fold, so the
 * caller shows the finished state unpinned instead. An unmeasured panel or
 * viewport counts as fitting: there is nothing to prove it does not.
 */
export function pinFits(m: {
  panelHeight: number;
  viewportHeight: number;
  pinTop: number;
}): boolean {
  const measured = m.panelHeight > 0 && m.viewportHeight > 0;
  if (!measured) return true;
  return m.panelHeight <= m.viewportHeight - m.pinTop;
}
