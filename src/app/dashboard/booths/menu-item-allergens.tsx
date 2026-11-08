"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALLERGEN_TAGS, type AllergenTag } from "@/lib/schemas";
import { ALLERGEN_ICONS } from "@/lib/allergen-icons";

interface Props {
  allergens: AllergenTag[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleAllergen: (tag: AllergenTag, checked: boolean) => void;
}

/** Collapsed-by-default fixed allergens; per-choice allergens live on the choice itself. */
export function MenuItemAllergens({
  allergens,
  isOpen,
  onToggleOpen,
  onToggleAllergen,
}: Props) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
        >
          {isOpen ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Advanced
        </button>
        {allergens.length > 0 && (
          <span
            className="flex items-center gap-0.5"
            aria-label={`Contains allergens: ${allergens.join(", ")}`}
          >
            {allergens.map((tag) => (
              <span key={tag} aria-hidden="true">
                {ALLERGEN_ICONS[tag]}
              </span>
            ))}
          </span>
        )}
      </div>
      {isOpen && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Allergens always present in this item, regardless of customization.
          </p>
          <div className="flex flex-wrap gap-3">
            {ALLERGEN_TAGS.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-1.5 text-xs capitalize"
              >
                <Checkbox
                  checked={allergens.includes(tag)}
                  onCheckedChange={(checked) =>
                    onToggleAllergen(tag, checked === true)
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
  );
}
