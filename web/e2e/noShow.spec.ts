import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsAsAdmin, openTournamentsSignedIn } from './menu'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

/** Open the results of the complete 9:00 AM squad of the first tournament. */
async function openSquadResults(page: Page) {
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 9:00 AM', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Squad pages' })
    .getByRole('link', { name: 'Results' })
    .click()
  await expect(page.getByRole('heading', { name: 'No show', level: 3 })).toBeVisible()
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Move or refund Mike Tran' })

async function openDialog(page: Page) {
  await openTournamentsAsAdmin(page)
  await openSquadResults(page)
  await page.getByRole('button', { name: 'Move or refund Mike Tran' }).click()
  return dialogOf(page)
}

// NSH-01, NSH-04, NSH-09: an admin moves a no-show of a completed squad after reviewing the change.
test('an admin moves a no-show to an open squad', async ({ page }) => {
  const dialog = await openDialog(page)
  await expect(dialog.getByRole('button', { name: 'Move entry' })).toBeDisabled()

  await dialog.getByRole('radio', { name: 'Move to another squad' }).check()
  await dialog.getByLabel('New squad').selectOption({ index: 1 })
  await expect(dialog.getByText(/Dana Whitfield no longer cashes/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Move entry' }).click()

  await expect(page.getByText(/Mike Tran moved to/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Move or refund Mike Tran' })).toBeHidden()
})

// NSH-05, NSH-06: a refund of the only squad entry warns first.
test('an admin refunds a no-show after the sweeper warning', async ({ page }) => {
  const dialog = await openDialog(page)

  await dialog.getByRole('radio', { name: 'Refund' }).check()
  await expect(dialog.getByText(/ineligible for sweepers/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Refund entry' }).click()

  await expect(page.getByText('Mike Tran refunded. The registration is deleted.')).toBeVisible()
})

test('a director sees the no-show but no button (NSH-01)', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await openSquadResults(page)

  await expect(page.getByText('Mike Tran')).toBeVisible()
  await expect(page.getByRole('button', { name: /Move or refund/ })).toHaveCount(0)
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`the no-show dialog has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    const dialog = await openDialog(page)
    await dialog.getByRole('radio', { name: 'Refund' }).check()
    await expect(dialog.getByText(/ineligible for sweepers/)).toBeVisible()

    await expectNoViolations(page)
  })
}

test('the no-show dialog does not scroll sideways at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: 'Refund' }).check()
  await expect(dialog.getByText(/ineligible for sweepers/)).toBeVisible()

  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
})
