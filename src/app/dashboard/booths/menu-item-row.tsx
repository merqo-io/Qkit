"use client";

import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Copy,
  GripVertical,
  Eye,
  EyeOff,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ImageUploader, resizeToWebp } from "@merqo/ui";
import { MediaImage } from "@/components/widgets/media-image";
import { uploadQkitImage } from "@/lib/image-upload-adapter";
import { OptionGroupsEditor } from "./option-groups-editor";
import { MenuItemPricingFields } from "./menu-item-fields";
import { SortableItemCard } from "./menu-sortables";
import type { MenuMutations } from "./use-menu-mutations";
import type { Entitlement } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { ALLERGEN_TAGS, type MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory, OptionGroup } from "@/lib/types";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";

interface Props {
  item: MenuItemFormInput;
  index: number;
  groupId: string;
  standalone: boolean;
  vendorId: string;
  entitlement: Entitlement;
  categories: MenuCategory[];
  atItemCap: boolean;
  isOpen: boolean;
  isAdvancedOpen: boolean;
  onToggleExpand: (id: string) => void;
  onToggleAdvanced: (id: string) => void;
  mutations: MenuMutations;
}

export function MenuItemRow({
  item,
  index,
  groupId,
  standalone,
  vendorId,
  entitlement,
  categories,
  atItemCap,
  isOpen,
  isAdvancedOpen,
  onToggleExpand,
  onToggleAdvanced,
  mutations,
}: Props) {
  const {
    update,
    toggleItemAllergen,
    setPrice,
    setCost,
    setStock,
    removeItem,
    duplicateItem,
  } = mutations;
  const groups: OptionGroup[] = item.option_groups ?? [];

  return (
    <SortableItemCard
      key={item.id}
      id={item.id}
      data={{ type: "item", groupId }}
    >
      {({ setNodeRef, style, attributes, listeners, isDragging }) => (
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            standalone
              ? "space-y-3 rounded-xl border border-border bg-card p-3.5"
              : "space-y-3 p-3.5",
            isDragging && "opacity-40",
          )}
        >
          <div className="flex gap-2">
            <button
              type="button"
              className="tap-area mt-2 shrink-0 cursor-grab touch-none self-start text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label="Reorder item"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <ImageUploader
              bucket="booth-images"
              pathPrefix={vendorId}
              value={item.image_url ?? null}
              onChange={(url) => update(index, { image_url: url })}
              onUpload={uploadQkitImage}
              resizeImage={resizeToWebp}
              imageComponent={MediaImage}
              variant="thumb"
              deferUpload
            />
            <div className="flex flex-1 flex-col gap-2">
              <Input
                placeholder="Item name"
                aria-label="Item name"
                value={item.name}
                onChange={(e) => update(index, { name: e.target.value })}
                className="rounded-lg"
              />
              <Input
                placeholder="Description (optional)"
                aria-label={`Description of ${item.name || "this item"}`}
                value={item.description}
                onChange={(e) => update(index, { description: e.target.value })}
                className="rounded-lg"
              />
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-lg text-muted-foreground hover:text-foreground"
                    aria-label="More actions"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={atItemCap}
                    onSelect={() => duplicateItem(index)}
                  >
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => removeItem(index)}
                  >
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="outline"
                size="icon"
                role="switch"
                aria-checked={item.available}
                aria-label="Available"
                title={
                  item.available
                    ? "Available, tap to hide from the menu"
                    : "Hidden, tap to make available again"
                }
                onClick={() => update(index, { available: !item.available })}
                className="rounded-lg text-muted-foreground hover:text-foreground data-[unavailable=true]:border-dashed data-[unavailable=true]:text-muted-foreground/60"
                data-unavailable={!item.available}
              >
                {item.available ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <MenuItemPricingFields
            item={item}
            index={index}
            categories={categories}
            stockCaps={entitlement.stockCaps}
            onPrice={(cents) => setPrice(index, cents)}
            onCost={(cents) => setCost(index, cents)}
            onStock={(raw) => setStock(index, raw)}
            onCategory={(category) => update(index, { category })}
          />

          {/* Advanced: fixed/inherent allergens — collapsed by default,
                most items need none. Anything that varies by customization
                choice is tagged on the choice itself (OptionGroupsEditor). */}
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleAdvanced(item.id)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
              >
                {isAdvancedOpen ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                Advanced
              </button>
              {/* At-a-glance allergen summary so a vendor scanning the list
                    doesn't need to expand every item — icon-only, only when set. */}
              {(item.allergens ?? []).length > 0 && (
                <span
                  className="flex items-center gap-0.5"
                  aria-label={`Contains allergens: ${(item.allergens ?? []).join(", ")}`}
                >
                  {(item.allergens ?? []).map((tag) => (
                    <span key={tag} aria-hidden="true">
                      {ALLERGEN_ICONS[tag]}
                    </span>
                  ))}
                </span>
              )}
            </div>
            {isAdvancedOpen && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Allergens always present in this item, regardless of
                  customization.
                </p>
                <div className="flex flex-wrap gap-3">
                  {ALLERGEN_TAGS.map((tag) => (
                    <label
                      key={tag}
                      className="flex items-center gap-1.5 text-xs capitalize"
                    >
                      <Checkbox
                        checked={(item.allergens ?? []).includes(tag)}
                        onCheckedChange={(checked) =>
                          toggleItemAllergen(index, tag, checked === true)
                        }
                      />
                      <span aria-hidden="true">{ALLERGEN_ICONS[tag]}</span>
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Customization — collapsed by default; most items have none. */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
            >
              {isOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Customization
              {groups.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[0.7rem] text-primary">
                  {groups.length}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="mt-3">
                <OptionGroupsEditor
                  groups={groups}
                  onChange={(g) => update(index, { option_groups: g })}
                  entitlement={entitlement}
                  itemAllergens={item.allergens ?? []}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </SortableItemCard>
  );
}
