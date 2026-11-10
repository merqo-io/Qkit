// Same centred card as the real page so the verify form drops in place while
// the MFA and admin checks resolve.
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
        className="w-full max-w-md animate-pulse rounded-2xl border bg-card px-7 py-10 shadow-sm motion-reduce:animate-none"
      >
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="mt-6 h-8 w-2/3 rounded-lg bg-muted" />
        <div className="mt-6 space-y-3">
          <div className="h-11 w-full rounded-lg bg-muted" />
          <div className="h-11 w-full rounded-lg bg-muted" />
        </div>
      </div>
    </main>
  );
}
