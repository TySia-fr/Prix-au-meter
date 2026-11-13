import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } },
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/search?q=mo`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { E2E: "1", BETTER_AUTH_URL: `http://localhost:${PORT}` },
  },
});
