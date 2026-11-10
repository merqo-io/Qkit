// The admin layout (header and tabs) renders at once; this fills the content
// area while the admin queries run. It mirrors the page's width and rhythm, a
// row of stat tiles over two list blocks, so nothing jumps when data lands.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto max-w-5xl space-y-8 px-5 py-7"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-8 motion-reduce:animate-none"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-border bg-card p-4"
            >
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-7 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-24 w-full rounded-xl border border-border bg-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
