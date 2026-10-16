// Per-booth accent colour: a booth's dot on the order card matches its dot in
// the board's filter and booth list, with no DB column and no config. Kept a
// quiet secondary channel: status colour stays the dominant signal on a card,
// the booth colour is only ever a small dot.
const BOOTH_COLORS = [
  // ember red
  "oklch(0.62 0.17 25)",
  // amber
  "oklch(0.7 0.15 65)",
  // green
  "oklch(0.64 0.13 150)",
  // teal
  "oklch(0.62 0.11 215)",
  // indigo
  "oklch(0.56 0.15 280)",
  // magenta
  "oklch(0.6 0.16 330)",
  // lime
  "oklch(0.66 0.14 110)",
  // cocoa
  "oklch(0.52 0.1 40)",
] as const;

/**
 * One colour per booth, by its place in the vendor's booth list (the board
 * loads it oldest first), so up to eight booths never share a colour. A hash
 * of the id could not promise that: two of five booths landing on one hue
 * made the dots read as meaningless. Adding a newer booth leaves the older
 * ones' colours as they were; a ninth booth starts the palette over.
 */
export function boothColors(boothIds: readonly string[]): Map<string, string> {
  return new Map(
    boothIds.map((id, i) => [id, BOOTH_COLORS[i % BOOTH_COLORS.length]]),
  );
}

/** What a booth's dot means, for its `title`: a hover hint on every dot. */
export function boothDotTitle(boothName: string): string {
  return `${boothName}'s colour, the same on its tickets and in the booth filter`;
}
