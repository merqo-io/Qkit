"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageUploader, InfoTooltip } from "@merqo/ui";
import { MediaImage } from "@/components/widgets/media-image";
import { uploadQkitImage } from "@/lib/image-upload-adapter";
import { resizeToWebp } from "@merqo/ui";
import { cn, FORM_LABEL_CLASS } from "@/lib/utils";
import { SEGMENT_GROUP_CLASS } from "@/components/widgets/segmented-control";
import type { PaymentConfig } from "@/lib/types";

type Kind = "none" | "pointer" | "paynow";
type PointerMode = "link" | "qr";
type PaynowProxyMode = "uen" | "mobile";

// Mirrors src/lib/paykit/client.ts's fallback — duplicated since this is a
// client component reading NEXT_PUBLIC_* directly.
const PAYKIT_URL =
  process.env.NEXT_PUBLIC_PAYKIT_URL ?? "https://paykit-sg.vercel.app";

function kindOf(v: PaymentConfig | null): Kind {
  if (!v) return "none";
  // 'stripe' is reserved-but-dark — surface it as "none" in the editor.
  return v.kind === "stripe" ? "none" : v.kind;
}

// Just the label at a glance; the full explanation lives behind an (i)
// InfoTooltip (from @merqo/ui, opened by a tap: hover does nothing on the
// iPads and phones this form is filled in on) instead of a permanently-shown
// paragraph — matches every other "one more sentence" spot in the app
// (settings-form.tsx's threshold fields) instead of this being the one place
// with a wall of always-visible helper text.
const OPTIONS: { k: Kind; label: string; detail: string }[] = [
  {
    k: "none",
    label: "No online payment",
    detail: "Customers just join the queue and settle up at the counter.",
  },
  {
    k: "paynow",
    label: "PayNow QR",
    detail: "We generate a QR with the order amount already filled in.",
  },
  {
    k: "pointer",
    label: "Payment link or QR image",
    detail:
      "Qashier, HitPay, GrabPay for Business, Stripe Payment Links, or your bank's own QR: any of them work here.",
  },
];

// A pill of the two sub-mode switches below. They look like a
// SegmentedControl but are radio inputs inside a form, so they stay a
// ToggleGroup and only borrow the track.
const SEGMENT_RADIO_CLASS =
  "rounded-md px-3 py-1 font-medium text-muted-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary";

