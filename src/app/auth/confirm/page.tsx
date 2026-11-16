import type { Metadata } from "next";
import Link from "next/link";
import { AuthConfirmForm, AuthConfirmInvalid } from "@merqo/ui";
import { readAuthConfirmParams } from "@merqo/ui/auth";

export const metadata: Metadata = {
  title: "Continue | qkit",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const revalidate = 0;

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = readAuthConfirmParams(await searchParams);
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            aria-label="qkit home"
            className="font-display inline-flex items-baseline gap-0.5 text-4xl font-semibold tracking-tight transition-opacity hover:opacity-80"
          >
            <span className="text-primary">Q</span>Kit
          </Link>
        </div>
        {params ? (
          <AuthConfirmForm
            tokenHash={params.tokenHash}
            type={params.type}
            next={params.next}
          />
        ) : (
          <AuthConfirmInvalid />
        )}
      </div>
    </main>
  );
}
