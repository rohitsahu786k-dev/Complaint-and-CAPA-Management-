import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Heavy third-party libraries are pinned to their own chunks. Left alone, Rollup folds
 * anything reachable from the eager entry graph into the entry chunk, so a single page
 * that used charts or PDFs made every visitor -- including someone still on the login
 * screen -- download that library first.
 *
 * Only node_modules paths are listed. Pinning our own wrappers here would pull the shared
 * UI helpers they import (cn, format, Field, lucide icons) out of the entry chunk and into
 * a vendor chunk, which just makes the entry depend on that vendor chunk again.
 *
 * The preload helper is pinned on purpose: it is a virtual module that every chunk doing a
 * dynamic import needs, so whichever chunk Rollup parks it in becomes a static dependency
 * of the entry. Left to itself it landed in the jsPDF chunk and dragged 400 kB with it.
 *
 * Module ids arrive POSIX-normalised, so these patterns use forward slashes on Windows too.
 */
const CHUNKS: { name: string; match: RegExp }[] = [
  { name: "react", match: /vite\/preload-helper/ },
  {
    name: "charts",
    match: /\/node_modules\/(recharts|recharts-scale|victory-vendor|d3-[a-z-]+|internmap|react-smooth|decimal\.js-light|lodash)\//
  },
  { name: "xlsx", match: /\/node_modules\/xlsx\// },
  // html2canvas/dompurify/canvg are deliberately left out: jsPDF imports them dynamically,
  // so Rollup already emits them as chunks that a table-only PDF never fetches.
  { name: "pdf", match: /\/node_modules\/(jspdf|jspdf-autotable)\// },
  { name: "react", match: /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\// }
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url))
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => CHUNKS.find((chunk) => chunk.match.test(id))?.name
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:4000"
    }
  }
});
