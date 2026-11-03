// qkit demo recorder: drives the REAL app against a LOCAL Supabase, records one
// named scene (see scenes.mjs) as vertical phone footage, and writes steps.json
// (caption + timing per beat, plus each recording's start offset) for
// compose.mjs to burn in.
//
// Prereqs: local Supabase up + migrations applied + `pnpm dev` running, and the
// demo account wiped (scripts/demo/reset.sql) before every run. See README.md.
//
// Run: node scripts/demo/record.mjs [--scene <name>] [--list]
// Out: scripts/demo/out/<scene>/{<role>.webm, steps.json}
//
// Selectors are pinned to the current app. If a beat times out, the app markup
// moved: fix the locator, not the timeout.

import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  assertLoopback,
  localDemoBaseUrl,
  localDemoDbUrl,
} from "./base-url.mjs";
import { formatSceneList, parseArgs, resolveScene } from "./scenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");

// Fixed demo identity. Must match scripts/demo/reset.sql.
const EMAIL = "demo-cart@qkit.local";
const PASSWORD = "demo-password-123";
const STALL = "Sunrise Coffee Cart";

// Event vendors care about customization, not price, so the default menu shows
// options (Milk on the hero item) and no prices. The first item is the
// customizable one; the rest are plain so a customer can one-tap "Add".
const ITEMS = [
  {
    name: "Flat White",
    groups: [{ group: "Milk", choices: ["Oat milk", "Regular", "Soy"] }],
  },
  { name: "Cold Brew" },
  { name: "Iced Mocha" },
];
// The options episode needs more than one group on the ticket.
const OPTION_ITEMS = [
  {
    name: "Flat White",
    groups: [
      { group: "Milk", choices: ["Oat milk", "Regular", "Soy"] },
      { group: "Sugar", choices: ["Normal", "Less sugar"] },
    ],
  },
  { name: "Cold Brew" },
  { name: "Iced Mocha" },
];
const PLAIN_ITEMS = [{ name: "Cold Brew" }, { name: "Iced Mocha" }];
const MULTI_BOOTHS = ["Coffee Cart", "Juice Bar", "Waffle Stand"];

const CUSTOMER = "Priya";
const WALK_IN = "Marcus";
const PAYING_CUSTOMER = "Hana";
const CROWD = ["Aiden", "Bea", "Chen", "Dina", "Eli", "Faye", "Gus", "Hugo"];

const PHONE = { width: 390, height: 844 };
const TV = { width: 1280, height: 720 };
const CURSOR_SCRIPT = `
  (() => {
    const add = () => {
      if (document.getElementById('__demo_cursor')) return;
      const c = document.createElement('div');
      c.id = '__demo_cursor';
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
        width: '20px', height: '20px', marginLeft: '-10px', marginTop: '-10px',
        borderRadius: '50%', background: 'rgba(30,30,30,0.30)',
        border: '2px solid rgba(255,255,255,0.95)',
        boxShadow: '0 1px 5px rgba(0,0,0,0.45)', pointerEvents: 'none',
        transition: 'width .08s ease, height .08s ease',
      });
      document.body.appendChild(c);
      window.addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px';
        c.style.top = e.clientY + 'px';
      }, { passive: true });
      window.addEventListener('mousedown', () => { c.style.width = '13px'; c.style.height = '13px'; });
      window.addEventListener('mouseup', () => { c.style.width = '20px'; c.style.height = '20px'; });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  })();
`;

// Global tempo. Below 1 is faster: every cosmetic wait and the typing cadence
// scale by it, while real waits (waitForURL, waitFor) are unaffected, so it
// stays robust. Override with DEMO_SPEED.
const SPEED = Number(process.env.DEMO_SPEED ?? 0.75);

// Pages that do unrecorded setup work: no cosmetic waits, no cursor glide, no
// per-character typing, so a scene's prerequisites cost seconds, not a minute.
const FAST = new WeakSet();

const state = {
  steps: [],
  videos: [],
  popMs: 0,
  t0: 0,
  baseUrl: "",
};
const now = () => Date.now() - state.t0;
const beat = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
const pause = (page, ms) => (FAST.has(page) ? Promise.resolve() : beat(ms));

/** The moment the order lands: compose drops the chime here. */
function markPop() {
  state.popMs = now();
}

/** Wrap a narrative beat: records {caption, startMs, endMs} for compose.mjs. */
async function step(caption, fn) {
  const startMs = now();
  await fn();
  state.steps.push({ caption, startMs, endMs: now() });
}

/** Glide the cursor to an element's centre, then click it (visible motion). */
async function glideClick(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  if (!FAST.has(page)) {
    const box = await locator.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 18,
      });
      await beat(180);
    }
  }
  await locator.click();
}

