import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.ts";

const base = { DATABASE_URL: "postgres://x@localhost/intu", SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };

describe("loadEnv", () => {
  it("refuses a test key set outside tests", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", TEST_JWKS_JSON: "{}" })).toThrow(/only allowed when NODE_ENV=test/);
    expect(loadEnv({ ...base, NODE_ENV: "test", TEST_JWKS_JSON: "{}" }).TEST_JWKS_JSON).toBe("{}");
  });

  it("requires the Supabase settings", () => {
    expect(() => loadEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow();
  });
});
