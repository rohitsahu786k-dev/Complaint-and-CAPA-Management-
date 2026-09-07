import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@server": fileURLToPath(new URL("./server", import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"]
  }
});
