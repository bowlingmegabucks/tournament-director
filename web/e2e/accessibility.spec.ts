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

    test('scores page (loaded, on a wide and a narrow screen) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /1:00 PM/ }).click()
      await page.getByRole('link', { name: 'Scores' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('squad results page (a division with lines, ties and sections, on a wide and a narrow screen) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page
        .getByRole('link', { name: /9:00 AM/ })
        .first()
        .click()
      await page.getByRole('link', { name: 'Results' }).click()
      await expect(page.getByRole('heading', { level: 3, name: 'Did not finish' })).toBeVisible()
      await expectNoViolations(page)

      await page
        .getByRole('combobox', { name: 'Division' })
        .selectOption({ label: 'Women (12 entries)' })
      await expect(page.getByRole('columnheader', { name: 'HDCP' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('sweeper results page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Sweepers' })
        .click()
      await page.getByRole('link', { name: /6:00 PM/ }).click()
      await page.getByRole('link', { name: 'Results' }).click()
      await expect(page.getByRole('table', { name: 'Sweeper results' })).toBeVisible()
      await expectNoViolations(page)
    })

    test('at-large, seeding, and super sweeper pages (loaded, on a wide and a narrow screen) have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      const sidebar = () => page.getByRole('navigation', { name: /Northeast MegaBuck/ })
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()

      await sidebar().getByRole('link', { name: 'At-large' }).click()
      await expect(page.getByRole('table', { name: /At-large results/ })).toBeVisible()
      await expectNoViolations(page)

      await sidebar().getByRole('link', { name: 'Seeding' }).click()
      await expect(page.getByRole('table', { name: /Finals seeding/ })).toBeVisible()
      await expectNoViolations(page)

      await sidebar().getByRole('link', { name: 'Sweepers' }).click()
      await page.getByRole('link', { name: 'Super sweeper results' }).click()
      await expect(page.getByRole('table', { name: 'Super sweeper results' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('lane assignments page (loaded, and with the Assign dialog open) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /1:00 PM/ }).click()
      await expect(page.getByRole('heading', { name: 'Unassigned (4)' })).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Assign to lanes: Pat Nguyen' }).click()
      await expect(page.getByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })).toBeVisible()
      await expectNoViolations(page)

      // The "not saved" notice, with the moved bowler in place.
      await page.getByRole('button', { name: /Lanes 7-8/ }).click()
      await expect(page.getByText(/No save is configured yet/)).toBeVisible()
      await expectNoViolations(page)
    })

    test('recap sheets dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /1:00 PM/ }).click()
      await page.getByRole('button', { name: 'Recap sheets' }).click()
      await expect(page.getByRole('button', { name: 'Print all' })).toBeVisible()

      await expectNoViolations(page)

      // One sheet unchecked: dimmed, and still readable.
      await page
        .getByRole('checkbox', { name: /^Print / })
        .first()
        .uncheck()
      await expect(page.getByText('Not printing')).toBeVisible()
      await expectNoViolations(page)
    })

    test('lane assignments page of a complete squad has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page
        .getByRole('link', { name: /9:00 AM/ })
        .first()
        .click()
      await expect(page.getByText('This squad is complete. Lanes cannot change.')).toBeVisible()

      await expectNoViolations(page)
    })

    test('registrations squad popup (open) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page.getByRole('link', { name: 'Registrations' }).click()
      await page
        .getByRole('row', { name: /Dana Abbott/ })
        .getByRole('button', { name: '2 squads, show list' })
        .click()
      await expect(page.getByRole('dialog', { name: 'Dana Abbott: squads' })).toBeVisible()

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
