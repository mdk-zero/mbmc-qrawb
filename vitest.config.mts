import { defineConfig } from "vitest/config";
import path from "node:path";

const shared = {
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/setup/db-env.ts"],
          globalSetup: ["tests/global/db.ts"],
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
