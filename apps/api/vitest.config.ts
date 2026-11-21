import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      PAYMENTS_MODE: "mock_escrow",
      OTP_PROVIDER: "console",
      STORAGE_BACKEND: "local",
      VAPID_PUBLIC_KEY:
        "BCArfHXexFfEUBVRdfqh2zkirDK0wzDlinNBDuBpdtQZQFd3RllojnequFb2Z8Frk5YvD7hbVBSedaKcSLATYdI",
      VAPID_PRIVATE_KEY: "sdGRG9KMYsyOykycHIsGOfYmIUf1YkJD7EtjWmzQ0j4",
      VAPID_SUBJECT: "mailto:test@hojiigo.local",
    },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
