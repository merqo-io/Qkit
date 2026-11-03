import http from "node:http";

// Stand-in for the three merqo endpoints qkit calls over HTTP
// (src/lib/merqo/customer-notify.ts), so the order page can render the
// "Get notified on Telegram" beat on a local stack. The vendor socials need no
// mock: they are read from the database, not over HTTP.

const MERQO_MOCK_PORT = 4320;
const MERQO_MOCK_SECRET = "demo-merqo-secret";
const MERQO_MOCK_DEEP_LINK = "https://t.me/merqo_demo_bot?start=demo";

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

function startMerqoMock() {
  const server = http.createServer(async (req, res) => {
    await readBody(req);
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${MERQO_MOCK_SECRET}`) {
      return send(401, { error: "unauthorized" });
    }
    if (
      req.method === "POST" &&
      req.url === "/api/merqo/customer-connect-token"
    ) {
      return send(200, {
        token: "demo-connect-token",
        deep_link: MERQO_MOCK_DEEP_LINK,
      });
    }
    if (
      req.method === "POST" &&
      (req.url === "/api/merqo/notify-customer" ||
        req.url === "/api/merqo/notify-vendor")
    ) {
      return send(200, { ok: true });
    }
    return send(404, { error: "not found" });
  });
  return { server };
}

{
  const { server } = startMerqoMock();
  server.listen(MERQO_MOCK_PORT, "127.0.0.1", () => {
    console.log(
      `merqo mock on http://127.0.0.1:${MERQO_MOCK_PORT} (customer secret ${MERQO_MOCK_SECRET})`,
    );
  });
}
