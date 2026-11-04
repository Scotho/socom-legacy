import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "creator-contracts",
    include: ["test/**/*.test.ts"],
    maxWorkers: 2,
  },
});
