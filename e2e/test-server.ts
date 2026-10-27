/**
 * Backend for the end-to-end tests: the real app, with phone.email's JSON
 * endpoint replaced by a stub (the browser side is stubbed in the tests).
 * `user_<anything>.json` verifies jane@example.com; `user_rejected-*.json` fails.
 */
import { createApp } from "../server/src/app.js";
import { loadConfig } from "../server/src/config.js";

const fakePhoneEmail: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname.startsWith("/user_rejected")) return new Response("{}", { status: 404 });
  return Response.json({ user_email_id: "jane@example.com" });
};

const config = loadConfig(process.env);
createApp({ config, fetchImpl: fakePhoneEmail }).listen(config.port, () => {
  console.log(`e2e server on http://localhost:${config.port}`);
});
