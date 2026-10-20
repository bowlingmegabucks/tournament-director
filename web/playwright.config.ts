import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build -- --mode mocks && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    // Never reuse: a running non-mock server on this port would fail the test with no clue why.
    reuseExistingServer: false,
  },
})
