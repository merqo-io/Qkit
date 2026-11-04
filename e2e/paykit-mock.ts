import { createServer, type Server, type ServerResponse } from "node:http";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "react-qr-code";

// Minimal stand-in for paykit's live `/api/v1/checkout*` surface (see
// src/lib/paykit/client.ts), so e2e can exercise the real checkout-cutover
// code path without a real paykit deployment. CI's e2e job spins up qkit's
// own local Supabase but has nothing listening at NEXT_PUBLIC_PAYKIT_URL —
// this fills that gap for the two order specs that render the pay panel.
// Started once from e2e/global-setup.ts, on a fixed local port referenced by
// playwright.config.ts's webServer.env; global-setup.ts's returned close()
// is used by Playwright as the matching global teardown.
//
// Response shapes mirror paykit's real contract (checkoutResponseSchema /
// transactionStatusResponseSchema in src/lib/paykit/client.ts) closely enough
// for qkit's zod validation to accept them — not a full paykit re-implementation.
export const PAYKIT_MOCK_PORT = 4319;
export const PAYKIT_MOCK_URL = `http://127.0.0.1:${PAYKIT_MOCK_PORT}`;
export const PAYKIT_MOCK_SECRET = "e2e-mock-secret";

// The app's port. 3000 unless E2E_PORT says otherwise, for a machine where
// something else already holds 3000 (playwright.config.ts reads it too).
export const E2E_PORT = process.env.E2E_PORT ?? "3000";
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

type MockStatus = "pending" | "claimed" | "confirmed";

interface MockTransaction {
  id: string;
  orderRef: string;
  vendorId: string;
  amountCents: number;
  status: MockStatus;
  claimedAt: string | null;
  confirmedAt: string | null;
  // Where the stub pay page sends the customer once they have paid, as the
  // calling kit gave it. Null for a checkout created without one.
  returnUrl: string | null;
  // When the calling kit gives up on the order. Like paykit, the first value
  // stored for an order is kept on a replay.
  expiresAt: string | null;
}

// Real paykit calls qkit back after a claim or confirm commits (see
// src/app/api/paykit/payment-status/route.ts). The mock does the same, so
// e2e runs the customer's own claim and the callback against one order at
// the same moment, as production does.
export const PAYKIT_MOCK_CALLBACK_SECRET = "e2e-mock-callback-secret";
const QKIT_CALLBACK_URL = `${E2E_BASE_URL}/api/paykit/payment-status`;

function fireCallback(tx: MockTransaction) {
  void fetch(QKIT_CALLBACK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYKIT_MOCK_CALLBACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_ref: tx.orderRef,
      transaction_id: tx.id,
      status: tx.status,
    }),
  }).catch(() => undefined);
}

function statusBody(tx: MockTransaction) {
  return {
    transaction_id: tx.id,
    status: tx.status,
    amount_cents: tx.amountCents,
    order_ref: tx.orderRef,
    vendor_id: tx.vendorId,
    claimed_at: tx.claimedAt,
    confirmed_at: tx.confirmedAt,
    expires_at: tx.expiresAt,
  };
}

type Send = (status: number, body: unknown) => void;

/** In-memory transaction store, shared by every route handler below. */
class MockStore {
  // Dedupe on order_ref, same as paykit's real (kit_slug, order_ref)
  // uniqueness — a repeat createCheckout for the same order returns the same
  // transaction.
  private byOrderRef = new Map<string, MockTransaction>();
  private byId = new Map<string, MockTransaction>();
  private nextId = 1;

  getById(id: string): MockTransaction | undefined {
    return this.byId.get(id);
  }

  getByOrderRef(orderRef: string): MockTransaction | undefined {
    return this.byOrderRef.get(orderRef);
  }

  getOrCreate(
    orderRef: string,
    vendorId: string,
    {
      amountCents,
      returnUrl,
      expiresAt,
    }: {
      amountCents: number;
      returnUrl: string | null;
      expiresAt: string | null;
    },
  ): MockTransaction {
    let tx = this.byOrderRef.get(orderRef);
    if (!tx) {
      tx = {
        id: `mock-tx-${this.nextId++}`,
        orderRef,
        vendorId,
        amountCents,
        status: "pending",
        claimedAt: null,
        confirmedAt: null,
        returnUrl,
        expiresAt,
      };
      this.byOrderRef.set(orderRef, tx);
      this.byId.set(tx.id, tx);
    } else if (returnUrl) tx.returnUrl = returnUrl;
    return tx;
  }
}

