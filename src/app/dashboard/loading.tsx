// Next wraps this segment's page (and nested pages below it) in a Suspense
// boundary keyed to this file: the layout's header renders immediately, and
// this shows while the incoming page loads (slow query, cold Turbopack
// compile). It is the outline of a page, a heading over a grid of tickets,
// so the content area does not jump when the real one arrives.
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="animate-pulse motion-reduce:animate-none"
    >
      <div className="mb-7 space-y-2.5">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-56 max-w-full rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-11 w-full rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
