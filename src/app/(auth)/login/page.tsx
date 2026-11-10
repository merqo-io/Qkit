"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button, Input, Label } from "@merqo/ui/primitives";

import { ElevatedCard } from "@merqo/ui";
import { Wordmark } from "@/components/landing/wordmark";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { GoogleMark } from "@merqo/ui";

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const { pending: loading, run } = useAsyncAction();
  // Set when we've emailed the user and are waiting on them to click a link:
  // "signup" = confirm the new account, "reset" = choose a new password.
  const [sent, setSent] = useState<{
    email: string;
    kind: "signup" | "reset";
  } | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function signInWithGoogle() {
    return run(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { hl: "en" },
        },
      });
      if (error) toast.error(error.message);
      // On success the browser navigates to Google; no further action here.
    });
  }

  function onSubmit(data: LoginInput) {
    return run(async () => {
      if (mode === "signup") {
        const { data: result, error } = await supabase.auth.signUp(data);
        if (error) {
          toast.error(error.message);
          return;
        }
        // Email confirmation on → no session yet. Show a "check your email" state
        // instead of bouncing to a dashboard the user can't reach.
        if (!result.session) {
          setSent({ email: data.email, kind: "signup" });
          return;
        }
        router.push("/dashboard");
        router.refresh();
        await navigatingAway();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      await navigatingAway();
    });
  }

  // Email a password-reset link. The link lands on /auth/callback, which
  // establishes a recovery session and forwards to /reset-password.
  function sendReset() {
    const email = getValues("email");
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error("Enter your email first");
      return;
    }
    return run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent({ email, kind: "reset" });
    });
  }

  const isSignin = mode === "signin";
  let submitLabel: string;
  if (loading) submitLabel = "Please wait…";
  else if (isSignin) submitLabel = "Sign in";
  else submitLabel = "Create account";

  if (sent) {
    const isReset = sent.kind === "reset";
    return (
      <main className="min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <ElevatedCard className="px-7 py-10">
            <Link
              href="/"
              aria-label="qkit home"
              className="inline-block transition-opacity hover:opacity-80"
            >
              <Wordmark className="text-2xl" />
            </Link>
            <h1 className="font-display mt-6 text-3xl font-semibold leading-tight">
              Check your email
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isReset ? (
                <>
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Open it to choose a new password.
                </>
              ) : (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Click it to activate your account, then sign in.
                </>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-7 h-11 w-full rounded-xl"
              onClick={() => {
                setSent(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </ElevatedCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Brand lockup */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            aria-label="qkit home"
            className="inline-block transition-opacity hover:opacity-80"
          >
            <Wordmark className="text-3xl" />
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Run your booth. Watch orders land live.
          </p>
        </div>

        <ElevatedCard>
          <div className="px-7 pt-9 pb-8">
            <h1 className="font-display text-3xl font-semibold leading-tight">
              {isSignin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignin
                ? "Sign in to your vendor dashboard."
                : "Set up a vendor account in seconds."}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={loading}
              className="mt-7 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                or with email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@business.sg"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p
                    id="email-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </Label>
                  {isSignin && (
                    <button
                      type="button"
                      onClick={sendReset}
                      disabled={loading}
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password")}
                />
                {errors.password && (
                  <p
                    id="password-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={loading}
              >
                {submitLabel}
              </Button>
            </form>
          </div>

          <div className="border-t" />
          <p className="px-7 py-4 text-center text-sm text-muted-foreground">
            {isSignin ? "New to qkit? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setMode(isSignin ? "signup" : "signin")}
            >
              {isSignin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </ElevatedCard>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
