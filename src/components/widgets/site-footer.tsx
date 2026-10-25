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
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- Link leaves the old hash in the URL bar on a fragment-only jump
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
