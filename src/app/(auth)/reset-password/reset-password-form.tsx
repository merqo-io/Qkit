"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Input, Label } from "@merqo/ui/primitives";

import { createClient } from "@/lib/supabase/client";
import { Ticket } from "@/components/widgets/ticket";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { passwordChangeSchema } from "@/lib/schemas";
import { FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";

type SessionState = "checking" | "ready" | "no-session" | "failed";

/**
 * Sets a new password on the recovery session established by /auth/callback
 * (the reset link exchanges its code there, then forwards here). If no session
 * is present the link was already used or expired, so we route the user back to
 * sign in rather than showing a form that would fail.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [state, setState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAsyncAction();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(
      ({ data }) => {
        if (active) setState(data.user ? "ready" : "no-session");
      },
      () => {
        if (active) setState("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [supabase]);

  function submit() {
    const parsed = passwordChangeSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    setError(null);
    return run(async () => {
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateError) {
        toast.error(updateError.message);
        return;
      }
      toast.success("Password updated");
      router.push("/dashboard");
      router.refresh();
      await navigatingAway();
    });
  }

  if (state === "checking") {
    return (
      <Ticket shadow="lifted" className="px-7 py-8">
        <p className="text-center text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      </Ticket>
    );
  }

  if (state === "no-session" || state === "failed") {
    return (
      <Ticket shadow="lifted" className="px-7 py-8">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          {state === "failed"
            ? "Could not check your reset link"
            : "This link has expired"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state === "failed"
            ? "Check your connection and reload this page, or return to sign in."
            : "Password reset links can only be used once, and they expire after a short while. Request a fresh one from the sign-in page."}
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 h-11 w-full rounded-xl"
        >
          <Link href="/login">Back to sign in</Link>
        </Button>
      </Ticket>
    );
  }

  return (
    <Ticket shadow="lifted" className="px-7 py-8">
      <h1 className="font-display text-2xl font-semibold leading-tight">
        Set a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick something at least 8 characters long.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="new-password" className={FORM_LABEL_CLASS}>
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className={FORM_LABEL_CLASS}>
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
          />
          {error && <p className={FORM_ERROR_CLASS}>{error}</p>}
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={pending || !password || !confirm}
          className="h-12 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Ticket>
  );
}
