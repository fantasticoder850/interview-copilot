import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Point every test at the `<db>_test` database before the pool is imported.
    // Harmless for unit tests (they never touch the database).
    setupFiles: ["./src/__tests__/integration/setup-env.ts"],
    // Serialize files so integration tests don't truncate each other's data.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
