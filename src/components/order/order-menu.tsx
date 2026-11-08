import { MediaImage } from "@/components/widgets/media-image";
import { groupByCategory } from "@/lib/menu-sections";
import type { MenuItem } from "@/lib/types";

interface Props {
  sections: ReturnType<typeof groupByCategory>;
  menuItems: MenuItem[];
  renderItemCard: (item: MenuItem) => React.ReactNode;
}

export function OrderMenu({ sections, menuItems, renderItemCard }: Props) {
  const grouped = sections.length > 1;
  return grouped ? (
    // On a phone the sections are a row of chips pinned above the menu,
    // so the items keep the full width; from md up they are a side rail.
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <nav
        aria-label="Menu sections"
        className="sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto bg-background px-5 py-2 text-sm md:top-4 md:mx-0 md:max-h-[calc(100dvh-2rem)] md:w-40 md:shrink-0 md:flex-col md:gap-1.5 md:self-start md:overflow-x-visible md:overflow-y-auto md:bg-transparent md:p-0"
      >
        {sections.map((s) => {
          const thumb = s.items.find((it) => it.image_url)?.image_url;
          return (
            <a
              key={s.id}
              href={`#section-${s.id}`}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 font-medium text-muted-foreground md:rounded-lg md:bg-transparent md:p-2"
            >
              {thumb && (
                <div className="relative hidden size-9 shrink-0 overflow-hidden rounded-md border border-border md:block">
                  <MediaImage
                    src={thumb}
                    alt=""
                    fill
                    sizes="3rem"
                    className="object-cover"
                  />
                </div>
              )}
              <span className="whitespace-nowrap md:line-clamp-1 md:whitespace-normal">
                {s.label}
              </span>
            </a>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 space-y-8">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`section-${s.id}`}
            className="scroll-mt-20 md:scroll-mt-4"
          >
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {s.label}
            </h2>
            <div className="space-y-2.5">{s.items.map(renderItemCard)}</div>
          </section>
        ))}
      </div>
    </div>
  ) : (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Menu
      </h2>
      <div className="space-y-2.5">{menuItems.map(renderItemCard)}</div>
    </section>
  );
}
