"use client";

import { useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ticket } from "@/components/widgets/ticket";
import { orderPath } from "@/lib/booth/code";
import { RegenerateButton } from "./regenerate-button";
import { EYEBROW_CLASS } from "@/lib/utils";

// Demo-recording only: shows the real production domain on the QR/share-link
// card instead of the local dev URL, so a screen recording doesn't put
// "localhost" on camera. window.location.origin can't be overridden from page
// JS (spec-[Unforgeable]), so this is a build-time env override instead — see
// scripts/demo/README.md. Never set outside a throwaway recording session.
const DEMO_ORIGIN_OVERRIDE = process.env.NEXT_PUBLIC_DEMO_ORIGIN_OVERRIDE;

interface Props {
  boothId: string;
  name: string;
  isActive: boolean;
  code: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      // eslint-disable-next-line sonarjs/super-linear-regex -- a single anchored quantifier ("-+$", no alternation/nested groups) has no real backtracking ambiguity to simplify further
      .replace(/-+$/, "") || "booth"
  );
}

export function BoothQrPoster({ boothId, name, isActive, code }: Props) {
  const router = useRouter();
  const qrRef = useRef<HTMLDivElement>(null);
  // origin is only known on the client. useSyncExternalStore returns the server
  // snapshot (null) during hydration, then the client snapshot — SSR-safe with
  // no hydration mismatch and no setState-in-effect.
  const origin = useSyncExternalStore(
    () => () => {},
    () => DEMO_ORIGIN_OVERRIDE || window.location.origin,
    () => null,
  );

  const url = origin ? `${origin}${orderPath(code)}` : null;

  function downloadPng() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;

    const size = 1024;
    const svgString = new XMLSerializer().serializeToString(svg);
    const svgUrl =
      "data:image/svg+xml;base64," +
      window.btoa(unescape(encodeURIComponent(svgString)));

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `${slugify(name)}-qr.png`;
        a.click();
        URL.revokeObjectURL(objectUrl);
      }, "image/png");
    };
    img.src = svgUrl;
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg"
          onClick={() => router.push("/dashboard/booths")}
        >
          <ArrowLeft className="size-4" /> Back to booths
        </Button>
      </div>

      <Ticket shadow="none" className="bg-card p-8 text-center">
        <p className={EYEBROW_CLASS}>Scan to order</p>
        <h1 className="font-display mt-2 text-3xl font-semibold leading-tight">
          {name}
        </h1>

        <div className="my-7 flex justify-center">
          <div
            ref={qrRef}
            className="rounded-xl border border-border bg-white p-4"
          >
            {url ? (
              <QRCode
                value={url}
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "256px" }}
              />
            ) : (
              <div className="size-64 animate-pulse rounded bg-muted" />
            )}
          </div>
        </div>

        {url && (
          <>
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Type this link:
            </p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
              {url}
            </p>
          </>
        )}

        {!isActive && (
          <p className="mt-5 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground print:hidden">
            This booth is paused, customers can&apos;t order yet. Resume it from
            the booth editor before printing.
          </p>
        )}
      </Ticket>

      <div className="mt-5 flex gap-3 print:hidden">
        <Button
          size="lg"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 flex-1 rounded-xl text-base font-semibold"
          onClick={downloadPng}
          disabled={!url}
        >
          <Download className="size-4" /> Download PNG
        </Button>
      </div>

      <div className="mt-3 print:hidden">
        <RegenerateButton boothId={boothId} boothName={name} />
      </div>
    </div>
  );
}
