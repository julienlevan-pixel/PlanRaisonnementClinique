import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "pnpm run dev",
    cwd: import.meta.dirname,
    env: { PORT: "4173", BASE_PATH: "/" },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
