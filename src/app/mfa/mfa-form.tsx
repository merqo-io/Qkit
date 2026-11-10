"use client";

import { useRouter } from "next/navigation";
import { MfaForm as SharedMfaForm, navigatingAway } from "@merqo/ui";
import { createClient } from "@/lib/supabase/client";

type Props = {
  verifiedFactorId: string | null;
  staleFactorIds: string[];
};

// The shared form hands mapError only a string, so each qkit message travels
// as a sentinel and is turned back into copy here.
const ENROL_FAILED = "mfa:enrol-failed";
const NO_FACTOR = "mfa:no-factor";
const VERIFY_FAILED = "mfa:verify-failed";

const COPY: Record<string, string> = {
  [ENROL_FAILED]: "Could not start setup. Try again.",
  [NO_FACTOR]: "Enter the 6-digit code from your authenticator app.",
  [VERIFY_FAILED]:
    "That code did not work. Check the time on your phone and try again.",
};

// A thrown error carries its own code or message rather than a sentinel; the
// only copy left for it is the wrong-code one.
function mapError(raw: string): string {
  return COPY[raw] ?? COPY[VERIFY_FAILED];
}

export function MfaForm({ verifiedFactorId, staleFactorIds }: Props) {
  const router = useRouter();

  async function onEnrol() {
    try {
      const supabase = createClient();
      for (const id of staleFactorIds) {
        await supabase.auth.mfa.unenroll({ factorId: id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (error || !data) return ENROL_FAILED;
      return {
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        factorId: data.id,
      };
    } catch {
      return ENROL_FAILED;
    }
  }

  async function onVerify(code: string, context: { factorId?: string }) {
    const factorId = context.factorId ?? verifiedFactorId;
    if (!factorId) return NO_FACTOR;
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) return VERIFY_FAILED;
    } catch {
      return VERIFY_FAILED;
    }
    router.replace("/admin");
    router.refresh();
    await navigatingAway();
  }

  return (
    <SharedMfaForm
      hasFactor={verifiedFactorId !== null}
      onEnrol={onEnrol}
      onVerify={onVerify}
      mapError={mapError}
    />
  );
}
