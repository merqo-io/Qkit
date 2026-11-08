"use client";

import type { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardSettingsSchema, type BoardSettingsInput } from "@/lib/schemas";
import { updateBoardSettings } from "./actions";

/** Validate local settings, then persist only the section's owned fields. */
export function saveBoardSettingsSection({
  parsed,
  setError,
  fallbackErrorMessage,
  run,
  successMessage,
  router,
  keys,
}: {
  parsed: ReturnType<typeof boardSettingsSchema.safeParse>;
  setError: (message: string | null) => void;
  fallbackErrorMessage: string;
  run: (fn: () => Promise<void>) => Promise<void>;
  successMessage: string;
  router: ReturnType<typeof useRouter>;
  keys: (keyof BoardSettingsInput)[];
}) {
  if (!parsed.success) {
    setError(parsed.error.issues[0]?.message ?? fallbackErrorMessage);
    return;
  }
  setError(null);
  return run(async () => {
    const patch = Object.fromEntries(
      keys.map((key) => [key, parsed.data[key]]),
    );
    const res = await updateBoardSettings(patch);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  });
}
