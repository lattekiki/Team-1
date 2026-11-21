import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    env: { NODE_ENV: "test", PAYMENTS_MODE: "mock_escrow", OTP_PROVIDER: "console" },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
