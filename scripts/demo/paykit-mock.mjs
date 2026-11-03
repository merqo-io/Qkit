import {
  PAYKIT_MOCK_PORT,
  PAYKIT_MOCK_SECRET,
  startPaykitMock,
} from "../../e2e/paykit-mock.ts";

// Keeps the e2e paykit stand-in up for the demo recorder, which has no real
// paykit to talk to. Node 24 strips the types from the .ts import.
const { server } = startPaykitMock();
server.listen(PAYKIT_MOCK_PORT, "127.0.0.1", () => {
  console.log(
    `paykit mock on http://127.0.0.1:${PAYKIT_MOCK_PORT} (kit secret ${PAYKIT_MOCK_SECRET})`,
  );
});
