"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Button, Input, Label } from "@merqo/ui/primitives";

import { Ticket } from "@/components/widgets/ticket";
import { vendorSchema, type VendorInput } from "@/lib/schemas";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { createVendor } from "./actions";

export function OnboardingForm() {
  const router = useRouter();
  const { pending: loading, run } = useAsyncAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorInput>({ resolver: zodResolver(vendorSchema) });

  function onSubmit(data: VendorInput) {
    return run(async () => {
      const result = await createVendor(data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // replace (not push) so Back doesn't return to onboarding; no refresh — the
      // dashboard is revalidate=0 so it re-fetches the new vendor on navigation,
      // and a refresh here would cancel the navigation.
      router.replace("/dashboard");
      await navigatingAway();
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <Ticket shadow="lifted">
          <div className="px-7 pt-9 pb-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary">
              <Store className="size-3.5" />
              Step 1 of 1
            </span>

            <h1 className="font-display mt-5 text-4xl font-semibold leading-[1.05]">
              Set up your stall
            </h1>
            <p className="mt-2 text-[0.95rem] text-muted-foreground">
              This is the name customers see when they scan your booth.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-7">
              <div className="space-y-2.5">
                <Label
                  htmlFor="name"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Stall name
                </Label>
                <Input
                  id="name"
                  placeholder="Mama's Kitchen"
                  autoFocus
                  className="h-12 rounded-xl text-base"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  {...register("name")}
                />
                {errors.name && (
                  <p
                    id="name-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.name.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={loading}
              >
                {loading ? "Saving…" : "Open my stall →"}
              </Button>
            </form>
          </div>

          <div className="perforation" />
          <p className="bg-card px-7 py-4 text-center text-xs text-muted-foreground">
            You can rename it any time from your dashboard.
          </p>
        </Ticket>
      </div>
    </main>
  );
}
