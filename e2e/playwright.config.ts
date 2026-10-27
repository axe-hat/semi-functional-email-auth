import { defineConfig, devices } from "@playwright/test";

// Ports away from the dev defaults (4000/5173) so a running dev setup isn't reused.
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
// E2E_BASE_URL: test an already-running deployment (e.g. the Docker images, see
// docker-compose.e2e.yml) instead of starting the test server and Vite.
const EXTERNAL_WEB = process.env.E2E_BASE_URL;
const WEB = EXTERNAL_WEB ?? `http://localhost:${WEB_PORT}`;
const browsers = (process.env.E2E_BROWSERS ?? "chromium").split(",");

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ].filter((project) => browsers.includes(project.name)),
  webServer: EXTERNAL_WEB
    ? undefined
    : [
        {
          command: "../server/node_modules/.bin/tsx test-server.ts",
          port: API_PORT,
          env: {
            PORT: String(API_PORT),
            CORS_ORIGIN: WEB,
            COOKIE_SECURE: "false",
            // Every test signs in from the same IP; keep the per-IP limit out of the way.
            RATE_LIMIT_PER_MINUTE: "1000",
          },
          reuseExistingServer: false,
        },
        {
          command: `npm --prefix ../demo run dev -- --port ${WEB_PORT} --strictPort`,
          port: WEB_PORT,
          env: {
            API_URL: `http://localhost:${API_PORT}`,
            VITE_PHONE_EMAIL_CLIENT_ID: "e2e-client",
          },
          reuseExistingServer: false,
        },
      ],
});
