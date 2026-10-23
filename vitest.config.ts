import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@backend\//, replacement: `${path.join(here, "src")}/` },
      { find: /^@\//, replacement: `${path.join(here, "src", "shared")}/` },
    ],
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"], globals: true },
});
