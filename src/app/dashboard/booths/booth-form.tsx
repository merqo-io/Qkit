"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Trash2,
  Store,
  Clock,
  UtensilsCrossed,
  Wallet,
  Share2,
  Printer,
  ScanLine,
  ClipboardList,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  commitPendingImages,
  ImageUploader,
  PendingImageUploadError,
} from "@merqo/ui";
import { Section } from "@/components/widgets/ticket-section";
import { MediaImage } from "@/components/widgets/media-image";
import {
  removeUnsavedImages,
  uploadQkitImage,
} from "@/lib/image-upload-adapter";
import { resizeToWebp } from "@merqo/ui";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { PrintingSection } from "./printing-section";
import { SocialLinksSection } from "./social-links-section";
import { BookingStatusSection } from "./booking-status-section";
import { CloseBoothControl } from "./close-booth-control";
import { SettingRow } from "./setting-row";
import { saveBooth, deleteBooth } from "./actions";
import { boothFormSchema } from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import { ProLock } from "@/components/widgets/pro-lock";
import type { BoothHours } from "@/lib/hours";
import type { SocialLinks } from "@/lib/types";
import type { PaymentSetup } from "@/lib/paykit/payment-setup";
import type { BookingStatus } from "@/lib/paykit/client";

interface Props {
  vendorId: string;
  entitlement: Entitlement;
  vendorSocialLinks: SocialLinks;
  // Pre-checks (and lightly emphasizes) the walk-up-default toggle below for
  // the "Set up for an event" create flow (src/app/dashboard/booths/new/
  // page.tsx, ?mode=event) — never applies once `initial` is set, an
  // existing booth's own saved value always wins.
  eventMode?: boolean;
  // What the vendor has on file in paykit, read when the page rendered. It is
  // vendor-wide: the same for every booth, and for one not created yet.
  paymentSetup: PaymentSetup;
  initial?: {
    boothId: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    hours: BoothHours;
    // Display-only; items are edited on the dedicated menu-manager page.
    menuItemCount: number;
    // Whether this booth's stored marker says it takes payment.
    takes_payment: boolean;
    social_links: SocialLinks | null;
    requires_arrival_confirm: boolean;
    walkup_default: boolean;
    print_enabled: boolean;
    pickup_scan_enabled?: boolean;
    paykit_booking_id: string | null;
    daily_cup_cap: number | null;
    max_items_per_order?: number | null;
    // Fetched server-side (paykit's GET /api/v1/bookings/{id}) — see
    // BookingStatusSection's own doc comment for what null vs. undefined
    // mean here.
    bookingStatus?: BookingStatus | null;
  };
}

// A blank number field means "no limit", sent as null (the same convention as
// board_settings.default_prep_minutes in the dashboard settings form).
function limitOrNull(text: string): number | null {
  return text.trim() === "" ? null : Number(text.trim());
}

function LimitField({
  id,
  label,
  hint,
  hintLabel,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  hintLabel: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} hint={hint} hintLabel={hintLabel} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        placeholder="No limit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-28 rounded-lg"
      />
    </SettingRow>
  );
}

const DAILY_LIMIT_LABEL = "Daily item limit";
const DAILY_LIMIT_HINT_LABEL = "About the daily item limit";
const DAILY_LIMIT_HINT =
  "Ordering stops once the booth sells this many items in a day. Counts every item, so an order of four counts four. Leave blank for no limit. It starts again from zero at midnight, so a booth open the next day is not still sold out.";

