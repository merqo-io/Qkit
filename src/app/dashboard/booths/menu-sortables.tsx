"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortableRenderProps = ReturnType<typeof useSortable> & {
  style: React.CSSProperties;
};

// useSortable can't be called directly inside items.map.
export function SortableItemCard({
  id,
  data,
  children,
}: {
  id: string;
  data: { type: "item"; groupId: string };
  children: (sortable: SortableRenderProps) => React.ReactNode;
}) {
  const sortable = useSortable({ id, data });
  return children({
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
  });
}

export function SortableSectionGroup({
  id,
  children,
}: {
  id: string;
  children: (sortable: SortableRenderProps) => React.ReactNode;
}) {
  const sortable = useSortable({ id, data: { type: "section" } });
  return children({
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
  });
}

// Makes an entire group (header + body, including its empty state) a valid
// drop target for reassigning an item into it — not just its individual
// item rows, which don't exist yet on an empty section.
export function GroupDropZone({
  id,
  groupId,
  children,
}: {
  id: string;
  groupId: string;
  children: (d: {
    setNodeRef: (el: HTMLElement | null) => void;
    isOver: boolean;
  }) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "section-drop", groupId },
  });
  return children({ setNodeRef, isOver });
}
