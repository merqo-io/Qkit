"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PlatformSettingsConfig } from "@/lib/platform-settings";
import { setBanner } from "./actions";

/** Admin toggle for the site-wide maintenance banner (informational only). */
export function BannerForm({ initial }: { initial: PlatformSettingsConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.banner_enabled);
  const [message, setMessage] = useState(initial.banner_message);

  function onSave() {
    startTransition(async () => {
      const res = await setBanner({
        banner_enabled: enabled,
        banner_message: message,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Banner updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Switch
          id="banner-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="banner-enabled" className="text-sm font-medium">
          Show maintenance banner site-wide
        </Label>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="banner-message"
          className="text-xs font-medium text-muted-foreground"
        >
          Message
        </Label>
        <Textarea
          id="banner-message"
          value={message}
          maxLength={280}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-lg"
          placeholder="e.g. Scheduled maintenance 10pm-11pm SGT, some things may be slow."
        />
      </div>
      <Button
        type="button"
        className="rounded-lg"
        onClick={onSave}
        disabled={pending}
      >
        {pending ? "Saving…" : "Save banner"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Informational only. Never blocks ordering or the dashboard. Shown to
        every visitor, including anonymous customers.
      </p>
    </div>
  );
}
