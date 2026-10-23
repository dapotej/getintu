import { defineConfig, devices } from "@playwright/test";
import { E2E_PUBLIC_JWK } from "./e2e/support/keys";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu";
const API_PORT = 8788;
const ADMIN_PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${ADMIN_PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Use a preinstalled Chromium when one is provided (e.g. cloud dev containers).
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: [
    {
      // The real API, trusting the throwaway e2e key instead of Supabase's.
      command: "pnpm --filter @intu/api start",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL,
        SUPABASE_URL: "http://supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "e2e-not-a-real-key",
        TEST_JWKS_JSON: JSON.stringify({ keys: [E2E_PUBLIC_JWK] }),
        CORS_ORIGINS: `http://localhost:${ADMIN_PORT}`,
        // A throwaway key for encrypting TEST bank details (32 bytes of zeros), never a real one.
        BANK_DETAILS_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    },
    {
      command: `pnpm build && pnpm start`,
      url: `http://localhost:${ADMIN_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
      },
    },
  ],
});
