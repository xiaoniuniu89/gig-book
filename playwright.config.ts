import { defineConfig } from "@playwright/test";
import { ANON_KEY, SB_URL, SERVICE_KEY } from "./tests/env";

// End-to-end: a production build pointed at the local Supabase, driven in Chromium on a desktop and a phone viewport.
// Start Supabase first (`npx supabase start`); the seed runs in globalSetup.
const PORT = 3000;
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/globalSetup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // the flows share one database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_SUPABASE_URL: SB_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY },
  },
});
