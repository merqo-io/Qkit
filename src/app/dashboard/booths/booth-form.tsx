"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Store,
  Clock,
  UtensilsCrossed,
  Wallet,
  Share2,
  Printer,
  ScanLine,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { Button, Checkbox, Input, Label, Switch } from "@merqo/ui/primitives";

import { ImageUploader, resizeToWebp } from "@merqo/ui";
import { Section } from "@/components/widgets/ticket-section";
import { MediaImage } from "@/components/widgets/media-image";
import { uploadQkitImage } from "@/lib/image-upload-adapter";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { WorkingHoursEditor } from "./working-hours-editor";
import { PaymentSection } from "./payment-section";
import { PrintingSection } from "./printing-section";
import { SocialLinksSection } from "./social-links-section";
import { BookingStatusSection } from "./booking-status-section";
import { CloseBoothControl } from "./close-booth-control";
import { SettingRow } from "./setting-row";
import { BoothDangerZone } from "./booth-danger-zone";
import { BoothLimitsSection } from "./booth-limits-section";
import { useBoothDelete, useBoothSave } from "./use-booth-save";
import type { Entitlement } from "@/lib/plan";
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
    // Any saved item has a Sold-out limit, which Start new service resets.
    hasItemLimits?: boolean;
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
    initial?.daily_cup_cap !== null && initial?.daily_cup_cap !== undefined
      ? String(initial.daily_cup_cap)
      : "",
  );
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState(
    initial?.max_items_per_order !== null &&
      initial?.max_items_per_order !== undefined
      ? String(initial.max_items_per_order)
      : "",
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
  const { deleting, onDelete } = useBoothDelete(initial?.boothId);
  const { saving, onSubmit } = useBoothSave(initial?.boothId, {
    name,
    imageUrl,
    isActive,
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
  });

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

          <BoothLimitsSection
            entitlement={entitlement}
            dailyCupCap={dailyCupCap}
            onDailyCupCapChange={setDailyCupCap}
            maxItemsPerOrder={maxItemsPerOrder}
            onMaxItemsPerOrderChange={setMaxItemsPerOrder}
            boothId={initial?.boothId}
            boothName={initial?.name}
            savedDailyCupCap={initial?.daily_cup_cap}
            hasItemLimits={initial?.hasItemLimits}
          />
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
              available={entitlement.counterOps}
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
          <BoothDangerZone
            boothName={initial.name}
            deleting={deleting}
            saving={saving}
            onDelete={onDelete}
          />
          {saveCancelRow}
        </div>
      ) : (
        saveCancelRow
      )}
    </form>
  );
}
