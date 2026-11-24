# menu

## Purpose

Dedicated menu-manager page for one booth — item add/edit/reorder plus CSV
bulk export/import, split out of the main booth-edit form.

## Contents

- `page.tsx` — `BoothMenuPage({ params })` (server, `revalidate = 0`): calls
  `requireEntitledVendor()`, loads the booth (`id, name, menu_items,
menu_categories, modifier_groups`) RLS-scoped (foreign id → `null` → `notFound()`), parses
  stored JSON via `parseMenuItems`/`parseMenuCategories` (2026-09-02, the
  latter added alongside `menu-editor.tsx`'s section management), and renders `MenuManager`
  (from `../../menu-manager`) pre-filled with the booth's items and category
  sections and the booth's reusable modifier groups (`parseModifierGroups`).

## Connectivity

Reached from `booth-form.tsx`'s "Manage menu" link (only once a booth has a
`boothId`, i.e. after its first save). `page.tsx` loads the booth and hands
it to `../../menu-manager.tsx`'s `MenuManager`, which saves items via
`saveMenuItems` and sections via `saveMenuCategories` (both in
`../../actions.ts`) — the exclusive write paths for `booths.menu_items` and
`booths.menu_categories` respectively; `saveBooth` (the main booth form's
own save) never touches either column, so the two pages can't clobber each
other. Saving navigates back to `../` (this booth's edit page).

## Parent

[[boothId]](../README.md)
