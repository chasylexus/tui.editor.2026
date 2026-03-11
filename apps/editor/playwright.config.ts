import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command:
      'sh -lc "npm --workspace plugins/chart run build && npm --workspace plugins/katex run build && npm --workspace apps/editor run serve"',
    cwd: repoRoot,
    port: 8080,
    reuseExistingServer: true,
    timeout: 300000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },
  ],
});
