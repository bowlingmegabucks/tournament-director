import { defineConfig, devices } from '@playwright/test'
import { apiEnv, apiUrl, webBuildEnv, webUrl } from './lifecycle/support/stack'

const compose = 'docker compose -f web/lifecycle/docker-compose.yml'

// The tournament lifecycle test (docs/plans/lifecycle-e2e.md): a fresh database, the real API, and
// the production web build with no mocks. Run it with `npm run test:lifecycle` in web/.
export default defineConfig({
  testDir: './lifecycle',
  testMatch: '*.spec.ts',
  // One run, one tournament: stages share the data, so nothing runs in parallel or retries.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 10 * 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'lifecycle-report' }]],
  outputDir: 'lifecycle-results',
  globalTeardown: './lifecycle/globalTeardown.ts',
  // Rule 10: keep the evidence of a failed run.
  expect: { timeout: 10_000 },
  use: {
    baseURL: webUrl,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // The root of the repo, so the Compose path is the same everywhere. A fresh database each run.
      cwd: '..',
      command: [
        `${compose} down -v`,
        `${compose} up -d --wait`,
        'npm --prefix api run db:tables',
        'npm --prefix api run build',
        'npm --prefix api start',
      ].join(' && '),
      env: apiEnv,
      url: `${apiUrl}/ready`,
      timeout: 240_000,
      reuseExistingServer: false,
    },
    {
      // Sign-in is on in this build, so the dev-only text must still be absent (rule 9).
      cwd: '..',
      command: [
        'npm --prefix web run build -- --outDir dist-lifecycle',
        'node scripts/checkDist.ts web/dist-lifecycle',
        'npm --prefix web run preview -- --outDir dist-lifecycle --port 4273 --strictPort',
      ].join(' && '),
      env: webBuildEnv,
      url: webUrl,
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
})
