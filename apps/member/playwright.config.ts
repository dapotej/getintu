import { defineConfig, devices } from "@playwright/test";
import { E2E_PUBLIC_JWK, E2E_QR_SIGNING_KEY } from "./e2e/support/keys";
import { FAKE_SUPABASE_URL } from "./e2e/support/fake-supabase";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu";
const API_PORT = 8790;
const APP_PORT = 3003;

// The member app's web build against the real API and a local database. The phone builds share
// every screen and all the logic; Maestro flows cover them on a device (see .maestro/).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    ...devices["iPhone 13"],
    browserName: "chromium",
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: [
    {
      command: "pnpm --filter @intu/api start",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL,
        SUPABASE_URL: FAKE_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: "e2e-not-a-real-key",
        TEST_JWKS_JSON: JSON.stringify({ keys: [E2E_PUBLIC_JWK] }),
        CORS_ORIGINS: `http://localhost:${APP_PORT}`,
        QR_SIGNING_KEY: E2E_QR_SIGNING_KEY,
        PHOTO_STORE: "memory",
        CONCIERGE_WHATSAPP: "+2348000000001",
        // No provider keys: payments use the API's own TEST page.
        API_PUBLIC_URL: `http://localhost:${API_PORT}`,
      },
    },
    {
      command: "pnpm build:web && pnpm start",
      url: `http://localhost:${APP_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: { CI: "1", EXPO_NO_TELEMETRY: "1", EXPO_PUBLIC_API_URL: `http://localhost:${API_PORT}`, EXPO_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key" },
    },
  ],
});
