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
