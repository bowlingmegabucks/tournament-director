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
  test(`home page (loaded) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    // Wait for data so axe scans the list and not the loading text.
    await expect(page.getByRole('listitem').first()).toBeVisible()

    await expectNoViolations(page)
  })
}

for (const colorScheme of colorSchemes) {
  test(`home page (success toast) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await page.getByRole('button', { name: 'Check API' }).click()
    await expect(page.getByRole('status')).toContainText('API is healthy')

    await expectNoViolations(page)
  })
}

// Empty and error states: force the API response with `route`. The mock service worker
// would answer first, so block it for these tests.
test.describe('other states', () => {
  test.use({ serviceWorkers: 'block' })

  for (const colorScheme of colorSchemes) {
    test(`home page (empty) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/api/tournaments', (route) => route.fulfill({ json: [] }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await expect(page.getByText('No tournaments yet.')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`home page (error) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/api/tournaments', (route) => route.fulfill({ status: 500, body: '' }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`home page (error toast) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: '' }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await page.getByRole('button', { name: 'Check API' }).click()
      await expect(page.getByRole('alert').filter({ hasText: '503' })).toBeVisible()

      await expectNoViolations(page)
    })
  }
})
