// Rendered inside the link LegalPage and AcceptTermsPage own, so it must not be
// a link itself. The visible mark is hidden from assistive tech so the link's
// name reads "qkit home" instead of the split "Q" and "Kit".
export function LegalWordmark() {
  return (
    <>
      <span
        aria-hidden="true"
        className="font-display inline-flex items-baseline gap-0.5 text-2xl font-semibold tracking-tight"
      >
        <span className="text-primary">Q</span>Kit
      </span>
      <span className="sr-only">qkit home</span>
    </>
  );
}