/** Click a field, then type it character by character for a human cadence. */
async function slowType(page, locator, text, perCharMs = 55) {
  if (FAST.has(page)) {
    await locator.fill(text);
    return;
  }
  await glideClick(page, locator);
  await locator.pressSequentially(text, { delay: perCharMs * SPEED });
  await beat(220);
}

/** Smooth-scroll a target to the vertical centre of the viewport so the action
 *  is the focus instead of stuck at the screen edge. */
async function center(page, locator) {
  if (FAST.has(page)) {
    await locator.scrollIntoViewIfNeeded();
    return;
  }
  await locator
    .evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "smooth" }),
    )
    .catch(() => {});
  await beat(280);
}

/** Smooth-scroll the page by a distance, for the read-only scenes. */
async function scrollPage(page, px) {
  await page.evaluate(
    (y) => window.scrollBy({ top: y, behavior: "smooth" }),
    px,
  );
  await beat(900);
}

// Browser plumbing ---------------------------------------------------------

function newPageDefaults(page) {
  // Turbopack dev keeps an HMR socket open, so "load"/"networkidle" can hang;
  // navigations use domcontentloaded. Be generous on first-compile waits.
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(45000);
}

/** A recorded context. startMs is when its video begins on the scene clock. */
async function openRecorded(browser, sceneDir, role, opts = {}) {
  const viewport = opts.viewport ?? PHONE;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    storageState: opts.storageState,
    recordVideo: { dir: sceneDir, size: viewport },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  // The scene clock starts at the first recorded context, so unrecorded setup
  // never shows up as blank lead-in; later contexts get a positive offset.
  if (state.videos.length === 0) state.t0 = Date.now();
  const page = await context.newPage();
  const startMs = now();
  newPageDefaults(page);
  state.videos.push({ role, context, page, startMs, viewport });
  return page;
}

/** An unrecorded context for setup and for the "other person" in a scene. */
async function openFast(browser, storageState) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    storageState,
  });
  const page = await context.newPage();
  newPageDefaults(page);
  FAST.add(page);
  return { context, page };
}

// Shared flows -------------------------------------------------------------
// Each takes a page that is either recorded (paced, with cursor) or fast.

