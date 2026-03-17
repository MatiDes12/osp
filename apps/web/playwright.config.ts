import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: process.env["CI"] === "true",
  retries: process.env["CI"] === "true" ? 2 : 0,
  workers: process.env["CI"] === "true" ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3001",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  webServer: {
    command: "NEXT_PUBLIC_DISABLE_ACTION_LOG=1 corepack pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: process.env["CI"] !== "true",
    timeout: 120_000,
  },
});
