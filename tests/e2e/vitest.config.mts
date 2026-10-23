import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 1,
    retry: 0,
  },
});