async function signUp(page) {
  await page.goto(`${state.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await pause(page, 900);
  const toggle = page.getByRole("button", { name: "Create an account" });
  const submit = page.getByRole("button", { name: "Create account" });
  await glideClick(page, toggle);
  // A click that lands before hydration does nothing; click again until the
  // sign-up form shows.
  for (let i = 0; i < 4 && !(await submit.isVisible()); i++) {
    await pause(page, 600);
    if (await toggle.isVisible()) await glideClick(page, toggle);
  }
  await pause(page, 300);
  await slowType(page, page.locator("#email"), EMAIL);
  await slowType(page, page.locator("#password"), PASSWORD);
  await glideClick(page, page.getByRole("button", { name: "Create account" }));
  // enable_confirmations=false, so the session is granted and /dashboard
  // sends a new vendor to /onboarding.
  await page.waitForURL(/\/onboarding/, { timeout: 15000 });
}

async function nameStall(page) {
  await pause(page, 700);
  await slowType(page, page.locator("#name"), STALL);
  await glideClick(page, page.getByRole("button", { name: /Open my stall/ }));
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  await pause(page, 800);
}

const tourPopover = (page) => page.locator(".driver-popover.qkit-tour");

/** Close a first-visit tour popover if one shows; it would swallow clicks. */
async function dismissTour(page) {
  const pop = tourPopover(page);
  try {
    await pop.waitFor({
      state: "visible",
      timeout: FAST.has(page) ? 3000 : 5000,
    });
  } catch {
    return;
  }
  await page.keyboard.press("Escape");
  await pop.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
}

/** Walk the dashboard's built-in tour to its own conclusion. */
async function walkTour(page) {
  const pop = tourPopover(page);
  try {
    await pop.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    return;
  }
  const nextBtn = page.locator(".driver-popover-next-btn");
  // Up to 5 steps (3 on the phone viewport); the final "Next" is "Done".
  for (let i = 0; i < 5; i++) {
    await beat(680);
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await glideClick(page, nextBtn);
  }
  if (await pop.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  await pop.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await beat(450);
}

async function addOptionGroup(page, card, gi, g) {
  await glideClick(
    page,
    card.getByRole("button", { name: /Add option group/ }),
  );
  await pause(page, 200);
  const nameField = card.getByPlaceholder(/Group name/).nth(gi);
  await center(page, nameField);
  await slowType(page, nameField, g.group, 40);
  const choices = card.getByPlaceholder(/^Choice/);
  // A new group starts with one empty choice; earlier groups' choices come first.
  const base = await choices.count();
  await slowType(page, choices.nth(base - 1), g.choices[0], 40);
  for (let ci = 1; ci < g.choices.length; ci++) {
    await glideClick(
      page,
      card.getByRole("button", { name: /Add choice/ }).nth(gi),
    );
    await pause(page, 120);
    await choices.nth(base - 1 + ci).fill(g.choices[ci]);
    await pause(page, 170);
  }
  await pause(page, 300);
}

async function addMenuItem(page, item) {
  // The bottom "Add item" button (present once there is at least one item)
  // keeps the view put; with 0 items only the top one exists, so .last()
  // resolves to it either way.
  await glideClick(page, page.getByRole("button", { name: /Add item/ }).last());
  await pause(page, 150);
  const card = page
    .locator("div.bg-card", { has: page.getByPlaceholder("Item name") })
    .last();
  await center(page, card.getByPlaceholder("Item name"));
  await slowType(page, card.getByPlaceholder("Item name"), item.name, 45);
  if (!item.groups) return;
  await glideClick(page, card.getByRole("button", { name: /Customization/ }));
  await pause(page, 250);
  for (const [gi, g] of item.groups.entries()) {
    await addOptionGroup(page, card, gi, g);
  }
}

/**
 * Create a booth with a menu through the real form. `viaLink` clicks the
 * dashboard's "Add your first booth" so the cursor leads into the page.
 * Ends on the booth's QR page. Returns the new booth's id.
 */
async function createBooth(page, opts = {}) {
  const name = opts.name ?? STALL;
  const items = opts.items ?? ITEMS;
  if (opts.viaLink) {
    await glideClick(
      page,
      page.getByRole("link", { name: /Add your first booth/ }),
    );
  } else {
    await page.goto(`${state.baseUrl}/dashboard/booths/new`, {
      waitUntil: "domcontentloaded",
    });
  }
  await page.waitForURL(/\/dashboard\/booths\/new/, { timeout: 15000 });
  await pause(page, 700);
  await slowType(page, page.locator("#booth-name"), name);

  if (opts.arrival) {
    const hold = page.getByRole("switch", { name: "Hold prep until arrival" });
    await center(page, hold);
    await glideClick(page, hold);
  }

  await dismissTour(page);
  const save = page.getByRole("button", { name: /Save booth/ });
  await center(page, save);
  await glideClick(page, save);
  // A new booth only gets its menu editor after the first save, and saving the
  // menu lands on the booth's QR page.
  await page.waitForURL(/\/dashboard\/booths\/[0-9a-f-]{36}\/menu/i, {
    timeout: 15000,
  });
  const boothId = page
    .url()
    .match(/\/dashboard\/booths\/([0-9a-f-]{36})\/menu/i)?.[1];
  if (!boothId)
    throw new Error("Could not read the new booth id from the URL.");
  await dismissTour(page);
  await pause(page, 700);

  for (const item of items) await addMenuItem(page, item);
  await pause(page, 300);
  const saveMenu = page.getByRole("button", { name: "Save menu" });
  await center(page, saveMenu);
  await glideClick(page, saveMenu);
  await page.waitForURL(new RegExp(`/dashboard/booths/${boothId}/qr`), {
    timeout: 15000,
  });
  await pause(page, 900);
  return boothId;
}
/** Give every menu item a price, and optionally a per-item sold-out limit. */
async function editMenu(page, boothId, { prices = false, stock = {} } = {}) {
  await page.goto(`${state.baseUrl}/dashboard/booths/${boothId}/menu`, {
    waitUntil: "domcontentloaded",
  });
  await pause(page, 800);
  if (prices) {
    const fields = page.getByPlaceholder("Optional");
    // Each item has a Price and a Cost field, in that order.
    const items = (await fields.count()) / 2;
    for (let i = 0; i < items; i++) {
      await fields.nth(i * 2).fill("4.50");
      await fields.nth(i * 2).press("Tab");
    }
  }
  for (const [index, limit] of Object.entries(stock)) {
    const field = page.locator(`#menu-item-${index}-stock`);
    await center(page, field);
    await slowType(page, field, String(limit));
  }
  await glideClick(page, page.getByRole("button", { name: "Save menu" }));
  await page.getByText(/^Menu saved/).waitFor();
}

/**
 * Turn on "Take payment" for a booth. The PayNow details live in paykit, not
 * here, so the switch stays locked unless paykit holds a payment setup for the
 * demo vendor.
 */
