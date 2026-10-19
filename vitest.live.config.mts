import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Live tests send real images to the Claude API (costs a few cents per image).
// Run with: npm run test:live   (reads ANTHROPIC_API_KEY from .env.local)
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
