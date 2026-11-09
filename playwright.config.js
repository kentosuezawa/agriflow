import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, retries: 0,
  use: { baseURL: process.env.E2E_URL || 'http://127.0.0.1:3138', viewport: { width: 390, height: 844 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure' },
  webServer: process.env.E2E_URL ? undefined : {
    command: 'node src/server.js', url: 'http://127.0.0.1:3138', reuseExistingServer: false,
    env: { PORT: '3138', AGRIFLOW_DATA_FILE: process.env.E2E_DATA_FILE || '/tmp/agriflow-e2e.json' }
  }
});
