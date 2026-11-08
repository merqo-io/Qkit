"use client";

import { useState, useSyncExternalStore } from "react";
import type { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/widgets/ticket-section";
import { Hint } from "@/components/widgets/hint";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  isNotifySupported,
  notifyPermission,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn } from "@/lib/utils";
import { updateBoardSettings } from "./actions";

/**
 * Desktop-notification toggle + browser-permission flow, factored out of
 * SettingsForm: the account-level `desktop_notify` setting (synced across
 * devices) and the browser-level `Notification.permission` (this device
 * only) are two different concerns that both gate on the same
 * gesture-triggered grant flow.
 */
export function useDesktopNotifySection(
  initialDesktopNotify: boolean,
  router: ReturnType<typeof useRouter>,
) {
  const [desktopNotify, setDesktopNotify] = useState(initialDesktopNotify);
  // Browser-level permission, separate from `desktop_notify` (the account
  // setting, synced across devices). Notification.permission doesn't itself
  // trigger a re-render, so this is tracked explicitly and only updated after
  // OUR OWN request calls — never re-read from the browser mid-render.
  const [permission, setPermission] = useState(() => notifyPermission());
  // The browser's answer is only known on the client. useSyncExternalStore
  // returns the server snapshot (false) during hydration, then the client
  // one, so the permission note never mismatches the server's markup.
  const onClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { pending: savingNotify, run: runNotify } = useAsyncAction(
    "Could not update notifications. Please try again.",
  );

  // Gesture-gated — only ever called from a click, the one reliable moment
  // to unlock audio + ask permission (web.dev double-opt-in guidance).
  async function grantPermission(): Promise<boolean> {
    unlockAudio();
    if (!isNotifySupported()) {
      toast.error("Your browser doesn't support desktop notifications.");
      return false;
    }
    const result = await requestNotifyPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(
        "Notifications blocked. Enable them for this site in your browser settings, then try again.",
      );
      return false;
    }
    return true;
  }

  function toggleDesktopNotify() {
    return runNotify(async () => {
      const next = !desktopNotify;
      if (next && !(await grantPermission())) return;
      const res = await updateBoardSettings({
        desktop_notify: next,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setDesktopNotify(next);
      toast.success(next ? "Notifications on" : "Notifications off");
      router.refresh();
    });
  }

  // Re-request browser permission without touching the (already-on) account
  // setting — the toggle above can't reach this path once desktopNotify is
  // already true, since clicking it there means turning OFF.
  function enableInBrowser() {
    return runNotify(async () => {
      if (await grantPermission()) {
        toast.success("Notifications enabled in this browser");
      }
    });
  }

  return {
    desktopNotify,
    permission,
    onClient,
    savingNotify,
    toggleDesktopNotify,
    enableInBrowser,
  };
}

/**
 * The "Notifications" section's toggle + browser-permission sub-affordance.
 * `children` are the card's other notification switches.
 */
export function DesktopNotifySection({
  desktopNotify,
  permission,
  onClient,
  savingNotify,
  toggleDesktopNotify,
  enableInBrowser,
  children,
}: {
  desktopNotify: boolean;
  permission: NotificationPermission | null;
  onClient: boolean;
  savingNotify: boolean;
  toggleDesktopNotify: () => void;
  enableInBrowser: () => void;
  children?: React.ReactNode;
}) {
  // The setting is account-wide and syncs across devices, so it stays on
  // here; the label says this device is the one not getting popups.
  const blockedHere = onClient && desktopNotify && permission !== "granted";
  let statusLabel = "Off";
  if (blockedHere) statusLabel = "On, but not on this device";
  else if (desktopNotify) statusLabel = "On";
  return (
    <Section
      icon={<Bell className="size-5" />}
      title="Notifications"
      description="A popup for a new order when this tab is backgrounded."
    >
      <div className="flex items-center gap-3">
        <Switch
          checked={desktopNotify}
          onCheckedChange={toggleDesktopNotify}
          disabled={savingNotify}
          aria-label="Desktop notifications"
          className={cn(blockedHere && "data-[state=checked]:bg-warning")}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            blockedHere && "text-warning",
            !blockedHere && desktopNotify && "text-success",
            !desktopNotify && "text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
        {/* A tap-to-open hint beside the switch, not the section title's
            hover tooltip: this one is written for iPhone and iPad, where a
            hover tooltip cannot be opened at all. */}
        <Hint label="About notifications on iPhone and iPad">
          Works on Android and desktop browsers. On iPhone or iPad, add qkit to
          your Home Screen first. A regular Safari tab cannot show these.
        </Hint>
      </div>
      {blockedHere && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {isNotifySupported()
              ? "Not allowed in this browser yet. This device won't show popups until you enable it."
              : "Not supported in this browser. On iPhone or iPad, add qkit to your Home Screen first."}
          </p>
          {isNotifySupported() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enableInBrowser}
              disabled={savingNotify}
              className="h-7 rounded-lg text-xs"
            >
              Enable in this browser
            </Button>
          )}
        </div>
      )}
      {children}
    </Section>
  );
}
