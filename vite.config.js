import { defineConfig } from "vite";

// Relative base so the build works at https://<user>.github.io/<repo>/
export default defineConfig({
  base: "./",
  test: { include: ["tests/**/*.test.js"], testTimeout: 60000 },
});
