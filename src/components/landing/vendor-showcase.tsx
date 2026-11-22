import { CONTAINER } from "@/components/landing/rhythm";
import {
  SHOWCASE_VENDORS,
  type ShowcaseVendor,
} from "@/components/landing/showcase-vendors";

export const SHOWCASE_LAYOUT = { marqueeMin: 4, gridMin: 12 } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

function Logo({ vendor, size }: { vendor: ShowcaseVendor; size: 32 | 40 }) {
  const box = size === 40 ? "size-10" : "size-8";
  if (vendor.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- profile pictures come from arbitrary hosts, so next/image cannot optimise them
      <img
        src={vendor.logoUrl}
        alt={vendor.name}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${box} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground`}
    >
      {initials(vendor.name)}
    </span>
  );
}

function Chip({ vendor }: { vendor: ShowcaseVendor }) {
  return (
    <li
      data-vendor-chip
      className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pr-4 pl-1.5"
    >
      <Logo vendor={vendor} size={32} />
      <span className="font-display text-sm font-semibold whitespace-nowrap">
        {vendor.name}
      </span>
    </li>
  );
}

function GridCard({ vendor }: { vendor: ShowcaseVendor }) {
  return (
    <li
      data-vendor-card
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 text-center"
    >
      <Logo vendor={vendor} size={40} />
      <span className="font-display text-sm font-semibold break-words">
        {vendor.name}
      </span>
      {vendor.kind ? (
        <span className="text-xs text-muted-foreground">{vendor.kind}</span>
      ) : null}
    </li>
  );
}

const MARQUEE_LIST =
  "flex min-w-full shrink-0 items-center justify-around gap-3 pr-3 motion-reduce:min-w-0 motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:pr-0";

function layoutFor(count: number): "row" | "marquee" | "grid" {
  if (count >= SHOWCASE_LAYOUT.gridMin) return "grid";
  if (count >= SHOWCASE_LAYOUT.marqueeMin) return "marquee";
  return "row";
}

export function VendorShowcase({
  vendors = SHOWCASE_VENDORS,
}: {
  vendors?: readonly ShowcaseVendor[];
}) {
  if (vendors.length === 0) return null;
  const mode = layoutFor(vendors.length);

  return (
    <section
      aria-labelledby="vendor-showcase-heading"
      data-layout={mode}
      className="overflow-hidden border-t border-border py-10 md:py-12"
    >
      <div className={CONTAINER}>
        <h2
          id="vendor-showcase-heading"
          className="font-display text-center text-[clamp(20px,2.4vw,26px)] font-semibold tracking-[-0.01em]"
        >
          Vendors on qkit
        </h2>
        {mode === "row" ? (
          <ul className="mt-6 flex flex-wrap justify-center gap-3">
            {vendors.map((vendor) => (
              <Chip key={vendor.name} vendor={vendor} />
            ))}
          </ul>
        ) : null}
        {mode === "grid" ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {vendors.map((vendor) => (
              <GridCard key={vendor.name} vendor={vendor} />
            ))}
          </ul>
        ) : null}
      </div>
      {mode === "marquee" ? (
        <div className="mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:px-5 motion-reduce:[mask-image:none]">
          <div
            data-marquee-track
            className="flex w-max animate-[vendor-marquee_40s_linear_infinite] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none"
          >
            <ul className={MARQUEE_LIST}>
              {vendors.map((vendor) => (
                <Chip key={vendor.name} vendor={vendor} />
              ))}
            </ul>
            <ul
              aria-hidden="true"
              data-marquee-duplicate
              className={`${MARQUEE_LIST} motion-reduce:hidden`}
            >
              {vendors.map((vendor) => (
                <Chip key={vendor.name} vendor={vendor} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