function handleCreateCheckout(store: MockStore, chunks: Buffer[], send: Send) {
  let parsed: {
    order_ref?: string;
    vendor_id?: string;
    amount_cents?: number;
    return_url?: string;
    expires_at?: string | null;
  };
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    send(400, { error: "invalid JSON" });
    return;
  }
  const orderRef = parsed.order_ref;
  if (!orderRef) {
    send(400, { error: "order_ref is required" });
    return;
  }
  if (!parsed.vendor_id) {
    send(400, { error: "vendor_id is required" });
    return;
  }
  const tx = store.getOrCreate(orderRef, parsed.vendor_id, {
    amountCents: parsed.amount_cents ?? 0,
    returnUrl: parsed.return_url ?? null,
    expiresAt: parsed.expires_at ?? null,
  });
  // PayNow QR payload — any non-empty string satisfies the client's schema;
  // content isn't asserted on by the e2e specs.
  send(200, {
    type: "qr",
    transaction_id: tx.id,
    status: tx.status,
    payload: `MOCKPAYNOW:${tx.id}`,
    expires_at: tx.expiresAt,
    ...(tx.returnUrl
      ? { pay_url: `${PAYKIT_MOCK_URL}/pay/${tx.id}?k=mock` }
      : {}),
  });
}

// What the customer's "I've paid" does on paykit's page: claim the
// transaction, tell the calling kit, and send the customer back to it. The
// mock takes no screenshot and keeps no file.
function claimTransaction(tx: MockTransaction) {
  if (tx.status !== "pending") return;
  tx.status = "claimed";
  tx.claimedAt = new Date().toISOString();
  fireCallback(tx);
}

type QrProps = { value: string; size: number };
// Node's native ESM wraps this CJS package, so the component can sit on .default.
const qrModule = QRCode as unknown as ComponentType<QrProps> & {
  default?: ComponentType<QrProps>;
};
const QrComponent: ComponentType<QrProps> = qrModule.default ?? qrModule;

// Mirrors the layout and palette of paykit's hosted PayNow page (heading,
// amount, QR, save button, screenshot upload, "I've paid") so demo footage
// reads as the real flow. The upload is optional here because the mock keeps
// no file and e2e submits the form without one.
function payPageHtml(tx: MockTransaction): string {
  const qr = renderToStaticMarkup(
    createElement(QrComponent, { value: `MOCKPAYNOW:${tx.id}`, size: 200 }),
  );
  const amount = `S$${(tx.amountCents / 100).toFixed(2)}`;
  const css = `
    *{box-sizing:border-box}
    body{margin:0;background:#f3efe3;color:#1d2321;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    main{max-width:420px;margin:0 auto;padding:28px 24px;text-align:center}
    h1{font-family:Fraunces,Georgia,serif;font-size:20px;font-weight:600;margin:0 0 6px;text-wrap:balance}
    .sub{font-size:14px;color:#737373;margin:0}
    .amount{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;font-size:30px;font-weight:700;margin:20px 0}
    .qr{display:inline-block;background:#fff;padding:16px;border-radius:12px}
    .qr svg{display:block}
    .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:48px;border-radius:12px;border:1px solid #dcdcdc;background:transparent;color:#1d2321;font:600 14px inherit;font-family:inherit;cursor:pointer}
    .btn.small{width:auto;height:44px;margin:14px auto 0;padding:0 18px}
    .btn.primary{background:#2f6b5e;border-color:#2f6b5e;color:#f3efe3}
    .hint{font-size:12px;color:#737373;margin:10px auto 0;max-width:300px}
    .stack{display:grid;gap:10px;margin-top:22px}
    input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
  `;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pay</title><style>${css}</style></head><body><main><h1>Scan with your PayNow banking app to pay</h1><p class="sub">Sunrise Coffee Cart</p><p class="amount">${amount}</p><div class="qr">${qr}</div><button type="button" class="btn small">Save QR image</button><p class="hint">On this phone? Save the QR, then open your banking app and scan it from your photos.</p><form method="post" action="/pay/${tx.id}/claim?k=mock" class="stack"><input id="payment-proof" type="file" accept="image/*"><label for="payment-proof" class="btn" id="proof-label">Upload payment screenshot</label><button type="submit" class="btn primary">I've paid</button><p class="hint">The seller checks your screenshot, then you go back to your order.</p></form><script>document.getElementById("payment-proof").addEventListener("change",function(e){var f=e.target.files[0];if(f){document.getElementById("proof-label").textContent="Screenshot attached: "+f.name}})</script></main></body></html>`;
}

