import type { FaqGroup } from "@merqo/ui";

export const FAQ_TITLE = "Frequently asked questions";

export const FAQ_INTRO =
  "Short answers about how qkit works at a stall, what it costs, and what it does with your orders and your customers' details.";

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    heading: "Getting started",
    rows: [
      {
        q: "Do my customers need an app?",
        a: "No. They scan the QR and order in their phone browser, then track the order on the same page.",
      },
      {
        q: "What do I need at the stall?",
        a: "A phone, tablet or laptop with a browser for the board, and your printed QR poster. No special hardware.",
      },
      {
        q: "How do I get set up?",
        a: "Sign up with Google or an email and password, make a booth, add your menu items, then print or download the QR poster. Scan your own QR and place a test order to check it works.",
      },
      {
        q: "What do my customers have to give me?",
        a: "Their name. A phone number is optional, so you can recognise them next time. The order form tells them what the details are used for. If they give a number, Merqo may use it to recognise them across other Merqo kits too.",
      },
    ],
  },
  {
    id: "day-to-day",
    heading: "Day to day",
    rows: [
      {
        q: "What if an item runs out or an order is wrong?",
        a: 'A customer who orders an item as it runs out sees "Sorry, an item just sold out. Please adjust your order." If an order is wrong, open the three-dot menu on its ticket on your board and choose Cancel order.',
      },
    ],
  },
  {
    id: "money-and-payment",
    heading: "Money and payment",
    rows: [
      {
        q: "Can I take PayNow?",
        a: "Yes, through paykit, a separate Merqo app that is still in build. The customer pays in their banking app and marks the order as paid. The ticket then says to check the payment, and it only counts as paid once you confirm it. The money goes to your own account and qkit never holds it. Online card payment is not available.",
      },
      {
        q: "Do I have to take payment through qkit?",
        a: "No. Taking payment is a switch on each booth. With it off, customers just join the queue and pay you at the counter.",
      },
      {
        q: "Does qkit see my PayNow or bank details?",
        a: "No. qkit only shows what kind of payment you have set up. You enter your PayNow details once in paykit, a separate Merqo app that is still in build, and qkit does not keep them.",
      },
    ],
  },
  {
    id: "cost-and-pilot",
    heading: "Cost and pilot",
    rows: [
      {
        q: "Is it free, and is qkit finished?",
        a: "qkit is piloting and running with a few vendors. Free during the pilot. If we start charging, you'll get at least 30 days' notice first.",
      },
      {
        q: "Who runs qkit, and what if I want to stop?",
        a: "qkit is a personal software project built and run by Clarence Lee. Merqo is not registered with ACRA or incorporated as a company. You can email legal@merqo.io to cancel or to ask for an export of your data.",
      },
    ],
  },
];
