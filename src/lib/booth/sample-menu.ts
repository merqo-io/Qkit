import type { MenuItem } from "@/lib/types";

const SAMPLES = [
  {
    name: "Kopi",
    description: "Hot coffee with condensed milk.",
    price_cents: 180,
    image_url: "/seed/kopi.svg",
  },
  {
    name: "Teh",
    description: "Hot tea with condensed milk.",
    price_cents: 180,
    image_url: "/seed/teh.svg",
  },
  {
    name: "Milo",
    description: "Hot chocolate malt drink.",
    price_cents: 220,
    image_url: "/seed/milo.svg",
  },
] as const;

/**
 * The starter drinks a vendor can add in one tap. Ids are fresh on every
 * call so a booth never shares item ids with another booth's copy.
 */
export function sampleMenuItems(): MenuItem[] {
  return SAMPLES.map((sample) => ({
    id: crypto.randomUUID(),
    ...sample,
    available: true,
  }));
}