function handleConfirm(store: MockStore, id: string, send: Send) {
  const tx = store.getById(id);
  if (!tx) {
    send(404, { error: "Not found" });
    return;
  }
  const changed = tx.status !== "confirmed";
  if (changed) {
    tx.status = "confirmed";
    tx.confirmedAt = new Date().toISOString();
  }
  send(200, statusBody(tx));
  if (changed) fireCallback(tx);
}

function handleStatus(store: MockStore, id: string, send: Send) {
  const tx = store.getById(id);
  if (!tx) {
    send(404, { error: "Not found" });
    return;
  }
  send(200, statusBody(tx));
}

// `GET /api/v1/checkout/{id}/evidence`. The mock holds no screenshot, reports
// no duplicate and, like real paykit today, does not check the amount.
function handleEvidence(store: MockStore, id: string, send: Send) {
  if (!store.getById(id)) {
    send(404, { error: "Not found" });
    return;
  }
  send(200, {
    proof_url: null,
    signals: { duplicate_of: null, amount_match: null },
  });
}

function handleLookup(store: MockStore, orderRef: string | null, send: Send) {
  if (!orderRef) {
    send(400, { error: "order_ref is required" });
    return;
  }
  const tx = store.getByOrderRef(orderRef);
  if (!tx) {
    send(404, { error: "Not found" });
    return;
  }
  send(200, statusBody(tx));
}

// A vendor with PayNow on file, whatever the vendor id. It unlocks the booth
// form's "Take payment" switch; no e2e spec depends on that switch being locked.
const DEMO_VENDOR_CONFIG = {
  has_config: true,
  display_name: "Kopitiam Cart",
  kind: "paynow",
  payee_name: "Kopitiam Cart Pte Ltd",
  uen: null,
  mobile: "91234567",
  label: null,
  url: null,
  qr_image_url: null,
};

/** Handles the JSON API routes; false when the path is not one of them. */
function handleApi(
  store: MockStore,
  { method, url, chunks }: { method: string; url: URL; chunks: Buffer[] },
  send: Send,
): boolean {
  if (
    method === "GET" &&
    /^\/api\/v1\/vendors\/[^/]+\/config$/.test(url.pathname)
  ) {
    send(200, DEMO_VENDOR_CONFIG);
    return true;
  }
  if (url.pathname === "/api/v1/checkout") {
    if (method === "POST") handleCreateCheckout(store, chunks, send);
    else if (method === "GET")
      handleLookup(store, url.searchParams.get("order_ref"), send);
    else return false;
    return true;
  }
  const confirmMatch = /^\/api\/v1\/checkout\/([^/]+)\/confirm$/.exec(
    url.pathname,
  );
  const evidenceMatch = /^\/api\/v1\/checkout\/([^/]+)\/evidence$/.exec(
    url.pathname,
  );
  const statusMatch = /^\/api\/v1\/checkout\/([^/]+)$/.exec(url.pathname);
  if (method === "GET" && evidenceMatch) {
    handleEvidence(store, evidenceMatch[1], send);
  } else if (method === "POST" && confirmMatch) {
    handleConfirm(store, confirmMatch[1], send);
  } else if (method === "GET" && statusMatch) {
    handleStatus(store, statusMatch[1], send);
  } else {
    return false;
  }
  return true;
}

/** Handles the hosted pay page and its claim; false when the path is not one of them. */
function handlePay(
  store: MockStore,
  method: string,
  url: URL,
  res: ServerResponse,
): boolean {
  const payMatch = /^\/pay\/([^/]+)$/.exec(url.pathname);
  const payClaimMatch = /^\/pay\/([^/]+)\/claim$/.exec(url.pathname);
  const payTx = store.getById((payMatch ?? payClaimMatch)?.[1] ?? "");
  if (method === "GET" && payMatch && payTx) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(payPageHtml(payTx));
    return true;
  }
  if (method === "POST" && payClaimMatch && payTx) {
    claimTransaction(payTx);
    res.writeHead(303, { Location: payTx.returnUrl ?? "/" });
    res.end();
    return true;
  }
  return false;
}

export function startPaykitMock(): {
  server: Server;
  close: () => Promise<void>;
} {
  const store = new MockStore();

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", PAYKIT_MOCK_URL);
      const send: Send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };

      const method = req.method ?? "GET";
      if (
        handleApi(store, { method, url, chunks }, send) ||
        handlePay(store, method, url, res)
      )
        return;

      send(404, { error: "Not found" });
    });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
