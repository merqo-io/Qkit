// Placeholder for the first-booth card while the vendor and admin checks run.
// Matches the form's centred card so the swap does not shift the layout.
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center p-5"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="w-full max-w-md animate-pulse space-y-5 rounded-2xl border bg-card px-7 py-9 shadow-sm motion-reduce:animate-none"
      >
        <div className="h-6 w-28 rounded-full bg-muted" />
        <div className="h-10 w-3/4 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-11 w-full rounded-lg bg-muted" />
        <div className="h-11 w-full rounded-lg bg-muted" />
      </div>
    </main>
  );
}
