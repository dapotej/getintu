import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Database tests can be slow on a busy CI machine; match packages/db.
    testTimeout: 20_000,
  },
});
