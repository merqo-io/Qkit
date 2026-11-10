"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { resolveSupportMessage } from "./actions";

/** Mark a vendor help request resolved once it's been handled. */
export function ResolveMessageButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await resolveSupportMessage({ id });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="rounded-lg"
      disabled={pending}
      onClick={onClick}
    >
      <Check className="size-3.5" /> Resolve
    </Button>
  );
}