// The daily limit on a plan without stock caps. With none set it is an
// upgrade prompt. With one already set (from a pass that has since ended) it
// keeps working, and the vendor can see it and take it off, but not change it.
function LockedDailyLimit({
  value,
  onRemove,
}: {
  value: string;
  onRemove: () => void;
}) {
  if (value === "")
    return (
      <SettingRow
        label={DAILY_LIMIT_LABEL}
        hint={DAILY_LIMIT_HINT}
        hintLabel={DAILY_LIMIT_HINT_LABEL}
      >
        <ProLock feature="stock_cap" label="Pro" />
      </SettingRow>
    );
  return (
    <SettingRow
      label={DAILY_LIMIT_LABEL}
      hint="It keeps working until you remove it. Changing it needs an Event pass or Pro."
      hintLabel={DAILY_LIMIT_HINT_LABEL}
    >
      <span className="text-sm text-muted-foreground">Set to {value}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg"
        onClick={onRemove}
      >
        Remove limit
      </Button>
    </SettingRow>
  );
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

export function BoothForm({
  vendorId,
  entitlement,
  vendorSocialLinks,
  eventMode = false,
  paymentSetup,
  initial,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.image_url ?? null,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [hours, setHours] = useState<BoothHours>(initial?.hours ?? null);
  const [takesPayment, setTakesPayment] = useState(
    initial?.takes_payment ?? false,
  );
  const [socialLinks, setSocialLinks] = useState<SocialLinks | null>(
    initial?.social_links ?? null,
  );
  const [requiresArrivalConfirm, setRequiresArrivalConfirm] = useState(
    initial?.requires_arrival_confirm ?? false,
  );
  const [walkupDefault, setWalkupDefault] = useState(
    initial?.walkup_default ?? eventMode,
  );
  const [printEnabled, setPrintEnabled] = useState(
    initial?.print_enabled ?? false,
  );
  const [pickupScanEnabled, setPickupScanEnabled] = useState(
    initial?.pickup_scan_enabled ?? false,
  );
  const [paykitBookingId, setPaykitBookingId] = useState<string | null>(
    initial?.paykit_booking_id ?? null,
  );
  // Both limits are kept as the raw text the vendor typed, so clearing a
  // field reads as "no limit" rather than 0. Converted at submit.
  const [dailyCupCap, setDailyCupCap] = useState(
    initial?.daily_cup_cap != null ? String(initial.daily_cup_cap) : "",
  );
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState(
    initial?.max_items_per_order != null
      ? String(initial.max_items_per_order)
      : "",
  );
  const { pending: saving, run: runSave } = useAsyncAction(
    "Could not save the booth. Refresh to check its status before retrying.",
  );
  // Everything "Save booth" would write, as text, against what the form
  // opened with. Open/paused is left out for a saved booth: its control saves
  // by itself the moment it is used.
  const snapshot = JSON.stringify([
    name,
    imageUrl,
    initial?.boothId ? null : isActive,
    hours,
    takesPayment,
    socialLinks,
    requiresArrivalConfirm,
    walkupDefault,
    printEnabled,
    pickupScanEnabled,
    paykitBookingId,
    dailyCupCap,
    maxItemsPerOrder,
  ]);
  const [openedWith] = useState(snapshot);
  const confirmLeave = useUnsavedChanges(snapshot !== openedWith);
  const { pending: deleting, run: runDelete } = useAsyncAction(
    "Could not delete the booth. Refresh to check its status before retrying.",
  );

  function onDelete() {
    if (!initial?.boothId) return;
    return runDelete(async () => {
      const result = await deleteBooth(initial.boothId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Booth deleted");
      router.replace("/dashboard/booths");
      await navigatingAway();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isCreate = !initial?.boothId;

    return runSave(async () => {
      // The banner uploader defers its upload, so a vendor who picks an
      // image and leaves without saving leaves nothing in storage.
      const committed = await commitImages([imageUrl]);
      if (!committed) return;
      const [committedBanner] = committed.urls;
      const candidate = {
        boothId: initial?.boothId,
        name,
        image_url: committedBanner ?? null,
        is_active: isActive,
        hours,
        takes_payment: takesPayment,
        social_links: socialLinks,
        requires_arrival_confirm: requiresArrivalConfirm,
        walkup_default: walkupDefault,
        print_enabled: printEnabled,
        pickup_scan_enabled: pickupScanEnabled,
        paykit_booking_id: paykitBookingId,
        daily_cup_cap: limitOrNull(dailyCupCap),
        max_items_per_order: limitOrNull(maxItemsPerOrder),
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

  const saveCancelRow = (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6">
      <Button
        type="submit"
        size="lg"
        className="h-12 flex-1 rounded-xl text-base font-semibold"
        disabled={saving}
      >
        {saving ? "Saving…" : "Save booth"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 rounded-xl"
        onClick={() => {
          if (confirmLeave()) router.push("/dashboard/booths");
        }}
      >
        Cancel
      </Button>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Natural-height columns; gap-x only since Section already has mb-5. */}
      <div className="grid grid-cols-1 gap-x-5 md:grid-cols-2 md:items-start">
        <div>
          <Section
            icon={<Store className="size-5" />}
            eyebrow="Shown to customers"
            title="Name & photo"
            description="Your booth's name and banner image."
          >
            <div className="space-y-2.5">
              <Label
                htmlFor="booth-name"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Booth name
              </Label>
              <Input
                id="booth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mama's Kitchen"
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div
              role="group"
              aria-labelledby="booth-banner-label"
              className="space-y-2.5"
            >
              <p
                id="booth-banner-label"
                className="text-xs leading-none font-semibold tracking-wider text-muted-foreground uppercase"
              >
                Banner
              </p>
              <ImageUploader
                bucket="booth-images"
                pathPrefix={vendorId}
                value={imageUrl}
                onChange={setImageUrl}
                onUpload={uploadQkitImage}
                resizeImage={resizeToWebp}
                imageComponent={MediaImage}
                variant="banner"
                deferUpload
              />
            </div>
          </Section>

          <Section
            icon={<Clock className="size-5" />}
            eyebrow="When you're open"
            title="Hours & availability"
            description="Open or pause ordering and set your hours."
          >
            {initial?.boothId ? (
              <CloseBoothControl
                boothId={initial.boothId}
                boothName={name || initial.name}
                isActive={isActive}
                onChanged={setIsActive}
              />
            ) : (
              <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">Open for orders</span>
                  <span className="block text-muted-foreground">
                    Customers can only order while the booth is open.
                  </span>
                </span>
              </label>
            )}

            <WorkingHoursEditor
              value={hours}
              onChange={setHours}
              entitlement={entitlement}
            />
          </Section>

          <Section
            icon={<ClipboardList className="size-5" />}
            eyebrow="How orders come in"
            title="Order flow"
            description="Arrival timing and walk-up entry."
          >
            <SettingRow
              label="Hold prep until arrival"
              hint="For items made fresh per order, like ice cream. The order waits until the customer taps “I'm here” on their status page."
              hintLabel="About holding prep until arrival"
            >
              <Switch
                checked={requiresArrivalConfirm}
                onCheckedChange={setRequiresArrivalConfirm}
                aria-label="Hold prep until arrival"
              />
            </SettingRow>

            <SettingRow
              label="Walk-up entry by default"
              hint="Staff enter every order directly. For a one-off event where guests don't scan a QR to order themselves."
              hintLabel="About walk-up entry"
              badge={
                eventMode && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                    Recommended
                  </span>
                )
              }
            >
              <Switch
                checked={walkupDefault}
                onCheckedChange={setWalkupDefault}
                aria-label="Walk-up entry by default"
              />
            </SettingRow>

            {walkupDefault && (
              <BookingStatusSection
                value={paykitBookingId}
                onChange={setPaykitBookingId}
                status={initial?.bookingStatus}
              />
            )}
          </Section>

          <Section
            icon={<Gauge className="size-5" />}
            eyebrow="How much you take"
            title="Limits"
            description="Cap what one day or one order can take."
          >
            {entitlement.stockCaps ? (
              <LimitField
                id="daily-cup-cap"
                label={DAILY_LIMIT_LABEL}
                hint={DAILY_LIMIT_HINT}
                hintLabel={DAILY_LIMIT_HINT_LABEL}
                max={100000}
                value={dailyCupCap}
                onChange={setDailyCupCap}
              />
            ) : (
              <LockedDailyLimit
                value={dailyCupCap}
                onRemove={() => setDailyCupCap("")}
              />
            )}

            <LimitField
              id="max-items-per-order"
              label="Max items per order"
              hint="Stops one customer taking the whole tray. Orders you key in yourself are not limited. Leave blank for no limit."
              hintLabel="About the per-order item limit"
              max={100}
              value={maxItemsPerOrder}
              onChange={setMaxItemsPerOrder}
            />
          </Section>
        </div>

        <div>
          <Section
            icon={<UtensilsCrossed className="size-5" />}
            eyebrow="What you sell"
            title="Menu"
            description="Add items customers can order."
          >
            {initial?.boothId ? (
              <Link
                href={`/dashboard/booths/${initial.boothId}/menu`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm hover:border-primary/40"
              >
                <span>
                  <span className="font-medium">
                    {initial.menuItemCount === 1
                      ? "1 item"
                      : `${initial.menuItemCount} items`}
                  </span>
                  <span className="block text-muted-foreground">
                    Add, edit, reorder, or bulk-import via CSV.
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Save this booth to start building its menu.
              </p>
            )}
          </Section>

          <Section
            icon={<Wallet className="size-5" />}
            eyebrow="How you get paid"
            title="Payment"
            description="Optional, but skip it and customers have no way to pay through qkit. You'd collect payment in person instead."
          >
            <PaymentSection
              setup={paymentSetup}
              value={takesPayment}
              onChange={setTakesPayment}
            />
          </Section>

          <Section
            icon={<Printer className="size-5" />}
            eyebrow="At your counter"
            title="Printing"
            description="Optional. Auto-printed order labels."
          >
            <PrintingSection
              value={printEnabled}
              onChange={setPrintEnabled}
              boothId={initial?.boothId}
              savedEnabled={initial?.print_enabled ?? false}
            />
          </Section>

          <Section
            icon={<ScanLine className="size-5" />}
            eyebrow="At your counter"
            title="Pickup"
            description="Optional. A kiosk where customers mark their own pickup."
          >
            <SettingRow
              label="Self-checkout pickup"
              hint="A ready order's status page shows a QR. The customer scans it at this booth's pickup kiosk and the order is marked picked up, without staff tapping it."
              hintLabel="About self-checkout pickup"
            >
              <Switch
                checked={pickupScanEnabled}
                onCheckedChange={setPickupScanEnabled}
                aria-label="Self-checkout pickup"
              />
            </SettingRow>
          </Section>

          <Section
            icon={<Share2 className="size-5" />}
            eyebrow="Shown to customers"
            title="Social links"
            description="Shown on the order-status page after a customer orders."
          >
            <SocialLinksSection
              value={socialLinks}
              onChange={setSocialLinks}
              vendorDefaults={vendorSocialLinks}
            />
          </Section>
        </div>
      </div>

      {initial?.boothId ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Danger zone
            </p>
            <p className="text-sm text-muted-foreground">
              Deleting this booth permanently removes it and every order placed
              at it. The data can&apos;t be retrieved.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                  disabled={deleting || saving}
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Deleting…" : "Delete booth"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{initial.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the booth and every order placed at
                    it. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    Keep booth
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={deleting}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete booth
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {saveCancelRow}
        </div>
      ) : (
        saveCancelRow
      )}
    </form>
  );
}
