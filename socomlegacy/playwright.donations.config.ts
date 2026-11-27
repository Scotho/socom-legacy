import { defineConfig, devices } from '@playwright/test';

// Hosting donations are a launcher adaptation. No disc, match or payment provider is needed by these checks.
const port = Number(process.env['E2E_PORT'] ?? 5367);
export default defineConfig({
  testDir: './packages/viewer/e2e',
  testMatch: 'donations.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'logs/donations-browser',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env['PW_CHROMIUM'] || undefined },
  },
  webServer: {
    command: `node ../node_modules/vite/bin/vite.js --config packages/viewer/vite.config.ts --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_S2U_ROOMS: 'off', VITE_S2U_LOCAL_PORT: '8867' },
  },
});