async function enablePayment(page, boothId) {
  await page.goto(`${state.baseUrl}/dashboard/booths/${boothId}`, {
    waitUntil: "domcontentloaded",
  });
  await pause(page, 1000);
  const take = page.getByRole("switch", {
    name: "Take payment for orders at this booth",
  });
  await center(page, take);
  if (await take.isDisabled()) {
    throw new Error(
      "Take payment is locked: paykit has no PayNow setup on file for the demo vendor (or is unreachable). Point NEXT_PUBLIC_PAYKIT_URL at a paykit that has one. See README.md.",
    );
  }
  await glideClick(page, take);
  await pause(page, 450);
  const save = page.getByRole("button", { name: /Save booth/ });
  await center(page, save);
  await glideClick(page, save);
  await page.waitForURL(/\/dashboard\/booths$/, { timeout: 15000 });
  await pause(page, 900);
}

/**
 * A customer orders from the booth page. `after` says where the order should
 * land: "status" (numbered status page), "pay" (sent off to paykit's page) or
 * "form" (stop with the checkout sheet's Place order tapped, no wait).
 */
async function customerOrder(page, boothId, opts) {
  const { name, after = "status", plainIndex = 0 } = opts;
  await page.goto(`${state.baseUrl}/order/${boothId}`, {
    waitUntil: "domcontentloaded",
  });
  await pause(page, 1100);
  if (opts.customize) {
    // The customizable item shows "Customize" and opens the options sheet.
    await glideClick(page, page.getByRole("button", { name: "Customize" }));
    await pause(page, 700);
    // Single-select choices render as a radiogroup (item-customizer.tsx), so
    // the accessible role is "radio", not "button".
    for (const choice of opts.customize) {
      await glideClick(page, page.getByRole("radio", { name: choice }));
      await pause(page, 500);
    }
    await glideClick(page, page.getByRole("button", { name: /Add to order/ }));
  } else {
    await glideClick(
      page,
      page.getByRole("button", { name: "Add", exact: true }).nth(plainIndex),
    );
  }
  await pause(page, 600);
  // The sticky bar is a checkout trigger: it opens a sheet holding the name
  // field and the real submit.
  await glideClick(page, page.getByRole("button", { name: /Continue/ }));
  await pause(page, 700);
  const sheet = page.getByRole("dialog");
  await slowType(page, sheet.locator("#customerName"), name);
  await glideClick(page, sheet.getByRole("button", { name: /Place order/ }));
  if (after === "status") {
    await page.waitForURL(new RegExp(`/order/${boothId}/\\d+`), {
      timeout: 15000,
    });
  } else if (after === "pay") {
    await page.waitForURL((u) => !u.href.startsWith(state.baseUrl), {
      timeout: 20000,
    });
  }
  await pause(page, 1000);
}

// 1x1 transparent PNG, standing in for a payment screenshot.
const PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12P4DwABAQEAG7buVgAAAABJRU5ErkJggg==",
  "base64",
);

/** On paykit's pay page: attach a screenshot if it offers one, then claim. */
async function payOnPaykit(page, boothId, { withProof = true } = {}) {
  assertLoopback(page.url());
  await pause(page, 900);
  const upload = page.locator('input[type="file"]');
  if (withProof && (await upload.count()) > 0) {
    await upload.first().setInputFiles({
      name: "demo-proof.png",
      mimeType: "image/png",
      buffer: PROOF_PNG,
    });
    await beat(700);
  }
  const paid = page.getByRole("button", { name: /i.?ve paid/i });
  await paid.waitFor({ timeout: 10000 });
  await center(page, paid);
  await beat(1200);
  await glideClick(page, paid);
  await page.waitForURL(new RegExp(`/order/${boothId}/\\d+\\?t=`), {
    timeout: 20000,
  });
  await page.getByText(/payment sent/i).waitFor({ timeout: 10000 });
  await beat(900);
}

// Vendor board helpers -----------------------------------------------------

const ACTION = /Mark paid & start|Start now|Mark Ready|Mark Picked Up|Undo/;

/** The ticket for a customer: the innermost block holding their name and an action. */
function ticket(page, name) {
  return page
    .locator("div")
    .filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: ACTION }) })
    .last();
}

async function openBoard(page) {
  await page.goto(`${state.baseUrl}/dashboard`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", { name: "New order" })
    .waitFor({ timeout: 30000 });
  await pause(page, 900);
}

/** On a phone only one of Incoming/Accepted shows; flip to the one with this ticket. */
async function revealTicket(page, name) {
  const card = ticket(page, name);
  await card.waitFor({ state: "attached", timeout: 30000 });
  if (await card.isVisible()) return;
  const tabs = page
    .getByRole("group", { name: "Which orders to show" })
    .getByRole("button");
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    if (await card.isVisible()) return;
  }
}

