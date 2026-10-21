import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Database tests share one Postgres, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
