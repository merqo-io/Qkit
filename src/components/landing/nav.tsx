import Link from "next/link";
import { LandingNav } from "@merqo/ui";
import { Button } from "@/components/ui/button";

export function Nav({ authed }: { authed: boolean }) {
  return (
    <LandingNav
      wordmark={
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- Link leaves the old hash in the URL bar on a fragment-only jump
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
      }
      end={
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden rounded-lg sm:inline-flex"
          >
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Link leaves the old hash in the URL bar on a fragment-only jump */}
            <a href="/#faq">FAQ</a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden rounded-lg sm:inline-flex"
          >
            <Link href="/about">About</Link>
          </Button>
          {authed ? (
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
