/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "**/*.d.ts",
      ],
    },
  },
});
