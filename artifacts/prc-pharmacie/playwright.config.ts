import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "pnpm run dev",
    cwd: import.meta.dirname,
    env: { PORT: port, BASE_PATH: "/" },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
