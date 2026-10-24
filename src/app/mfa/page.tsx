import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdminMember } from "@/lib/admin/access";
import { Wordmark } from "@/components/landing/wordmark";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-step sign-in" };

// Lives outside /admin so the aal2 gate on /admin cannot loop back here.
export default async function MfaPage() {
  await requireAdminMember();
  const supabase = await createServerClient();
  const { data: level } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === "aal2") redirect("/admin");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp[0] ?? null;
  const staleFactorIds = (factors?.all ?? [])
    .filter((f) => f.factor_type === "totp" && f.status === "unverified")
    .map((f) => f.id);

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card px-7 py-10 shadow-sm">
        <Wordmark className="text-2xl" />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">
          Two-step sign-in
        </h1>
        <div className="mt-6">
          <MfaForm
            verifiedFactorId={verified?.id ?? null}
            staleFactorIds={staleFactorIds}
          />
        </div>
      </div>
    </main>
  );
}
