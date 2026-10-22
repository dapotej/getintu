import { defineConfig, devices } from "@playwright/test";
import { E2E_PARTNER_SESSION_SECRET, E2E_QR_SIGNING_KEY } from "./e2e/support/keys";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu";
const API_PORT = 8789;
const SCANNER_PORT = 3002;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${SCANNER_PORT}`,
    trace: "retain-on-failure",
    // A mid-range Android phone; a fake camera so the scanner screen opens.
    ...devices["Pixel 7"],
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
        SUPABASE_URL: "http://supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "e2e-not-a-real-key",
        CORS_ORIGINS: `http://localhost:${SCANNER_PORT}`,
        QR_SIGNING_KEY: E2E_QR_SIGNING_KEY,
        PARTNER_SESSION_SECRET: E2E_PARTNER_SESSION_SECRET,
      },
    },
    {
      command: "pnpm build && pnpm start",
      url: `http://localhost:${SCANNER_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: { NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
