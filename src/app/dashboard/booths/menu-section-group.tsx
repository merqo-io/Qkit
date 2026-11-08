"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MenuItemFormInput } from "@/lib/schemas";
import { NO_SECTION_GROUP } from "./menu-order";
import { GroupDropZone, SortableSectionGroup } from "./menu-sortables";

export interface MenuGroupEntry {
  it: MenuItemFormInput;
  i: number;
}

export type RenderMenuItem = (
  index: number,
  groupId: string,
  standalone: boolean,
) => ReactNode;

interface SectionProps {
  group: { id: string; label: string; entries: MenuGroupEntry[] };
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  renderItem: RenderMenuItem;
}

export function MenuSectionGroup({
  group,
  collapsed,
  onToggleCollapsed,
  onRename,
  onRemove,
  renderItem,
}: SectionProps) {
  return (
    <SortableSectionGroup key={group.id} id={group.id}>
      {({ setNodeRef, style, attributes, listeners, isDragging }) => (
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            "rounded-xl border border-border bg-card",
            isDragging && "opacity-40",
          )}
        >
          <GroupDropZone id={`dropzone-${group.id}`} groupId={group.id}>
            {({ setNodeRef: setDropRef, isOver }) => (
              <div
                ref={setDropRef}
                className={
                  isOver ? "rounded-xl ring-2 ring-primary" : undefined
                }
              >
                <div
                  className={
                    collapsed
                      ? "flex items-center gap-1.5 rounded-xl bg-primary/15 px-2 py-2"
                      : "flex items-center gap-1.5 rounded-t-xl border-b border-border bg-primary/15 px-2 py-2"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onToggleCollapsed()}
                    aria-label={
                      collapsed ? "Expand section" : "Collapse section"
                    }
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {collapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    aria-label="Reorder section"
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <Input
                    value={group.label}
                    onChange={(e) => onRename(e.target.value)}
                    placeholder="Section name"
                    aria-label="Section name"
                    className="h-8 flex-1 rounded-md border-transparent bg-transparent px-1.5 font-medium shadow-none hover:border-border focus-visible:border-border"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {group.entries.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove()}
                    aria-label="Remove section"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {!collapsed &&
                  (group.entries.length === 0 ? (
                    <p className="px-3.5 py-4 text-center text-xs text-muted-foreground">
                      No items yet. Add one below, or drag an item here to set
                      its section to {group.label || "this one"}.
                    </p>
                  ) : (
                    <SortableContext
                      items={group.entries.map(({ it }) => it.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="divide-y divide-border">
                        {group.entries.map(({ i }) =>
                          renderItem(i, group.id, false),
                        )}
                      </div>
                    </SortableContext>
                  ))}
              </div>
            )}
          </GroupDropZone>
        </div>
      )}
    </SortableSectionGroup>
  );
}

interface NoSectionProps {
  entries: MenuGroupEntry[];
  renderItem: RenderMenuItem;
}

export function MenuNoSectionGroup({ entries, renderItem }: NoSectionProps) {
  return (
    <GroupDropZone id="dropzone-no-section" groupId={NO_SECTION_GROUP}>
      {({ setNodeRef: setDropRef, isOver }) => (
        <div
          ref={setDropRef}
          className={
            isOver
              ? "mt-3 rounded-xl border border-border bg-card ring-2 ring-primary"
              : "mt-3 rounded-xl border border-border bg-card"
          }
        >
          <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-muted px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              No section
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {entries.length}
            </span>
          </div>
          {entries.length === 0 ? (
            <p className="px-3.5 py-4 text-center text-xs text-muted-foreground">
              Drag an item here to take it out of its section.
            </p>
          ) : (
            <SortableContext
              items={entries.map(({ it }) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-border">
                {entries.map(({ i }) => renderItem(i, NO_SECTION_GROUP, false))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </GroupDropZone>
  );
}
