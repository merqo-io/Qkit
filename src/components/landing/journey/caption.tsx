/**
 * One helper line that changes with the demo. Every possible line is stacked
 * invisibly in the same grid cell, so the block always holds the height of the
 * longest and nothing below it moves when the line changes. Announcements go
 * through the single live region in `TryIt`, so this is not live.
 */
export function Caption({
  lines,
  index,
}: {
  lines: readonly string[];
  index: number;
}) {
  return (
    <div className="mt-4 grid max-w-[34ch] font-semibold">
      <p className="col-start-1 row-start-1">{lines[index]}</p>
      {lines.map((text) => (
        <p key={text} aria-hidden className="invisible col-start-1 row-start-1">
          {text}
        </p>
      ))}
    </div>
  );
}
