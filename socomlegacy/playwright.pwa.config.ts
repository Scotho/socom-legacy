import { defineConfig, devices } from '@playwright/test';

/**
 * PWA-7, off the default e2e config: that one waits on `/maps/index.json`, and this host has no disc. The server is
 * `packages/viewer/pwa-e2e/server.ts` on 5319 (the agent's range; never 5173, 5181, 5301, 5302, 8787 or 8797).
 */
const PORT = process.env.PWA_E2E_PORT ?? '5319';

export default defineConfig({
  testDir: 'packages/viewer/pwa-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx packages/viewer/pwa-e2e/server.ts',
    url: `http://127.0.0.1:${PORT}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PWA_E2E_PORT: PORT },
  },
});