async function tapTicket(page, name, label) {
  await revealTicket(page, name);
  const button = ticket(page, name).getByRole("button", { name: label });
  await button.waitFor({ state: "visible", timeout: 30000 });
  await center(page, button);
  await glideClick(page, button);
}

/** Start, ready and hand over one order. "Undo" holds the next button back a few seconds. */
async function fulfil(page, name, { start = true } = {}) {
  if (start) await tapTicket(page, name, /Start now/);
  await tapTicket(page, name, "Mark Ready");
  await tapTicket(page, name, "Mark Picked Up");
}

// Seeding ------------------------------------------------------------------

function grantQkitTier() {
  const dbUrl = localDemoDbUrl(process.env.DEMO_DB_URL);
  const res = spawnSync(
    "psql",
    [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      path.join(HERE, "grant-qkit-tier.sql"),
    ],
    { stdio: "inherit" },
  );
  if (res.status !== 0)
    throw new Error("psql failed upgrading the demo vendor");
}

/**
 * Unrecorded prerequisite: sign up, name the stall, create the booth(s) and
 * return the vendor's session plus the booth ids, so a scene's clip starts on
 * the interesting part.
 */
async function seedVendor(browser, scene, opts = {}) {
  const { context, page } = await openFast(browser);
  await signUp(page);
  await nameStall(page);
  await dismissTour(page);
  if (scene.pro) grantQkitTier();

  const boothIds = [];
  const names = opts.booths ?? [STALL];
  for (const name of names) {
    const id = await createBooth(page, {
      name,
      items: opts.items ?? ITEMS,
      arrival: opts.arrival,
    });
    boothIds.push(id);
  }
  if (opts.prices) await editMenu(page, boothIds[0], { prices: true });
  if (opts.payment) await enablePayment(page, boothIds[0]);
  const storageState = await context.storageState();
  await context.close();
  return { boothIds, boothId: boothIds[0], storageState };
}

/** Place a customer's order from a throwaway phone, unrecorded. */
async function backgroundOrder(browser, boothId, name, opts = {}) {
  const { context, page } = await openFast(browser);
  try {
    await customerOrder(page, boothId, { name, ...opts });
  } finally {
    await context.close();
  }
}

// Scenes -------------------------------------------------------------------
// Each receives {browser, scene, dir}; captions come from the registry.

async function tourScene({ browser, scene, dir }) {
  const C = scene.captions;
  const page = await openRecorded(browser, dir, "main");
  let boothId;

  await step(C.signup, () => signUp(page));
  await step(C.stall, () => nameStall(page));
  await step(C.guide, () => walkTour(page));
  await step(C.menu, async () => {
    boothId = await createBooth(page, { viaLink: true });
  });

  // Saving the menu already landed on the QR page.
  await step(C.qr, () => beat(2000));

  await step(C.order, () =>
    customerOrder(page, boothId, { name: CUSTOMER, customize: ["Soy"] }),
  );

  // This whole order ran with no payment configured: the pure-queue flow.
  await step(C.live, async () => {
    await openBoard(page);
    await beat(1500);
    // A walk-in orders from a second, unrecorded phone; the ticket pops in
    // live through the real realtime subscription.
    await backgroundOrder(browser, boothId, WALK_IN, { plainIndex: 0 });
    await revealTicket(page, WALK_IN);
    markPop();
    await beat(900);
    await tapTicket(page, WALK_IN, /Start now/);
    await tapTicket(page, WALK_IN, "Mark Ready");
    await beat(1100);
  });

  await step(C.payment, async () => {
    await enablePayment(page, boothId);
    await editMenu(page, boothId, { prices: true });
  });

  await step(C.pay, async () => {
    await customerOrder(page, boothId, {
      name: PAYING_CUSTOMER,
      plainIndex: 0,
      after: "pay",
    });
    await payOnPaykit(page, boothId);
  });

  await step(C.confirm, async () => {
    await openBoard(page);
    await beat(1100);
    await tapTicket(page, PAYING_CUSTOMER, /Mark paid & start/);
    await beat(900);
  });

  await step(C.fulfil, async () => {
    await tapTicket(page, PAYING_CUSTOMER, "Mark Ready");
    await tapTicket(page, PAYING_CUSTOMER, "Mark Picked Up");
    await beat(1300);
  });
}

async function setupScene({ browser, scene, dir }) {
  const C = scene.captions;
  const page = await openRecorded(browser, dir, "main");
  await step(C.signup, () => signUp(page));
  await step(C.stall, async () => {
    await nameStall(page);
    await dismissTour(page);
  });
  await step(C.menu, () => createBooth(page, { viaLink: true }));
  await step(C.qr, async () => {
    await beat(400);
    await beat(2200);
  });
}

