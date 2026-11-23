import type { OptionGroup } from "@/lib/types";

type WithGroups = { option_groups?: OptionGroup[] };

export type GroupResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const labelKey = (label: string) => label.trim().toLowerCase();

function withoutLink(group: OptionGroup): OptionGroup {
  const { shared_id: _dropped, ...rest } = group;
  return rest;
}

/** Items whose option_groups reuse a label (trimmed, case-insensitive); orders match groups by label. */
export function hasDuplicateGroupLabels(items: WithGroups[]): boolean {
  return items.some((it) => {
    const keys = (it.option_groups ?? []).map((g) => labelKey(g.label));
    return new Set(keys).size !== keys.length;
  });
}

/**
 * Refresh every inline copy that links to a library entry. An unknown
 * shared_id (entry removed elsewhere) drops the link but keeps the copy, so
 * a vendor's menu is never lost to a stale reference.
 */
export function expandLinkedGroups<T extends WithGroups>(
  items: T[],
  library: OptionGroup[],
): T[] {
  const byId = new Map(library.map((g) => [g.id, g]));
  return items.map((item) => {
    if (!item.option_groups?.some((g) => g.shared_id !== undefined))
      return item;
    const option_groups = item.option_groups.map((g) => {
      if (g.shared_id === undefined) return g;
      const entry = byId.get(g.shared_id);
      if (!entry) return withoutLink(g);
      return { ...entry, id: g.id, shared_id: entry.id };
    });
    return { ...item, option_groups };
  });
}

/** Attach a library entry to an item as a linked copy. Rejects a label the item already has. */
export function linkGroup<T extends WithGroups>(
  item: T,
  library: OptionGroup[],
  sharedId: string,
  newId: string,
): GroupResult<T> {
  const entry = library.find((g) => g.id === sharedId);
  if (!entry) return { ok: false, error: "Modifier group not found" };
  const groups = item.option_groups ?? [];
  if (groups.some((g) => labelKey(g.label) === labelKey(entry.label)))
    return {
      ok: false,
      error: `This item already has a "${entry.label}" group`,
    };
  return {
    ok: true,
    value: {
      ...item,
      option_groups: [...groups, { ...entry, id: newId, shared_id: entry.id }],
    },
  };
}

/** Detach one inline group from the library; the copy stays as an item-only group. */
export function unlinkGroup<T extends WithGroups>(item: T, groupId: string): T {
  if (!item.option_groups) return item;
  return {
    ...item,
    option_groups: item.option_groups.map((g) =>
      g.id === groupId ? withoutLink(g) : g,
    ),
  };
}

/** Number of items carrying at least one copy of the library entry. */
export function usageCount(items: WithGroups[], sharedId: string): number {
  return items.filter((it) =>
    it.option_groups?.some((g) => g.shared_id === sharedId),
  ).length;
}

/** Delete a library entry and unlink every copy; the copies stay on their items. */
export function removeLibraryGroup<T extends WithGroups>(
  library: OptionGroup[],
  items: T[],
  sharedId: string,
): { library: OptionGroup[]; items: T[] } {
  return {
    library: library.filter((g) => g.id !== sharedId),
    items: items.map((item) => {
      if (!item.option_groups?.some((g) => g.shared_id === sharedId))
        return item;
      return {
        ...item,
        option_groups: item.option_groups.map((g) =>
          g.shared_id === sharedId ? withoutLink(g) : g,
        ),
      };
    }),
  };
}

/** Copy an item-only group into the library and link the original to it. */
export function promoteToLibrary<T extends WithGroups>(
  library: OptionGroup[],
  item: T,
  groupId: string,
  newId: string,
): GroupResult<{ library: OptionGroup[]; item: T }> {
  const group = item.option_groups?.find((g) => g.id === groupId);
  if (!group || !item.option_groups)
    return { ok: false, error: "Group not found" };
  if (group.shared_id !== undefined)
    return { ok: false, error: "Group is already in the library" };
  if (library.some((g) => labelKey(g.label) === labelKey(group.label)))
    return {
      ok: false,
      error: `The library already has a "${group.label}" group`,
    };
  return {
    ok: true,
    value: {
      library: [...library, { ...group, id: newId }],
      item: {
        ...item,
        option_groups: item.option_groups.map((g) =>
          g.id === groupId ? { ...g, shared_id: newId } : g,
        ),
      },
    },
  };
}
