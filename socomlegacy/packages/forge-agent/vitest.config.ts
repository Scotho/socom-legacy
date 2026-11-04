import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "forge-agent",
    include: ["test/**/*.test.ts"],
    maxWorkers: 2,
    testTimeout: 30000,
  },
});
