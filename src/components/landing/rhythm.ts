/**
 * The landing page's one spacing scale. Every gap on the page is one of these,
 * so same-level things always get the same space. Phone value first, then the
 * value from `md` (768px), where the journey chapters switch to two columns.
 *
 * - section: between major blocks (hero, trust strip, pain band, journey,
 *   closing, footer) and the inner top and bottom padding of the full-bleed
 *   pain band: 80px, then 96px.
 * - chapter: half a section. A dashed rule sits in the middle of the gap
 *   between two chapters, so the space above it and below it is one chapter
 *   step each: 40px, then 48px. A rule between chapters therefore reads as the
 *   same break as a section edge.
 * - heading stack: eyebrow to heading is 10px (`mt-2.5`) everywhere; a heading
 *   to its first block is 32px.
 */
export const CONTAINER = "mx-auto max-w-6xl px-5";

export const SECTION_PAD_TOP = "pt-20 md:pt-24";
export const SECTION_PAD_BOTTOM = "pb-20 md:pb-24";
export const SECTION_PAD_Y = "py-20 md:py-24";
export const SECTION_MARGIN_TOP = "mt-20 md:mt-24";

export const CHAPTER_PAD_TOP = "pt-10 md:pt-12";

/**
 * Put on the wrapper of one `JourneyStep` (or `ClosingCall`): its root div sits
 * one chapter step below the previous block's content, with the dashed rule
 * above one more step of padding and no bottom padding of its own, so the next
 * block owns the space below. The package root carries its own `mt`, `pt` and
 * `md:py`, which these higher-specificity selectors replace.
 */
export const CHAPTER_STEP =
  "[&>div]:mt-10 [&>div]:pt-10 md:[&>div]:mt-12 md:[&>div]:pt-12 md:[&>div]:pb-0";

/**
 * The pinned chapter: no rule and no top margin, because the journey section's
 * own top padding supplies the first step. Its phone padding stays the package
 * default (40px) so the short-phone fit rules keep their numbers.
 */
export const CHAPTER_FIRST =
  "[&>div]:mt-0 [&>div]:border-t-0 md:[&>div]:pt-12 md:[&>div]:pb-0";

/**
 * The closing block follows the same step as a chapter, but sits in its own
 * section whose top padding already provides the space above the rule.
 */
export const CLOSING_STEP =
  "[&>div]:pt-10 [&>div]:pb-0 md:[&>div]:pt-12 md:[&>div]:pb-0";
