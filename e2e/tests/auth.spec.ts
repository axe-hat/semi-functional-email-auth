import { expect, test, type Page } from "@playwright/test";

/**
 * Stand-in for phone.email's widget script. Like the real one, each run draws
 * a button into the FIRST \`.pe_verify_email\` element only; clicking it
 * "verifies" and calls \`phoneEmailReceiver\`, as the real widget does after
 * the user enters the emailed code.
 */
const FAKE_WIDGET = `{
  const el = document.querySelector(".pe_verify_email");
  el.innerHTML = '<button type="button">Sign in with Email</button>';
  el.firstChild.onclick = () => window.phoneEmailReceiver({
    user_json_url: "https://user.phone.email/user_" + (window.__peId || crypto.randomUUID()) + ".json",
    user_email_id: "jane@example.com",
  });
}`;

test.beforeEach(async ({ page }) => {
  await page.route("https://www.phone.email/verify_email_v1.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_WIDGET }),
  );
});

/** Makes the fake widget report this verification ID (unique per test run). */
async function useVerificationId(page: Page, id: string) {
  await page.evaluate((value) => ((window as unknown as { __peId: string }).__peId = value), id);
}

async function verifyEmail(page: Page) {
  await page.getByRole("button", { name: "Sign in with Email" }).click();
  await expect(page.getByText("Signed in as jane@example.com")).toBeVisible();
}

test("signs in with email, keeps the session across reloads, and signs out", async ({ page }) => {
  await page.goto("/");
  await verifyEmail(page);

  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain("session");

  await page.reload();
  await expect(page.getByText("Signed in as jane@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Email" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in with Email" })).toBeVisible();
});

test("the button comes back after sign-out, without a reload", async ({ page }) => {
  await page.goto("/");
  await verifyEmail(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await verifyEmail(page);
});

test("a verification URL can't be used twice", async ({ page }) => {
  const id = `replayed-${crypto.randomUUID()}`;
  await page.goto("/");
  await useVerificationId(page, id);
  await verifyEmail(page);

  // Someone who copied the URL (from logs, history, a proxy) tries to reuse it.
  const replay = await page.request.post("/create-token", {
    data: { user_json_url: `https://user.phone.email/user_${id}.json` },
  });
  expect(replay.status()).toBe(409);
  expect(replay.headers()["set-cookie"]).toBeUndefined();
});

test("a verification phone.email doesn't confirm is refused", async ({ page }) => {
  await page.goto("/");
  await useVerificationId(page, `rejected-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Sign in with Email" }).click();
  await expect(page.getByRole("alert")).toHaveText(/could not be confirmed/);
});

test("adds a passkey, then signs in with it without email", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The virtual authenticator is a Chromium DevTools feature");
  // Chromium's virtual authenticator stands in for Touch ID / Windows Hello.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto("/");
  await verifyEmail(page);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByText("Signed in as jane@example.com")).toBeVisible();
});

test("refuses API calls from another origin", async ({ request }) => {
  const res = await request.post("/logout", { headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});
