import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const colorSchemes = ['dark', 'light'] as const

// axe checks color contrast in a real browser, which jsdom unit tests cannot do.
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

for (const colorScheme of colorSchemes) {
  test.describe(`${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('home page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/')
      // Wait for data so axe scans the card and not the loading text.
      await expect(page.getByRole('article')).toBeVisible()

      await expectNoViolations(page)
    })

    test('tournaments page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('tournament overview has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await expect(page.getByRole('navigation', { name: /Northeast MegaBuck/ })).toBeVisible()

      await expectNoViolations(page)
    })

    test('divisions page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Divisions' })
        .click()
      await expect(page.getByRole('table')).toBeVisible()

      await expectNoViolations(page)
    })

    for (const [name, label] of [
      ['Squads', 'squads'],
      ['Sweepers', 'sweepers'],
    ] as const) {
      test(`${label} page (loaded) has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto('/tournaments')
        await page.getByRole('article').first().getByRole('link').click()
        await page
          .getByRole('navigation', { name: /Northeast MegaBuck/ })
          .getByRole('link', { name })
          .click()
        await expect(
          page.getByRole('heading', { level: 2, name: /\d{2}\/\d{2}\/\d{4}/ }).first(),
        ).toBeVisible()

        await expectNoViolations(page)
      })
    }

    test('registrations page (loaded and filtered) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Registrations' })
        .click()
      await expect(page.getByRole('table')).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('searchbox', { name: 'Filter by name or USBC ID' }).fill('zz')
      await expect(page.getByText('No registrations match the filter.')).toBeVisible()
      await expectNoViolations(page)
    })

    test('tournament not found has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')
      await expect(page.getByRole('heading', { name: 'Tournament not found' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('page not found has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/nowhere')
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

      await expectNoViolations(page)
    })
  })
}

// Empty and error states: force the API response with `route`. The mock service worker
// would answer first, so block it for these tests.
test.describe('other states', () => {
  test.use({ serviceWorkers: 'block' })

  for (const colorScheme of colorSchemes) {
    test(`tournaments page (empty) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/v1/tournaments', (route) => route.fulfill({ json: { tournaments: [] } }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/tournaments')
      await expect(page.getByText('No tournaments yet.')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`tournaments page (error) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/v1/tournaments', (route) => route.fulfill({ status: 500, body: '' }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/tournaments')
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`divisions page (empty) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      const id = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
      await page.route(`**/v1/tournaments/${id}`, (route) =>
        route.fulfill({
          json: {
            tournament: {
              id,
              name: 'Spring Open',
              startDate: '2026-10-23',
              endDate: '2026-10-25',
              entryFee: 50,
              bowlingCenter: 'Spare Time Lanes, Worcester MA',
            },
          },
        }),
      )
      await page.route(`**/v1/tournaments/${id}/divisions`, (route) =>
        route.fulfill({ json: { divisions: [] } }),
      )
      await page.emulateMedia({ colorScheme })
      await page.goto(`/tournaments/${id}/divisions`)
      await expect(page.getByText('No divisions yet.')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`divisions page (error) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      const id = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
      await page.route(`**/v1/tournaments/${id}`, (route) =>
        route.fulfill({
          json: {
            tournament: {
              id,
              name: 'Spring Open',
              startDate: '2026-10-23',
              endDate: '2026-10-25',
              entryFee: 50,
              bowlingCenter: 'Spare Time Lanes, Worcester MA',
            },
          },
        }),
      )
      await page.route(`**/v1/tournaments/${id}/divisions`, (route) =>
        route.fulfill({ status: 503, body: '' }),
      )
      await page.emulateMedia({ colorScheme })
      await page.goto(`/tournaments/${id}/divisions`)
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 })

      await expectNoViolations(page)
    })
  }
})
