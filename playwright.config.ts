import { defineConfig, devices } from '@playwright/test';

/**
 * APIS Playwright Configuration
 *
 * Two projects:
 * - api: Pure API tests (no browser, fast, P0/P1 contract validation)
 * - e2e: End-to-end browser tests (critical user journeys)
 *
 * Run: npx playwright test --project=api
 * Run: npx playwright test --project=e2e
 * Run: npx playwright test (both)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  timeout: 30_000,

  use: {
    baseURL: process.env.API_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        // No browser needed for API tests
        extraHTTPHeaders: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.APP_URL || 'http://localhost:5173',
      },
    },
  ],

  /* Start server and dashboard before E2E tests */
  // webServer: [
  //   {
  //     command: 'cd apis-server && go run ./cmd/server',
  //     url: 'http://localhost:3000/api/auth/config',
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: 'cd apis-dashboard && npm run dev',
  //     url: 'http://localhost:5173',
  //     reuseExistingServer: !process.env.CI,
  //   },
  // ],
});
