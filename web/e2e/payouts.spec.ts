import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

/** Sign in as the director, open the first tournament, and open the payouts tab of the complete 9:00 AM squad. */
async function openSquadPayouts(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 9:00 AM', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Squad pages' })
    .getByRole('link', { name: 'Payouts' })
    .click()
  await expect(page.getByRole('heading', { name: 'Payouts', level: 2 })).toBeVisible()
}

// PAY-02, PAY-06, PAY-08, PAY-12, PAY-13, D-268 to D-278: the director opens the squad's payouts, fills
// the same amount for the inferred cashers, adds one more bowler with a note, saves, and then finds
// the payouts in the full list and ticks one paid.
test('a director enters a squad’s payouts and finds them in the full list', async ({ page }) => {
  await openSquadPayouts(page)
  await expect(page.getByText('Payouts are for this event only.')).toBeVisible()
  await expect(page.getByText('No payouts are recorded for this squad.')).toBeVisible()

  await page.getByRole('button', { name: 'Enter payouts' }).click()
  const sheet = page.getByRole('dialog', { name: 'Payouts: Squad' })
  await sheet.getByRole('button', { name: 'Same amount for all' }).click()
  const same = page.getByRole('dialog', { name: 'Same amount for all' })
  await expect(same).toContainText('These 2 bowlers are inferred to get the amount:')
  await same.getByLabel('Amount for each ($)').fill('100')
  await same.getByRole('button', { name: 'Fill 2 boxes' }).click()
  await expect(sheet.getByLabel('Amount for Dana Whitfield')).toHaveValue('100')

  await sheet.getByRole('button', { name: 'Add another bowler' }).click()
  const add = page.getByRole('dialog', { name: 'Add another bowler' })
  await add.getByLabel('Search by name').fill('tom')
  await add.getByRole('button', { name: 'Add Tom Becker' }).click()
  await add.getByRole('button', { name: 'Close' }).click()
  await sheet.getByLabel('Amount for Tom Becker').fill('25')
  await sheet.getByRole('button', { name: 'Save payouts' }).click()
  await expect(sheet.getByText('Say why this bowler is paid')).toBeVisible()
  await sheet.getByLabel('Note (required) for Tom Becker').fill('Lane breakdown')
  await sheet.getByRole('button', { name: 'Save payouts' }).click()

  await expect(page.getByText('Payouts saved.')).toBeVisible()
  const table = page.getByRole('table', { name: 'Payouts' })
  await expect(table.getByRole('row', { name: /Tom Becker/ })).toContainText('Lane breakdown')
  await expect(table.getByRole('row', { name: /Dana Whitfield/ })).toContainText('$100.00')

  await menuLink(page, 'Payouts')
  await expect(page.getByRole('heading', { name: 'Payouts', level: 1 })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Payouts by payout' })).toContainText('Tom Becker')
  // The box is not ticked until the API answers, so click and wait for the tick.
  await page.getByLabel('Paid for Tom Becker').click()
  await expect(page.getByLabel('Paid for Tom Becker')).toBeChecked()
  await page.getByRole('link', { name: 'By bowler' }).click()
  await expect(page.getByRole('table', { name: 'Payouts by bowler' })).toContainText('$100.00')
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`the payout pages have no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await openSquadPayouts(page)
    await expectNoViolations(page)

    // The entry sheet with its error states shown.
    await page.getByRole('button', { name: 'Enter payouts' }).click()
    const sheet = page.getByRole('dialog', { name: 'Payouts: Squad' })
    await sheet.getByLabel('Amount for Dana Whitfield').fill('-5')
    await sheet.getByRole('button', { name: 'Same amount for all' }).click()
    await expectNoViolations(page)
    await page
      .getByRole('dialog', { name: 'Same amount for all' })
      .getByRole('button', { name: 'Cancel' })
      .click()
    await sheet.getByRole('button', { name: 'Save payouts' }).click()
    await expect(sheet.getByText('Enter an amount above $0.00')).toBeVisible()
    await expectNoViolations(page)
    await sheet.getByLabel('Amount for Dana Whitfield').fill('100')
    await sheet.getByRole('button', { name: 'Save payouts' }).click()
    await expect(page.getByText('Payouts saved.')).toBeVisible()

    // The full list, both views.
    await menuLink(page, 'Payouts')
    await expect(page.getByRole('table', { name: 'Payouts by payout' })).toBeVisible()
    await expectNoViolations(page)
    await page.getByRole('link', { name: 'By bowler' }).click()
    await expect(page.getByRole('table', { name: 'Payouts by bowler' })).toBeVisible()
    await expectNoViolations(page)
  })
}

// A phone has no sideways scroll, and the entry sheet fills the screen (D-276).
test('the entry sheet fits a 320 px phone with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSquadPayouts(page)
  await page.getByRole('button', { name: 'Enter payouts' }).click()
  const sheet = page.getByRole('dialog', { name: 'Payouts: Squad' })
  await expect(sheet.getByLabel('Amount for Dana Whitfield')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Save payouts' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const dialogOverflow = await sheet.evaluate((node) => node.scrollWidth - node.clientWidth)
  expect(dialogOverflow).toBeLessThanOrEqual(0)
})
