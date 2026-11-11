import { defineConfig, devices } from "@playwright/test";

const PORT = 3311;
// E2E runs the production build in demo mode against recorded 1Click quotes: offline and deterministic.
const env = {
  ANYTILL_MODE: "demo",
  ONECLICK_SOURCE: "recorded",
  DEMO_SETTLE_MS: "2500",
  DATABASE_URL: "file:./e2e.sqlite",
  PORT: String(PORT),
  NODE_ENV: "production",
};

export default defineConfig({
  timeout: 30_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "unit", testDir: "tests/unit" },
    { name: "e2e", testDir: "tests/e2e", testIgnore: /screens/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testDir: "tests/e2e", testMatch: /checkout\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "screens", testDir: "tests/e2e", testMatch: /screens\.spec/, use: { ...devices["Desktop Chrome"] } },
  ],
  // Unit tests need no server; only browser projects start one.
  webServer: process.env.PW_NO_SERVER || process.argv.join(" ").match(/--project[= ]unit(\s|$)/) && !process.argv.join(" ").match(/--project[= ](e2e|mobile|screens)/)
    ? undefined
    : {
        command: `rm -f prisma/e2e.sqlite* && prisma migrate deploy && react-router-serve ./build/server/index.js`,
        url: `http://localhost:${PORT}/api/v1/assets`,
        env,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
