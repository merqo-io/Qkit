"use client";

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

export function useBoothSave(
  boothId: string | undefined,
  values: BoothFormValues,
) {
  const router = useRouter();
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
      router.replace(
        isCreate
          ? `/dashboard/booths/${result.boothId}/menu?new=1`
          : "/dashboard/booths",
      );
      await navigatingAway();
    });
  }

  return { saving, onSubmit };
}

export function useBoothDelete(boothId: string | undefined) {
  const router = useRouter();
  const { pending: deleting, run: runDelete } = useAsyncAction(
    "Could not delete the booth. Refresh to check its status before retrying.",
  );

  function onDelete() {
    if (!boothId) return;
    return runDelete(async () => {
      const result = await deleteBooth(boothId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Booth deleted");
      router.replace("/dashboard/booths");
      await navigatingAway();
    });
  }

  return { deleting, onDelete };
}