async function livePopScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  const phone = await openRecorded(browser, dir, "customer");
  const board = await openRecorded(browser, dir, "vendor", {
    storageState: seed.storageState,
  });
  await openBoard(board);

  await step(C.open, async () => {
    await phone.goto(`${state.baseUrl}/order/${seed.boothId}`, {
      waitUntil: "domcontentloaded",
    });
    await beat(1400);
  });
  await step(C.pick, async () => {
    await glideClick(
      phone,
      phone.getByRole("button", { name: "Add", exact: true }).first(),
    );
    await beat(700);
  });
  // The ticket lands on the board before the customer's page navigates, so
  // the chime is stamped when it attaches, not when the next step starts.
  let popped;
  await step(C.order, async () => {
    await glideClick(phone, phone.getByRole("button", { name: /Continue/ }));
    await beat(700);
    const sheet = phone.getByRole("dialog");
    await slowType(phone, sheet.locator("#customerName"), CUSTOMER);
    popped = ticket(board, CUSTOMER)
      .waitFor({ state: "attached", timeout: 30000 })
      .then(markPop);
    await glideClick(phone, sheet.getByRole("button", { name: /Place order/ }));
    await phone.waitForURL(new RegExp(`/order/${seed.boothId}/\\d+`), {
      timeout: 15000,
    });
  });
  await step(C.pop, async () => {
    await popped;
    await revealTicket(board, CUSTOMER);
    await beat(2600);
  });
}

async function paynowScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, {
    prices: true,
    payment: true,
  });
  const phone = await openRecorded(browser, dir, "customer");
  const board = await openRecorded(browser, dir, "vendor", {
    storageState: seed.storageState,
  });
  await openBoard(board);

  await step(C.pay, async () => {
    await customerOrder(phone, seed.boothId, {
      name: PAYING_CUSTOMER,
      after: "pay",
    });
    await beat(1800);
  });
  await step(C.proof, () => payOnPaykit(phone, seed.boothId));
  await step(C.tap, async () => {
    await revealTicket(board, PAYING_CUSTOMER);
    markPop();
    await beat(900);
    await tapTicket(board, PAYING_CUSTOMER, /Mark paid & start/);
    await beat(2200);
  });
}

async function statusScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  // Two orders already waiting, so the customer sees a real queue position.
  await backgroundOrder(browser, seed.boothId, "Marcus");
  await backgroundOrder(browser, seed.boothId, "Dina");
  const phone = await openRecorded(browser, dir, "customer");
  const board = await openRecorded(browser, dir, "vendor", {
    storageState: seed.storageState,
  });
  await openBoard(board);

  await step(C.queue, async () => {
    await customerOrder(phone, seed.boothId, { name: CUSTOMER });
    await phone
      .getByText(/orders? ahead of you/)
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    await beat(2200);
  });
  await step(C.ready, async () => {
    await tapTicket(board, CUSTOMER, /Start now/);
    await beat(800);
    await tapTicket(board, CUSTOMER, "Mark Ready");
    await beat(600);
  });
  await step(C.seen, async () => {
    // The status page polls, so it turns over on its own.
    await phone.getByText("It's ready").first().waitFor({ timeout: 40000 });
    markPop();
    await beat(2400);
  });
}

async function tvScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  const vendor = await openFast(browser, seed.storageState);
  await backgroundOrder(browser, seed.boothId, "Marcus");
  await backgroundOrder(browser, seed.boothId, "Dina");
  await openBoard(vendor.page);
  await tapTicket(vendor.page, "Marcus", /Start now/);
  await tapTicket(vendor.page, "Dina", /Start now/);

  const tv = await openRecorded(browser, dir, "main", { viewport: TV });
  await step(C.open, async () => {
    await tv.goto(`${state.baseUrl}/order/${seed.boothId}/display`, {
      waitUntil: "domcontentloaded",
    });
    await beat(1500);
  });
  await step(C.preparing, async () => {
    await tv
      .getByRole("heading", { name: "Preparing" })
      .waitFor({ timeout: 20000 });
    await beat(2500);
  });
  await step(C.ready, async () => {
    await tapTicket(vendor.page, "Marcus", "Mark Ready");
    // The screen polls, so give it a cycle to flip the order across.
    await beat(7000);
    markPop();
  });
  await vendor.context.close();
}

async function optionsScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, { items: OPTION_ITEMS });
  const page = await openRecorded(browser, dir, "main", {
    storageState: seed.storageState,
  });
  await step(C.pick, () =>
    customerOrder(page, seed.boothId, {
      name: CUSTOMER,
      customize: ["Soy", "Less sugar"],
    }),
  );
  await step(C.ticket, async () => {
    await openBoard(page);
    await revealTicket(page, CUSTOMER);
    await center(page, ticket(page, CUSTOMER));
    markPop();
    await beat(2800);
  });
}

