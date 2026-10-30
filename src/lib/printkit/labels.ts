import { z } from "zod";

export const MAX_ORDER_LABELS = 100;
const itemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(160),
      quantity: z.number().int().min(1).max(MAX_ORDER_LABELS),
      options: z
        .array(z.object({ group: z.string(), choice: z.string() }))
        .optional(),
    }),
  )
  .max(MAX_ORDER_LABELS);

/** Every stored item unit is labelable; the order snapshot has no drink flag. */
export function orderLabels(
  items: unknown,
): { item_name: string; item_options?: string }[] | null {
  const parsed = itemsSchema.safeParse(items);
  if (!parsed.success) return null;
  if (
    parsed.data.reduce((sum, item) => sum + item.quantity, 0) > MAX_ORDER_LABELS
  )
    return null;
  const prepared = parsed.data.map((item) => {
    const options = item.options
      ?.map((option) => `${option.group}: ${option.choice}`)
      .join(", ");
    return { item, options };
  });
  if (prepared.some(({ options }) => options && options.length > 240))
    return null;
  return prepared.flatMap(({ item, options }) => {
    return Array.from({ length: item.quantity }, () => ({
      item_name: item.name,
      ...(options ? { item_options: options } : {}),
    }));
  });
}
