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
  }
})
