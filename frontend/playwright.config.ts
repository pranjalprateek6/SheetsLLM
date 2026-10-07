import { defineConfig, devices } from "@playwright/test";

/* End-to-end runs against the real Next.js app.

   Public specs need only the frontend. Specs that drive the backend (the API
   loop, the signed-in workspace) are gated on E2E_BACKEND=1 and expect a
   backend on :8000 started with LLM_PROVIDER=fake and ALLOW_ANONYMOUS=true,
   so no run ever spends a Gemini call.

   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of the
   bundled Chromium; useful where the bundled build cannot launch. */

const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
