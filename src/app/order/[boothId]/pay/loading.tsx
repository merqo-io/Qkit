// Shown while the pay page loads the pre-claim context. The order layout
// already provides <main>, so this is a plain block in the page's narrow column.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto max-w-sm space-y-4 px-5 py-10 text-center"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="mx-auto h-7 w-2/3 rounded-lg bg-muted" />
        <div className="mx-auto h-4 w-full rounded bg-muted" />
        <div className="mx-auto h-4 w-1/2 rounded bg-muted" />
        <div className="h-11 w-full rounded-lg bg-muted" />
      </div>
    </div>
  );
}
