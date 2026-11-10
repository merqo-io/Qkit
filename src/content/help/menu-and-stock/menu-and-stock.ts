import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "menu-and-stock",
  category: "menu-and-stock",
  title: "Menu and stock",
  summary:
    "Set up items, the daily item limit, basket holds and the per-order item limit.",
  reviewed: "2026-11-05",
  uiLabels: [
    "Add item",
    "Add section",
    "Item name",
    "Price",
    "Sold-out limit",
    "Available",
    "Duplicate",
    "Remove",
    "Save menu",
    "Import CSV",
    "Export CSV",
    "Download template",
    "Daily item limit",
    "Max items per order",
    "Start new service",
    "Sold out",
    "Also in other baskets. Stock is checked when you order.",
  ],
  covers: [
    "src/app/dashboard/booths/menu-manager.tsx",
    "src/app/dashboard/booths/menu-editor.tsx",
    "src/app/dashboard/booths/menu-item-fields.tsx",
    "src/app/dashboard/booths/booth-form.tsx",
    "src/app/dashboard/booths/actions.ts",
    "src/components/order/menu-item-card.tsx",
    "src/lib/availability.ts",
    "src/lib/plan.ts",
  ],
  body: [
    {
      type: "paragraph",
      text: "Your menu is what customers see when they scan your QR. This guide covers adding items, hiding or limiting them, and the three limits that stop a booth taking more than it can serve.",
    },

    { type: "heading", level: 2, text: "Add and edit items" },
    {
      type: "steps",
      items: [
        "Go to Booths, tap Edit on your booth, then open the Menu section. The row shows how many items you have.",
        "Tap Add item and fill in the Item name. Add a short description if it helps.",
        "Type the Price. It is optional: leave it blank for a booth that only runs a queue.",
        "Repeat for each item, then tap Save menu.",
      ],
    },
    {
      type: "bullets",
      items: [
        "Group items under headings with Add section, and drag items between sections to reorder them.",
        "The three-dot menu on an item has Duplicate and Remove. Removing shows an Undo for a moment.",
        "Cost is private. It only feeds your profit stats and customers never see it.",
        "Items can have option choices such as size or toppings, set from the item's Customization area.",
      ],
    },
    {
      type: "note",
      text: "Some plans cap how many items a booth can hold. When you reach the cap, Add item is replaced by an upgrade prompt.",
    },

    { type: "heading", level: 2, text: "Bring in a menu from a spreadsheet" },
    {
      type: "steps",
      items: [
        "On the menu page, tap Download template (it reads Export CSV once you have items) to get a file with the right columns: name, description, price, cost, available.",
        "Fill it in, one row per item.",
        "Tap Import CSV and pick the file. You see a preview of what will be added.",
        "Tap Add to menu, then Save menu.",
      ],
    },

    { type: "heading", level: 2, text: "Hide an item or mark it sold out" },
    {
      type: "paragraph",
      text: "There are two ways to stop an item being ordered, and they suit different jobs.",
    },
    {
      type: "bullets",
      items: [
        "Hide it by turning off the Available switch on the item. Customers do not see it until you turn it back on. Use this when you have run out for the day.",
        "Give it a Sold-out limit. Once that many are sold, customers see Sold out on the item and cannot add it. Leave the limit blank for unlimited.",
      ],
    },
    {
      type: "note",
      text: "The Sold-out limit is available on the Starter and Pro plans and during an Event Pass. On Free the field shows an upgrade prompt.",
    },
    {
      type: "tip",
      text: "Remember to tap Save menu after any change. Nothing reaches customers until you do.",
    },

    { type: "heading", level: 2, text: "Set a daily item limit" },
    {
      type: "paragraph",
      text: "The Daily item limit caps the whole booth, not one item. Ordering stops once the booth has sold that many items in a day. It counts every item, so an order of four counts four.",
    },
    {
      type: "steps",
      items: [
        "Go to Booths and tap Edit on your booth.",
        "Under Limits, type a number in Daily item limit. Leave it blank for no limit.",
        "Tap Save booth.",
      ],
    },
    {
      type: "bullets",
      items: [
        "The count starts again from zero at midnight.",
        "Running a morning and an afternoon service? Tap Start new service to reset the count yourself. It sits under Limits, and as a labelled New service button beside the booth on the live board. It also starts any per-item Sold-out limits again. Orders already placed are not changed.",
        "The daily item limit is available on the Starter and Pro plans and during an Event Pass. If you already set one and your plan has since changed, it keeps working. You can see it and remove it, but not change it.",
      ],
    },
    {
      type: "link",
      text: "Restarting a service in Running a service",
      href: "/dashboard/help/running-a-service",
    },

    { type: "heading", level: 2, text: "Limit items per order" },
    {
      type: "paragraph",
      text: "Max items per order stops one customer taking the whole tray.",
    },
    {
      type: "steps",
      items: [
        "Edit your booth and find Max items per order under Limits.",
        "Type the most items one order may carry, or leave it blank for no limit.",
        "Tap Save booth.",
      ],
    },
    {
      type: "paragraph",
      text: "Customers who go over see a message saying how many items your stall takes per order. This limit works on every plan. Orders you key in yourself on the board are not limited.",
    },

    { type: "heading", level: 2, text: "What are basket holds?" },
    {
      type: "paragraph",
      text: "When stock is limited, items in a customer's basket are held for them for a few minutes, so two people do not both pay for the last portion. Holds apply only when you have a Sold-out limit or a daily item limit.",
    },
    {
      type: "bullets",
      items: [
        "A customer sees a note under an item reading Also in other baskets. Stock is checked when you order, when other baskets are holding some of what is left.",
        "If the last ones are in someone else's basket, the customer is asked to try again in a few minutes. If that person does not order, the stock comes back.",
        "A hold is a courtesy. The real check happens when the order is placed, so a customer may still be told an item sold out at the last step.",
      ],
    },
    {
      type: "tip",
      text: "You do not need to manage holds. If a customer reports an item showing as unavailable that you know is in stock, ask them to try again in a few minutes.",
    },
    {
      type: "link",
      text: "Customer sees an error? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },
  ],
};
