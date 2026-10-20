import { Footer } from "@merqo/ui";

/**
 * qkit's copy of the family footer: `@merqo/ui`'s shared `Footer` with the
 * qkit wordmark and tagline. The landing page and `/about` pass `showSignIn`;
 * the dashboard leaves it off, since everyone there is already signed in.
 */
export function SiteFooter({ showSignIn = false }: { showSignIn?: boolean }) {
  return (
    <Footer
      wordmark={
        // Plain <a>, not Link — see nav.tsx's wordmark comment: a same-page
        // hash jump needs a native anchor so the URL bar's hash always
        // updates, which Link doesn't reliably do when only the fragment
        // changes.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display text-xl font-semibold text-foreground transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
      }
      tagline="Built for booths. Made in Singapore."
      kitName="qkit"
      showSignIn={showSignIn}
    />
  );
}
