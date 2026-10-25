"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  verifiedFactorId: string | null;
  staleFactorIds: string[];
};

const CODE = /^\d{6}$/;

export function MfaForm({ verifiedFactorId, staleFactorIds }: Props) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(verifiedFactorId);
  const [enrolment, setEnrolment] = useState<{
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnrol() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    for (const id of staleFactorIds) {
      await supabase.auth.mfa.unenroll({ factorId: id });
    }
    const { data, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });
    setBusy(false);
    if (enrolError || !data) {
      setError("Could not start setup. Try again.");
      return;
    }
    setFactorId(data.id);
    setEnrolment({ qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!factorId || !CODE.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } =
      await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setBusy(false);
      setError(
        "That code did not work. Check the time on your phone and try again.",
      );
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  if (!factorId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Admin access needs an authenticator app. Set one up once, then enter
          its code each time you sign in.
        </p>
        <Button
          onClick={startEnrol}
          disabled={busy}
          className="h-11 w-full rounded-xl"
        >
          Set up authenticator
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {enrolment && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a data: SVG, nothing to optimise */}
          <img
            src={enrolment.qr}
            alt="Authenticator QR code"
            className="mx-auto size-44"
          />
          <p className="text-center text-xs text-muted-foreground">
            Can&rsquo;t scan? Enter this key instead:
          </p>
          <code className="block break-all text-center text-sm">
            {enrolment.secret}
          </code>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="mfa-code">6-digit code</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
        Verify
      </Button>
    </form>
  );
}
