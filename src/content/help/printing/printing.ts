import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "printing",
  category: "printing",
  title: "Printing",
  summary:
    "Turn on per-item labels and see what the board shows when a label fails.",
  reviewed: "2026-11-03",
  uiLabels: [
    "Print via printkit",
    "Printer connected",
    "Printer offline",
    "Turn on anyway",
    "Open printkit",
    "Label did not print",
    "Start now",
  ],
  covers: [
    "src/app/dashboard/booths/printing-section.tsx",
    "src/app/dashboard/booths/printer-status.tsx",
    "src/app/o/[code]/notify.ts",
    "src/app/api/printkit/print-status/route.ts",
    "src/lib/printkit/client.ts",
    "src/lib/printkit/labels.ts",
    "src/lib/ticket.ts",
  ],
  body: [
    {
      type: "paragraph",
      text: "qkit can print one label per item for each order, so a drink or a box carries its own order number and options. The printing itself is handled by printkit, a sibling Merqo app, where you choose and manage your printer. This guide covers the qkit side.",
    },

    { type: "heading", level: 2, text: "Turn on labels for a booth" },
    {
      type: "steps",
      items: [
        "Go to Booths, tap Edit on your booth and save it first if it is new. A booth must be saved before it can have a printer.",
        "Open the Printing section and turn on Print via printkit.",
        "Tap the link beneath it to choose or manage this booth's printer in printkit.",
        "Come back and check the status line under the switch. It reads Printer connected when the printer is reachable and Printer offline when it is not.",
        "Tap Save booth.",
      ],
    },
    {
      type: "bullets",
      items: [
        "Printing is set per booth. Turn it on for each booth that has a printer.",
        "If you turn it on while the printer is offline, qkit asks first. Turn on anyway keeps the setting and you can sort the printer out later.",
        "If printing is on but no printer is set up yet, the section says so. Orders will not print until you connect one.",
        "While printing is off, a link named Open printkit reaches printkit's home page.",
      ],
    },

    { type: "heading", level: 2, text: "What gets printed, and when" },
    {
      type: "bullets",
      items: [
        "One label for every unit of every item, so an order of three coffees prints three labels. Each carries the item name and any option choices.",
        "Labels print only after the order is paid, or, for a booth that takes no payment, once the order is started.",
        "A customer saying they paid does not print anything. You confirm the payment first.",
        "With printing off, new orders wait in Incoming until you tap Start now.",
        "Very large orders, over 100 labels, are not printed and show as a failed print.",
      ],
    },

    { type: "heading", level: 2, text: "When a label fails" },
    {
      type: "paragraph",
      text: "A ticket whose labels did not print shows Label did not print on it. The order itself is not affected: you can still start it, mark it ready and hand it over.",
    },
    {
      type: "steps",
      items: [
        "Check the printer is switched on, has paper or label stock and is connected. The Printing section shows whether qkit sees it.",
        "Open printkit from the Printing section to check the printer there.",
        "Label the order by hand if it is already being made.",
      ],
    },

    { type: "heading", level: 2, text: "Which printer to use" },
    {
      type: "paragraph",
      text: "qkit does not pick printers for you. What suits you depends on the device you run the board on.",
    },
    {
      type: "bullets",
      items: [
        "An iPad cannot print to a Bluetooth label printer. If the board runs on an iPad, use a printer that connects over WiFi or the cloud.",
        "For any other device, check printkit for what your printer needs.",
      ],
    },
    {
      type: "link",
      text: "Printer trouble? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },
  ],
};
