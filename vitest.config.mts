import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws on import outside a Server Component, which is the
      // whole point of it — and which would make the server modules untestable.
      // Vitest gets the same empty module React hands the server build.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The sync integration test boots an in-process Postgres per case.
    testTimeout: 30_000,
  },
});
