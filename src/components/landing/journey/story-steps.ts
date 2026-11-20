import type { StoryStep } from "./try-it-state";

export const STORY_STEPS: {
  n: StoryStep;
  tab: string;
  who: string;
  heading: string;
  body: string;
  try: string;
}[] = [
  {
    n: 1,
    tab: "Order",
    who: "On their phone",
    heading: "They scan your QR and order.",
    body: "No app to download. Your menu opens in their phone browser. They pick, tap Place order, and walk away from the queue.",
    try: "Change the order on the phone, then tap Place order.",
  },
  {
    n: 2,
    tab: "Start",
    who: "On your board",
    heading: "Order 0042 lands on your board.",
    body: "It shows up the second they tap. You tap Start, and their phone switches to Preparing by itself.",
    try: "Tap Start on the new ticket.",
  },
  {
    n: 3,
    tab: "Ready",
    who: "On both",
    heading: "You tap Mark Ready. Their phone tells them.",
    body: "No shouting numbers over the noise. They walk up when it's ready, and the next order is already waiting.",
    try: "Tap Mark Ready, then Mark Picked Up when they collect. Or wait 10 seconds: this sample clears itself, and you set the real delay.",
  },
];
