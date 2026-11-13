"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus, GripVertical } from "lucide-react";
import { EmptyState } from "@merqo/ui";
import { Button, Label } from "@merqo/ui/primitives";

import { ProLock } from "@/components/widgets/pro-lock";
import { MenuItemRow } from "./menu-item-row";
import { MenuNoSectionGroup, MenuSectionGroup } from "./menu-section-group";
import { useMenuMutations } from "./use-menu-mutations";
import {
  NO_SECTION_GROUP,
  reorderCategories,
  resolveItemDrop,
  type ItemDropTarget,
} from "./menu-order";
import { canAddMenuItem, type Entitlement } from "@/lib/plan";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory } from "@/lib/types";

const MAX_CATEGORIES = 40;

interface Props {
  vendorId: string;
  items: MenuItemFormInput[];
  onChange: (items: MenuItemFormInput[]) => void;
  entitlement: Entitlement;
  hasBoothLimit?: boolean;
  categories?: MenuCategory[];
  onCategoriesChange?: (categories: MenuCategory[]) => void;
}

export function MenuEditor({
  vendorId,
  items,
  onChange,
  entitlement,
  hasBoothLimit = false,
  categories = [],
  onCategoriesChange = () => {},
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Separate collapse state from "Customization" — allergens are a distinct
  // concept (fixed ingredients, not option groups), collapsed by default
  // since most items don't need them.
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  // Drives the DragOverlay preview. Without it, a cross-container drag
  // snaps the item back to its slot mid-drag — useSortable's own transform
  // only knows how to reposition within its own list, so it resets outside
  // one; the overlay is a free-floating clone that actually follows the
  // pointer, and the original row just dims in place while it's dragging.
  const [activeDrag, setActiveDrag] = useState<{
    label: string;
    kind: "item" | "section";
  } | null>(null);

  const atItemCap = !canAddMenuItem(entitlement, items.length);
  const atCategoryCap = categories.length >= MAX_CATEGORIES;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Grouped view (by section) once the vendor has sections. Drag reorders
  // within a group, reorders sections themselves, AND reassigns an item's
  // section (dropped on another group's item or its header/empty-state
  // drop zone) — the dropdown stays as the precise/keyboard-reachable path
  // for a menu too long to comfortably drag across.
  const sections = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const indexed = items.map((it, i) => ({ it, i }));
    const named = categories.map((c) => ({
      id: c.id,
      label: c.label,
      entries: indexed.filter(({ it }) => it.category === c.id),
    }));
    const restEntries = indexed.filter(
      ({ it }) => !it.category || !known.has(it.category),
    );
    return { named, restEntries };
  }, [items, categories]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type: "section" }
      | { type: "item"; groupId: string }
      | undefined;
    if (data?.type === "section") {
      const category = categories.find((c) => c.id === event.active.id);
      setActiveDrag({ kind: "section", label: category?.label || "Section" });
    } else if (data?.type === "item") {
      const item = items.find((it) => it.id === event.active.id);
      setActiveDrag({ kind: "item", label: item?.name || "Item" });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "section" }
      | { type: "item"; groupId: string }
      | undefined;
    if (activeData?.type === "section") {
      if (active.id === over.id) return;
      const reordered = reorderCategories(
        categories,
        String(active.id),
        String(over.id),
      );
      if (reordered !== categories) onCategoriesChange(reordered);
      return;
    }
    if (activeData?.type === "item") {
      const overData = over.data.current as ItemDropTarget | undefined;
      const reordered = resolveItemDrop(items, categories, {
        activeGroupId: activeData.groupId,
        activeId: String(active.id),
        overData,
        overId: String(over.id),
      });
      if (reordered !== items) onChange(reordered);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAdvanced(id: string) {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSectionCollapsed(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mutations = useMenuMutations({
    items,
    categories,
    entitlement,
    onChange,
    onCategoriesChange,
  });
  const { addItem, addCategory, renameCategory, removeCategory } = mutations;

  function renderItem(index: number, groupId: string, standalone: boolean) {
    const item = items[index];
    return (
      <MenuItemRow
        key={item.id}
        item={item}
        index={index}
        groupId={groupId}
        standalone={standalone}
        vendorId={vendorId}
        entitlement={entitlement}
        hasBoothLimit={hasBoothLimit}
        categories={categories}
        atItemCap={atItemCap}
        isOpen={expanded.has(item.id)}
        isAdvancedOpen={expandedAdvanced.has(item.id)}
        onToggleExpand={toggleExpand}
        onToggleAdvanced={toggleAdvanced}
        mutations={mutations}
      />
    );
  }

  const hasSections = categories.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Menu items
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={addCategory}
            disabled={atCategoryCap}
          >
            <Plus className="size-3.5" /> Add section
          </Button>
          {atItemCap ? (
            <ProLock
              feature="menu_items"
              label={`${entitlement.maxMenuItems}-item limit · Starter`}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={addItem}
            >
              <Plus className="size-3.5" /> Add item
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 && (
        <EmptyState
          size="compact"
          title="No items yet. Add one, price is optional (leave blank for a queue-only booth)."
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        {!hasSections && items.length > 0 && (
          <SortableContext
            items={items.map((it) => it.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((_, i) => renderItem(i, NO_SECTION_GROUP, true))}
            </div>
          </SortableContext>
        )}

        {hasSections && (
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {sections.named.map((group) => (
                <MenuSectionGroup
                  key={group.id}
                  group={group}
                  collapsed={collapsedSections.has(group.id)}
                  onToggleCollapsed={() => toggleSectionCollapsed(group.id)}
                  onRename={(label) => renameCategory(group.id, label)}
                  onRemove={() => removeCategory(group.id)}
                  renderItem={renderItem}
                />
              ))}
            </div>
          </SortableContext>
        )}

        {hasSections && (
          <MenuNoSectionGroup
            entries={sections.restEntries}
            renderItem={renderItem}
          />
        )}

        <DragOverlay>
          {activeDrag && (
            <div className="flex items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2 text-sm font-medium shadow-lg">
              <GripVertical className="size-4 text-muted-foreground" />
              {activeDrag.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Bottom add button — reachable without scrolling back up on long menus. */}
      {items.length > 0 &&
        (atItemCap ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground">
            <span>Reached your {entitlement.maxMenuItems}-item limit.</span>
            <ProLock feature="menu_items" label="Upgrade" />
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-lg"
            onClick={addItem}
          >
            <Plus className="size-3.5" /> Add item
          </Button>
        ))}
    </div>
  );
}
