export type PrepEstimate = {
  avgMinutes: number | null;
  sampleCount: number;
  minSample: number;
};

/** Help text under the backup prep-time input: explains what customers
 *  actually see right now — off, live-estimate, or not-enough-history. */
export function BackupPrepHelpText({
  showWaitEstimate,
  prepEstimate,
  defaultPrepMin,
}: {
  showWaitEstimate: boolean;
  prepEstimate: PrepEstimate;
  defaultPrepMin: string;
}) {
  if (!showWaitEstimate) {
    return (
      <p className="text-xs text-muted-foreground">
        Wait-time estimate is off above, so this backup isn&apos;t shown to
        customers either.
      </p>
    );
  }
  if (prepEstimate.avgMinutes !== null) {
    return (
      <p className="text-xs text-muted-foreground">
        Live right now: about {Math.round(prepEstimate.avgMinutes)} min per
        order, the typical time across your last {prepEstimate.sampleCount}{" "}
        orders. This backup isn&apos;t in use.
      </p>
    );
  }
  const fallback =
    defaultPrepMin.trim() === ""
      ? "their queue position"
      : "this backup number";
  return (
    <p className="text-xs text-muted-foreground">
      Not enough recent order history yet ({prepEstimate.sampleCount} of{" "}
      {prepEstimate.minSample} orders). Customers currently see {fallback}{" "}
      instead.
    </p>
  );
}