export function PaymentSection({
  vendorId,
  value,
  saved = null,
  onChange,
}: {
  vendorId: string;
  value: PaymentConfig | null;
  // Details the vendor already has on file. Picking that method starts from
  // them, so a booth switched to "No online payment" and back, or a booth
  // that never took payment, does not make the vendor retype a UEN.
  saved?: PaymentConfig | null;
  onChange: (next: PaymentConfig | null) => void;
}) {
  const kind = kindOf(value);
  const paynow = value?.kind === "paynow" ? value : null;
  const pointer = value?.kind === "pointer" ? value : null;

  // Which pointer field is live. A vendor can only ever use one at a time
  // (paykit's renderCheckout adapter picks url over qr_image_url when both
  // happen to be set), so the editor shows exactly one instead of both plus
  // a footnote about which one wins.
  const [pointerMode, setPointerMode] = useState<PointerMode>(() =>
    pointer?.qr_image_url && !pointer?.url ? "qr" : "link",
  );

  // Which PayNow proxy field is live — an explicit mode instead of inferring
  // UEN-vs-mobile from whether typed text happens to start with "+": that
  // heuristic let a vendor typing a bare local mobile number ("91234567",
  // no "+65") get silently filed under uen, where it passed as a
  // plausible-looking 8-char alphanumeric "UEN" and produced a PayNow QR
  // real banking apps rejected as invalid. The mobile field below only ever
  // takes the 8 local digits; the "+65" is a fixed, non-editable prefix
  // (PayNow is Singapore-only — there's no other country code to choose).
  const [proxyMode, setProxyMode] = useState<PaynowProxyMode>(() =>
    paynow?.mobile ? "mobile" : "uen",
  );

  function pickProxyMode(next: PaynowProxyMode) {
    setProxyMode(next);
    // Clear the field for the mode being left, same as pointer's url/
    // qr_image_url handling — never carry stale uen + mobile at once.
    onChange({
      kind: "paynow",
      payee_name: paynow?.payee_name ?? "",
      uen: next === "uen" ? paynow?.uen : undefined,
      mobile: next === "mobile" ? paynow?.mobile : undefined,
    });
  }

  function pick(next: Kind) {
    if (next === "none") onChange(null);
    else if (next === "paynow") {
      const onFile = saved?.kind === "paynow" ? saved : null;
      setProxyMode(onFile?.mobile ? "mobile" : "uen");
      onChange(onFile ?? { kind: "paynow", payee_name: "", uen: "" });
    } else {
      const onFile = saved?.kind === "pointer" ? saved : null;
      setPointerMode(onFile?.qr_image_url && !onFile.url ? "qr" : "link");
      onChange(onFile ?? { kind: "pointer", label: "", url: "" });
    }
  }

  function pickPointerMode(next: PointerMode) {
    setPointerMode(next);
    // Clear the field for the mode being left, so the data never carries
    // stale url + qr_image_url at once.
    onChange({
      kind: "pointer",
      label: pointer?.label ?? "",
      url: next === "link" ? pointer?.url : undefined,
      qr_image_url: next === "qr" ? pointer?.qr_image_url : undefined,
    });
  }

  return (
    <div className="space-y-4">
      {/* Radio cards: a small, comparable set, so show every option at once
          (a dropdown would hide them and add a click). */}
      <RadioGroup
        value={kind}
        onValueChange={(v) => pick(v as Kind)}
        className="gap-2.5"
      >
        {OPTIONS.map(({ k, label, detail }) => {
          const selected = kind === k;
          return (
            <div
              key={k}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {/* Only the radio + label are inside the <label> (native
                  click-to-select) — the info button sits outside it, as a
                  plain sibling, so tapping it opens the tooltip instead of
                  also toggling the radio underneath it. */}
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <RadioGroupItem value={k} aria-label={label} />
                <span className="truncate text-sm font-medium">{label}</span>
              </label>
              <InfoTooltip
                content={detail}
                ariaLabel={`More about ${label}`}
                trigger="tap"
              />
            </div>
          );
        })}
      </RadioGroup>

      {kind === "paynow" && (
        <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
          <div className="space-y-2">
            <Label htmlFor="pn-name" className={FORM_LABEL_CLASS}>
              Payee name
            </Label>
            <Input
              id="pn-name"
              value={paynow?.payee_name ?? ""}
              placeholder="Kopitiam Cart"
              className="h-12 rounded-xl"
              onChange={(e) =>
                onChange({
                  kind: "paynow",
                  payee_name: e.target.value,
                  uen: paynow?.uen,
                  mobile: paynow?.mobile,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <ToggleGroup
              type="single"
              value={proxyMode}
              onValueChange={(v) => v && pickProxyMode(v as PaynowProxyMode)}
              aria-label="UEN or mobile number"
              className={cn(SEGMENT_GROUP_CLASS, "text-sm")}
            >
              {(
                [
                  { m: "uen", label: "UEN" },
                  { m: "mobile", label: "Mobile number" },
                ] as const
              ).map(({ m, label }) => (
                <ToggleGroupItem
                  key={m}
                  value={m}
                  className={SEGMENT_RADIO_CLASS}
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {proxyMode === "uen" ? (
              <div className="space-y-1.5">
                <Label htmlFor="pn-uen" className="sr-only">
                  UEN
                </Label>
                <Input
                  id="pn-uen"
                  value={paynow?.uen ?? ""}
                  placeholder="53312345A"
                  className="h-12 rounded-xl"
                  onChange={(e) =>
                    onChange({
                      kind: "paynow",
                      payee_name: paynow?.payee_name ?? "",
                      uen: e.target.value || undefined,
                      mobile: undefined,
                    })
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pn-mobile" className="sr-only">
                  Mobile number
                </Label>
                <InputGroup className="h-12 rounded-xl">
                  <InputGroupAddon>
                    <InputGroupText>+65</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="pn-mobile"
                    inputMode="numeric"
                    placeholder="91234567"
                    // Show/accept only the local 8 digits — "+65" is fixed,
                    // not something a vendor can mistype or omit here.
                    value={(paynow?.mobile ?? "").replace(/^\+65/, "")}
                    onChange={(e) => {
                      const digits = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 8);
                      onChange({
                        kind: "paynow",
                        payee_name: paynow?.payee_name ?? "",
                        uen: undefined,
                        mobile: digits ? `+65${digits}` : undefined,
                      });
                    }}
                  />
                </InputGroup>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              PayNow is Singapore-only, so mobile numbers always use +65.
              Customers scan a QR with the order total already filled in.
            </p>
          </div>
        </div>
      )}

      {kind === "pointer" && (
        <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
          <ToggleGroup
            type="single"
            value={pointerMode}
            onValueChange={(v) => v && pickPointerMode(v as PointerMode)}
            aria-label="Payment link or QR image"
            className={cn(SEGMENT_GROUP_CLASS, "text-sm")}
          >
            {(
              [
                { m: "link", label: "Payment link" },
                { m: "qr", label: "QR image" },
              ] as const
            ).map(({ m, label }) => (
              <ToggleGroupItem
                key={m}
                value={m}
                className={SEGMENT_RADIO_CLASS}
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {pointerMode === "link" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="pt-label" className={FORM_LABEL_CLASS}>
                  Button label
                </Label>
                <Input
                  id="pt-label"
                  value={pointer?.label ?? ""}
                  placeholder="Pay with PayLah"
                  className="h-12 rounded-xl"
                  onChange={(e) =>
                    onChange({
                      kind: "pointer",
                      label: e.target.value,
                      url: pointer?.url,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-url" className={FORM_LABEL_CLASS}>
                  Payment link
                </Label>
                <Input
                  id="pt-url"
                  value={pointer?.url ?? ""}
                  placeholder="https://…"
                  className="h-12 rounded-xl"
                  onChange={(e) =>
                    onChange({
                      kind: "pointer",
                      label: pointer?.label ?? "",
                      url: e.target.value || undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Any https link: a Qashier/HitPay/GrabPay checkout, your
                  bank&apos;s payment page, or a Stripe Payment Link.
                </p>
              </div>
            </>
          ) : (
            <div
              role="group"
              aria-labelledby="payment-qr-image-label"
              className="space-y-2"
            >
              <p
                id="payment-qr-image-label"
                className={`${FORM_LABEL_CLASS} leading-none`}
              >
                QR image
              </p>
              <ImageUploader
                bucket="booth-images"
                pathPrefix={vendorId}
                variant="thumb"
                value={pointer?.qr_image_url ?? null}
                onChange={(url) =>
                  onChange({
                    kind: "pointer",
                    label: pointer?.label ?? "",
                    qr_image_url: url ?? undefined,
                  })
                }
                onUpload={uploadQkitImage}
                resizeImage={resizeToWebp}
                imageComponent={MediaImage}
                deferUpload
              />
              <p className="text-xs text-muted-foreground">
                A static QR you already have: your GrabPay, PayLah, or bank QR
                code, photographed or screenshotted.
              </p>
            </div>
          )}
        </div>
      )}

      <a
        href={`${PAYKIT_URL}/dashboard`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Manage payments, transactions &amp; refunds in paykit ↗
      </a>
    </div>
  );
}
