import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production server (`npm run build` first)
// with a test password. The roster-reading call is answered in the browser
// with a recorded reply, so these tests never call the Claude API. The
// iPhone project uses Chromium's mobile emulation, not real Safari.
const PORT = 3210;
export const E2E_PASSWORD = "e2e-test-password";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 }, browserName: "chromium" } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { APP_PASSWORD: E2E_PASSWORD, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" }, // no real keys: the reading call is answered in the browser
  },
});