async function walkUpScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  const phone = await openRecorded(browser, dir, "customer");
  const board = await openRecorded(browser, dir, "vendor", {
    storageState: seed.storageState,
  });
  await openBoard(board);

  await step(C.qr, async () => {
    await customerOrder(phone, seed.boothId, { name: CUSTOMER });
    await revealTicket(board, CUSTOMER);
    markPop();
    await beat(1500);
  });
  await step(C.walkup, async () => {
    await glideClick(board, board.getByRole("button", { name: "New order" }));
    await beat(900);
    const dialog = board.getByRole("dialog");
    await glideClick(
      board,
      dialog.getByRole("button", { name: "Add", exact: true }).first(),
    );
    await slowType(board, dialog.locator("#walkup-customer-name"), WALK_IN);
    await glideClick(board, dialog.getByRole("button", { name: /^Add order/ }));
    await dialog.waitFor({ state: "hidden", timeout: 15000 });
  });
  await step(C.both, async () => {
    await revealTicket(board, WALK_IN);
    await beat(2200);
  });
}

async function batchScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  for (const name of CROWD) await backgroundOrder(browser, seed.boothId, name);
  const page = await openRecorded(browser, dir, "main", {
    storageState: seed.storageState,
  });
  await openBoard(page);

  await step(C.busy, async () => {
    await page.getByText(CROWD.at(-1), { exact: true }).first().waitFor();
    await beat(2200);
  });
  await step(C.start, async () => {
    await glideClick(page, page.getByRole("button", { name: /^Start all/ }));
    await beat(1600);
  });
  await step(C.ready, async () => {
    await glideClick(
      page,
      page.getByRole("button", { name: /^Mark all \d+ ready/ }),
    );
    await beat(1800);
  });
  await step(C.pickup, async () => {
    await glideClick(page, page.getByRole("button", { name: "Select" }));
    await beat(500);
    await glideClick(page, page.getByRole("button", { name: "Select all" }));
    await beat(600);
    await glideClick(
      page,
      page.getByRole("button", { name: /^Mark \d+ Picked Up/ }),
    );
    await beat(1800);
  });
}

