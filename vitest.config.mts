import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

// unit: pure code, no services. access: real supabase-js clients against a local Supabase that `npm run seed` filled.
export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "access", include: ["tests/access/**/*.test.ts"], environment: "node",
          globalSetup: ["tests/access/globalSetup.ts"], setupFiles: ["tests/access/setup.ts"],
          testTimeout: 30000, hookTimeout: 60000, fileParallelism: false,
        },
      },
    ],
  },
});
