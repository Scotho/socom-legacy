import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "forge-agent-protocol",
    include: ["test/**/*.test.ts"],
    maxWorkers: 2,
  },
});
