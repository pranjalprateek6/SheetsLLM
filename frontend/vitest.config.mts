import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@/..." path alias in tsconfig.json.
    alias: { "@": root },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      // Relative fetches such as "/api/files" need an origin to resolve
      // against, and msw matches path-only handlers against it.
      jsdom: { url: "http://localhost:3000" },
    },
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    css: false,
  },
});