async function soldOutScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, { items: PLAIN_ITEMS });
  const page = await openRecorded(browser, dir, "main", {
    storageState: seed.storageState,
  });
  await step(C.limit, () => editMenu(page, seed.boothId, { stock: { 0: 1 } }));
  await step(C.hit, () =>
    customerOrder(page, seed.boothId, { name: CUSTOMER, plainIndex: 0 }),
  );
  await step(C.menu, async () => {
    await page.goto(`${state.baseUrl}/order/${seed.boothId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Sold out").first().waitFor({ timeout: 15000 });
    await beat(2600);
  });
}

async function statsScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, { prices: true });
  const vendor = await openFast(browser, seed.storageState);
  const names = ["Marcus", "Dina", "Eli", "Faye"];
  for (const name of names) {
    await backgroundOrder(browser, seed.boothId, name, {
      plainIndex: names.indexOf(name) % 2,
    });
  }
  await openBoard(vendor.page);
  for (const name of names) await fulfil(vendor.page, name);
  await vendor.context.close();

  const page = await openRecorded(browser, dir, "main", {
    storageState: seed.storageState,
  });
  await step(C.sells, async () => {
    await page.goto(`${state.baseUrl}/dashboard/stats`, {
      waitUntil: "domcontentloaded",
    });
    await beat(2200);
  });
  await step(C.busy, async () => {
    await scrollPage(page, 700);
    await scrollPage(page, 700);
    await beat(1200);
  });
}

async function multiBoothScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, {
    booths: MULTI_BOOTHS,
    items: PLAIN_ITEMS,
  });
  const names = ["Marcus", "Dina", "Eli"];
  for (const [i, id] of seed.boothIds.entries()) {
    await backgroundOrder(browser, id, names[i]);
  }
  const page = await openRecorded(browser, dir, "main", {
    storageState: seed.storageState,
  });
  await step(C.board, async () => {
    await openBoard(page);
    await beat(2200);
  });
  await step(C.dots, async () => {
    await beat(1800);
  });
  await step(C.filter, async () => {
    await glideClick(
      page,
      page.getByRole("combobox", { name: "Filter by booth" }),
    );
    await beat(600);
    await glideClick(page, page.getByRole("option", { name: MULTI_BOOTHS[1] }));
    await beat(2200);
  });
}

async function imHereScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene, { arrival: true });
  const phone = await openRecorded(browser, dir, "customer");
  const board = await openRecorded(browser, dir, "vendor", {
    storageState: seed.storageState,
  });
  await openBoard(board);

  await step(C.order, () =>
    customerOrder(phone, seed.boothId, { name: CUSTOMER }),
  );
  await step(C.hold, async () => {
    await revealTicket(board, CUSTOMER);
    await beat(2200);
  });
  await step(C.here, async () => {
    const here = phone.getByRole("button", { name: /I.m here/ });
    await center(phone, here);
    await beat(900);
    markPop();
    await glideClick(phone, here);
    await beat(1200);
  });
  await step(C.start, async () => {
    await ticket(board, CUSTOMER)
      .getByRole("button", { name: "Mark Ready" })
      .waitFor({ state: "visible", timeout: 30000 });
    await beat(2200);
  });
}

// What this scene shows depends on merqo (vendor socials, the Telegram link),
// which a local qkit stack lacks, so each optional beat is looked for and
// skipped when absent rather than failing the recording.
async function comeBackScene({ browser, scene, dir }) {
  const C = scene.captions;
  const seed = await seedVendor(browser, scene);
  const page = await openRecorded(browser, dir, "main");
  await step(C.footer, async () => {
    await customerOrder(page, seed.boothId, { name: CUSTOMER });
    await scrollPage(page, 1200);
  });
  await step(C.telegram, async () => {
    const link = page.getByText(/Get notified on Telegram/).first();
    if (await link.isVisible().catch(() => false)) await center(page, link);
    await beat(2200);
  });

  const vendor = await openFast(browser, seed.storageState);
  await openBoard(vendor.page);
  await fulfil(vendor.page, CUSTOMER);
  await vendor.context.close();

  await step(C.reorder, async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    const again = page.getByRole("button", { name: "Reorder" });
    await again.waitFor({ timeout: 10000 }).catch(() => {});
    if (await again.isVisible().catch(() => false)) {
      await center(page, again);
      await glideClick(page, again);
    }
    await beat(2200);
  });
}

const RUNNERS = {
  tour: tourScene,
  setup: setupScene,
  "live-pop": livePopScene,
  paynow: paynowScene,
  status: statusScene,
  "tv-screen": tvScene,
  options: optionsScene,
  "walk-up": walkUpScene,
  batch: batchScene,
  "sold-out": soldOutScene,
  stats: statsScene,
  "multi-booth": multiBoothScene,
  "im-here": imHereScene,
  "come-back": comeBackScene,
};

// Run ----------------------------------------------------------------------

/** Close the recorded contexts and name each webm after its role. */
async function finishRecording(dir) {
  const out = [];
  for (const v of state.videos) {
    await v.context.close();
    const tmp = await v.page.video().path();
    const file = `${v.role}.webm`;
    fs.renameSync(tmp, path.join(dir, file));
    out.push({
      role: v.role,
      file,
      startMs: v.startMs,
      viewport: v.viewport,
    });
  }
  return out;
}

function cleanSceneDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) throw new Error(args.error);
  if (args.list || args.help) {
    console.log(
      `Usage: record.mjs [--scene <name>] [--list]\n${formatSceneList()}`,
    );
    return;
  }
  const scene = resolveScene(args.scene);
  if (scene instanceof Error) throw scene;
  const run = RUNNERS[scene.name];
  if (!run) throw new Error(`No recorder for scene "${scene.name}"`);

  state.baseUrl = localDemoBaseUrl(process.env.DEMO_BASE_URL);
  if (scene.pro) localDemoDbUrl(process.env.DEMO_DB_URL);

  const dir = path.join(OUT, scene.name);
  cleanSceneDir(dir);

  // Headed by default (crisp cursor + real rendering); DEMO_HEADLESS=1 runs it
  // headless for validation. recordVideo captures either way.
  const browser = await chromium.launch({
    headless: process.env.DEMO_HEADLESS === "1",
  });
  try {
    await run({ browser, scene, dir });
    const videos = await finishRecording(dir);
    fs.writeFileSync(
      path.join(dir, "steps.json"),
      JSON.stringify(
        {
          scene: scene.name,
          mode: scene.mode,
          hook: scene.hook,
          popMs: state.popMs,
          videos,
          steps: state.steps,
        },
        null,
        2,
      ),
    );
    console.log(`\n✓ Recorded ${videos.map((v) => v.file).join(", ")}`);
    console.log(`✓ ${state.steps.length} captioned beats, steps.json`);
    console.log(`Next: node scripts/demo/compose.mjs --scene ${scene.name}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n✗ Recording failed:", err.message);
  process.exit(1);
});
