import { arrayMove } from "@dnd-kit/sortable";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory } from "@/lib/types";

// groupId tag for items with no (or a dangling) section — never a real
// category id, those are crypto.randomUUID().
export const NO_SECTION_GROUP = "__no_section__";

/** Same array instance back when there's nothing to reorder. */
export function reorderMenuItems(
  items: MenuItemFormInput[],
  activeId: string,
  overId: string,
): MenuItemFormInput[] {
  if (activeId === overId) return items;
  const oldIndex = items.findIndex((it) => it.id === activeId);
  const newIndex = items.findIndex((it) => it.id === overId);
  if (oldIndex === -1 || newIndex === -1) return items;
  return arrayMove(items, oldIndex, newIndex);
}

/**
 * Reassigns one item to a different section (or `null` for "no section")
 * and moves it to sit right after that section's current last item — same
 * array instance back if the item is already there with nothing to move.
 */
export function moveItemToGroup(
  items: MenuItemFormInput[],
  categories: MenuCategory[],
  activeId: string,
  targetCategory: string | null,
): MenuItemFormInput[] {
  const activeIndex = items.findIndex((it) => it.id === activeId);
  if (activeIndex === -1) return items;
  const active = items[activeIndex]!;
  if ((active.category ?? null) === targetCategory) return items;

  const known = new Set(categories.map((c) => c.id));
  const inTargetGroup = (it: MenuItemFormInput) =>
    targetCategory === null || targetCategory === undefined
      ? !it.category || !known.has(it.category)
      : it.category === targetCategory;

  const without = items.filter((it) => it.id !== activeId);
  let insertAt = without.length;
  for (let i = without.length - 1; i >= 0; i--) {
    if (inTargetGroup(without[i]!)) {
      insertAt = i + 1;
      break;
    }
  }
  const patched = { ...active, category: targetCategory };
  return [...without.slice(0, insertAt), patched, ...without.slice(insertAt)];
}

export type ItemDropTarget =
  | { type: "item"; groupId: string }
  | { type: "section-drop"; groupId: string };

/**
 * Routes one item drag-end to reorder-within-group, cross-group reassign
 * (dropped on another item), or cross-group reassign-to-end (dropped on a
 * group's drop zone) — same array instance back when `overData` is missing.
 */
export function resolveItemDrop(
  items: MenuItemFormInput[],
  categories: MenuCategory[],
  {
    activeGroupId,
    activeId,
    overData,
    overId,
  }: {
    activeGroupId: string;
    activeId: string;
    overData: ItemDropTarget | undefined;
    overId: string;
  },
): MenuItemFormInput[] {
  if (!overData) return items;
  const targetCategory =
    overData.groupId === NO_SECTION_GROUP ? null : overData.groupId;
  if (overData.type === "section-drop") {
    return moveItemToGroup(items, categories, activeId, targetCategory);
  }
  if (activeGroupId === overData.groupId) {
    return reorderMenuItems(items, activeId, overId);
  }
  const patched = items.map((it) =>
    it.id === activeId ? { ...it, category: targetCategory } : it,
  );
  return reorderMenuItems(patched, activeId, overId);
}

/** Same array instance back when there's nothing to reorder. */
export function reorderCategories(
  categories: MenuCategory[],
  activeId: string,
  overId: string,
): MenuCategory[] {
  if (activeId === overId) return categories;
  const oldIndex = categories.findIndex((c) => c.id === activeId);
  const newIndex = categories.findIndex((c) => c.id === overId);
  if (oldIndex === -1 || newIndex === -1) return categories;
  return arrayMove(categories, oldIndex, newIndex);
}
