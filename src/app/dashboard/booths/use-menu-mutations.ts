"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { canAddMenuItem, type Entitlement } from "@/lib/plan";
import type { ALLERGEN_TAGS, MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory } from "@/lib/types";

const REMOVE_UNDO_MS = 60_000;

interface Args {
  items: MenuItemFormInput[];
  categories: MenuCategory[];
  entitlement: Entitlement;
  onChange: (items: MenuItemFormInput[]) => void;
  onCategoriesChange: (categories: MenuCategory[]) => void;
}

function useCategoryMutations(
  categories: MenuCategory[],
  onCategoriesChange: (categories: MenuCategory[]) => void,
) {
  const categoriesRef = useRef(categories);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  function addCategory() {
    onCategoriesChange([...categories, { id: crypto.randomUUID(), label: "" }]);
  }

  function renameCategory(id: string, label: string) {
    onCategoriesChange(
      categories.map((c) => (c.id === id ? { ...c, label } : c)),
    );
  }

  // No cascade-clear on delete — a dangling `category` id on an item just
  // buckets into "No section" here (and "Other" on the customer page).
  function removeCategory(id: string) {
    const index = categories.findIndex((c) => c.id === id);
    if (index === -1) return;
    const removed = categories[index]!;
    onCategoriesChange(categories.filter((c) => c.id !== id));
    toast(`${removed.label || "Section"} removed`, {
      duration: REMOVE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const current = categoriesRef.current;
          const at = Math.min(index, current.length);
          onCategoriesChange([
            ...current.slice(0, at),
            removed,
            ...current.slice(at),
          ]);
        },
      },
    });
  }

  return { addCategory, renameCategory, removeCategory };
}

export function useMenuMutations({
  items,
  categories,
  entitlement,
  onChange,
  onCategoriesChange,
}: Args) {
  // Undo needs the latest array at click time, not the one closed over when
  // the toast was created — a stale closure would clobber any edit made in
  // between.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function toggleItemAllergen(index: number, tag: string, checked: boolean) {
    const item = items[index];
    const current = item.allergens ?? [];
    const next = checked
      ? [...current, tag as (typeof ALLERGEN_TAGS)[number]]
      : current.filter((a) => a !== tag);
    update(index, { allergens: next.length ? next : undefined });
  }

  function update(index: number, patch: Partial<MenuItemFormInput>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function setMoney(
    index: number,
    field: "price_cents" | "cost_cents",
    cents: number | undefined,
  ) {
    update(index, { [field]: cents });
  }

  function setPrice(index: number, cents: number | undefined) {
    setMoney(index, "price_cents", cents);
  }

  function setCost(index: number, cents: number | undefined) {
    setMoney(index, "cost_cents", cents);
  }

  function setStock(index: number, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      update(index, { stock: null });
      return;
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 0) return;
    update(index, { stock: value });
  }

  function addItem() {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        price_cents: undefined,
        image_url: null,
        available: true,
      },
    ]);
  }

  function removeItem(index: number) {
    const removed = items[index];
    onChange(items.filter((_, i) => i !== index));
    toast(`${removed.name || "Item"} removed`, {
      duration: REMOVE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const current = itemsRef.current;
          const at = Math.min(index, current.length);
          onChange([...current.slice(0, at), removed, ...current.slice(at)]);
        },
      },
    });
  }

  // Deep-cloned (structuredClone) so editing the copy's nested option groups
  // never mutates the original — qkit has no shared/live-linked modifier
  // groups yet, so a duplicate is always a fully independent starting point,
  // never a reference.
  function duplicateItem(index: number) {
    if (!canAddMenuItem(entitlement, items.length)) return;
    const source = items[index];
    const copy: MenuItemFormInput = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name: source.name ? `${source.name} (copy)` : "",
    };
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
  }

  const categoryMutations = useCategoryMutations(
    categories,
    onCategoriesChange,
  );

  return {
    update,
    toggleItemAllergen,
    setPrice,
    setCost,
    setStock,
    addItem,
    removeItem,
    duplicateItem,
    ...categoryMutations,
  };
}

export type MenuMutations = ReturnType<typeof useMenuMutations>;
