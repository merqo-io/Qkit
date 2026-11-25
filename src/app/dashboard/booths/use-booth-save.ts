"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { commitPendingImages, PendingImageUploadError } from "@merqo/ui";
import { removeUnsavedImages } from "@/lib/image-upload-adapter";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { boothFormSchema } from "@/lib/schemas";
import type { BoothHours } from "@/lib/hours";
import type { SocialLinks } from "@/lib/types";
import { saveBooth, deleteBooth } from "./actions";
import { limitOrNull } from "./booth-limits-section";

export interface BoothFormValues {
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  hours: BoothHours;
  takesPayment: boolean;
  socialLinks: SocialLinks | null;
  requiresArrivalConfirm: boolean;
  walkupDefault: boolean;
  printEnabled: boolean;
  pickupScanEnabled: boolean;
  paykitBookingId: string | null;
  dailyCupCap: string;
  maxItemsPerOrder: string;
}

/**
 * Uploads the form's pending images. On an upload failure, deletes whatever
 * did upload, tells the vendor, and returns null so the save stops.
 */
async function commitImages(values: (string | null)[]) {
  try {
    return await commitPendingImages(values);
  } catch (error) {
    if (error instanceof PendingImageUploadError)
      void removeUnsavedImages(error.uploaded);
    toast.error("Could not upload the image. Try again.");
    return null;
  }
}

export const NAVIGATION_TIMEOUT_MS = 12_000;

/**
 * `navigatingAway()` never resolves, so a navigation that stalls (a slow or
 * failed RSC render of the next page) would leave the button on "Saving..."
 * forever. Past the deadline the saved booth is reached with a full page load.
 * The deadline is cancelled when the form unmounts (navigation landed), so a
 * successful save never triggers the fallback on the next page.
 * The button is not released: a create has no boothId yet, so a retry would
 * insert a duplicate booth.
 */
async function awaitNavigation(
  href: string,
  timerRef: { current: ReturnType<typeof setTimeout> | undefined },
) {
  const stalled = new Promise<"stalled">((resolve) => {
    timerRef.current = setTimeout(
      () => resolve("stalled"),
      NAVIGATION_TIMEOUT_MS,
    );
  });
  await Promise.race([navigatingAway(), stalled]);
  toast.error("The next page is slow to load. Opening it again.");
  window.location.assign(href);
  await navigatingAway();
}

export function useBoothSave(
  boothId: string | undefined,
  values: BoothFormValues,
  onInvalid?: (field: string) => void,
) {
  const router = useRouter();
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(deadlineRef.current), []);
  const { pending: saving, run: runSave } = useAsyncAction(
    "Could not save the booth. Refresh to check its status before retrying.",
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isCreate = !boothId;

    return runSave(async () => {
      // The banner uploader defers its upload, so a vendor who picks an
      // image and leaves without saving leaves nothing in storage.
      const committed = await commitImages([values.imageUrl]);
      if (!committed) return;
      const [committedBanner] = committed.urls;
      const candidate = {
        boothId,
        name: values.name,
        image_url: committedBanner ?? null,
        is_active: values.isActive,
        hours: values.hours,
        takes_payment: values.takesPayment,
        social_links: values.socialLinks,
        requires_arrival_confirm: values.requiresArrivalConfirm,
        walkup_default: values.walkupDefault,
        print_enabled: values.printEnabled,
        pickup_scan_enabled: values.pickupScanEnabled,
        paykit_booking_id: values.paykitBookingId,
        daily_cup_cap: limitOrNull(values.dailyCupCap),
        max_items_per_order: limitOrNull(values.maxItemsPerOrder),
      };
      const parsed = boothFormSchema.safeParse(candidate);
      if (!parsed.success) {
        void removeUnsavedImages(committed.uploaded);
        const field = parsed.error.issues[0]?.path[0];
        if (field !== undefined) onInvalid?.(String(field));
        toast.error(parsed.error.issues[0]?.message ?? "Check the form");
        return;
      }

      const result = await saveBooth(parsed.data, committed.uploaded);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Booth saved");
      // replace + no refresh: a refresh here races and cancels the navigation
      // (same bug as onboarding). The list is revalidate=0 so it refetches on nav.
      // A fresh create goes straight to the menu page — saveMenuItems needs a
      // real boothId, which only exists after this first save.
      const href = isCreate
        ? `/dashboard/booths/${result.boothId}/menu?new=1`
        : "/dashboard/booths";
      router.replace(href);
      await awaitNavigation(href, deadlineRef);
    });
  }

  return { saving, onSubmit };
}

export function useBoothDelete(boothId: string | undefined) {
  const router = useRouter();
  // No failure message: a rejection must reach ConfirmDialog so it stays open
  // and shows the error inline.
  const { pending: deleting, run: runDelete } = useAsyncAction();

  function onDelete() {
    if (!boothId) return;
    return runDelete(async () => {
      let result: Awaited<ReturnType<typeof deleteBooth>>;
      try {
        result = await deleteBooth(boothId);
      } catch {
        // A network error or server crash carries no message a vendor can use.
        throw new Error(
          "Could not delete the booth. Refresh to check its status before retrying.",
        );
      }
      if (!result.success) {
        throw new Error(result.error);
      }
      toast.success("Booth deleted");
      router.replace("/dashboard/booths");
      await navigatingAway();
    });
  }

  return { deleting, onDelete };
}
