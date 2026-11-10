// The queue display runs on a venue TV, so the wait is a plain dark screen
// rather than a shaped skeleton. The order layout already provides <main>.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="dark flex h-screen items-center justify-center bg-background text-foreground"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="h-3 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none"
      />
    </div>
  );
}
