import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the single-file build works from any path (file://, GitHub Pages, S3…).
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Required for cloud dev sandboxes / tunnels / LAN testing on phones.
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  build: {
    // Inline fonts and textures so the single-file build is fully offline-capable.
    assetsInlineLimit: 1024 * 1024,
    chunkSizeWarningLimit: 2048,
    target: "es2022",
  },
  test: {
    // Pure-logic tests run in node; component smoke tests opt into happy-dom
    // with a per-file `@vitest-environment` docblock.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
