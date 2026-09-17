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
    // Front-end helpers that hold real logic are tested too; they stay DOM-free.
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "src/**/*.test.ts"]
  }
});
