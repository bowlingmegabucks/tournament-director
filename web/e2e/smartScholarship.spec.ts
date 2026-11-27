import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/**
 * A youth's winnings go to their SMART account (SMT-01 to SMT-07). Every way the box is set at the
 * desk, and how the payout reports name the money. The mock server keeps its state until the page
 * reloads, so each test moves by links, as a visitor does.
 *
 * Demo data the tests lean on: Tom Delgado is registered and, in the mocks, has a paid payout. Maria
 * Gonzalez (born 1984) is on file and not registered. In the payout mocks Ann Bell is a youth.
 */

const smartBox = (page: Page) =>
  page.getByRole('checkbox', { name: 'Youth bowler: winnings go to their SMART account' })
const notice = 'SMART scholarship: do not pay'
const afternoon = /Sat 10\/24\/2026 1:00 PM/

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

const fitsTheScreen = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

async function openRegistrations(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
}

async function openAdd(page: Page) {
  await openRegistrations(page)
  await page.getByRole('link', { name: 'Add registration' }).click()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
}

async function finishNewRegistration(page: Page) {
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await page.getByRole('button', { name: 'Next: review' }).click()
}

const rowOf = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) })

async function openToms(page: Page) {
  await page.getByRole('link', { name: 'Edit Tom Delgado' }).click()
  await page.getByRole('button', { name: 'Back to bowler details' }).click()
}

async function reviewEdit(page: Page) {
  await page.getByRole('button', { name: 'Next: registration' }).click()
  await page.getByRole('button', { name: 'Next: review' }).click()
}

test('a new youth bowler is ticked, reviewed, added, and marked in the list (SMT-01, SMT-04)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await page.getByLabel('First name (required)').fill('Kid')
  await page.getByLabel('Last name (required)').fill('Young')
  await smartBox(page).check()
  await expect(page.getByText('No date of birth is entered.')).toBeVisible()
  await page.getByLabel('Date of birth').fill('06/01/2015')
  await expect(page.getByText('Check that this bowler is a youth.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next: registration' }).click()
  await finishNewRegistration(page)
  await expect(page.getByText('Winnings go to their SMART account.')).toBeVisible()
  await page.getByRole('button', { name: 'Add registration', exact: true }).click()

  await expect(rowOf(page, 'Kid Young')).toContainText('SMART')
  await expect(rowOf(page, 'Tom Delgado')).not.toContainText('SMART')
})

test('an adult on file gets a warning and is still added (SMT-07)', async ({ page }) => {
  await openAdd(page)
  await page.getByLabel('Last name starts with').fill('Gonzalez')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: 'Pick Maria Gonzalez, 1234-56789' }).click()
  await smartBox(page).check()
  await expect(page.getByText('This bowler is 18 or older.')).toBeVisible()
  await page.getByRole('button', { name: 'Next: registration' }).click()
  await finishNewRegistration(page)
  await page.getByRole('button', { name: 'Add registration', exact: true }).click()

  await expect(rowOf(page, 'Maria Gonzalez')).toContainText('SMART')
})

test('an edit warns about a paid payout both ways, and Go back saves nothing (SMT-05)', async ({
  page,
}) => {
  await openRegistrations(page)
  await openToms(page)
  await smartBox(page).check()
  await reviewEdit(page)
  await expect(page.getByText('SMART scholarship: turned on.')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('It will now show as SMART scholarship, not cash.')
  await expect(dialog).toContainText('SMART scholarship: off → on')
  await expectNoViolations(page)
  await dialog.getByRole('button', { name: 'Go back' }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await dialog.getByRole('button', { name: 'Save anyway' }).click()
  await expect(rowOf(page, 'Tom Delgado')).toContainText('SMART')

  await openToms(page)
  await expect(smartBox(page)).toBeChecked()
  await smartBox(page).uncheck()
  await reviewEdit(page)
  await expect(page.getByText('SMART scholarship: turned off.')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toContainText('It will now show as cash, not SMART scholarship.')
  await dialog.getByRole('button', { name: 'Save anyway' }).click()
  await expect(rowOf(page, 'Tom Delgado')).not.toContainText('SMART')
})

for (const colorScheme of ['dark', 'light'] as const) {
  test(`the ticked box and its warning fit a phone with no violations in ${colorScheme} mode (SMT-01)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width: 320, height: 800 })
    await openAdd(page)
    await page.getByRole('button', { name: 'New bowler' }).click()
    await smartBox(page).check()
    await expect(page.getByText('No date of birth is entered.')).toBeVisible()

    await expectNoViolations(page)
    expect(await fitsTheScreen(page)).toBe(true)
  })
}

test('payout reports include a youth, say not to pay, and keep the money out of cash (SMT-03, SMT-04)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => undefined
  })
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 9:00 AM', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Squad pages' })
    .getByRole('link', { name: 'Payouts' })
    .click()

  await page.getByRole('button', { name: 'Enter payouts' }).click()
  const sheet = page.getByRole('dialog', { name: 'Payouts: Squad' })
  await sheet.getByLabel('Amount for Dana Whitfield').fill('100')
  await sheet.getByRole('button', { name: 'Add another bowler' }).click()
  const add = page.getByRole('dialog', { name: 'Add another bowler' })
  await add.getByRole('button', { name: 'Add Ann Bell' }).click()
  await add.getByRole('button', { name: 'Close' }).click()
  await sheet.getByLabel('Amount for Ann Bell').fill('40')
  await sheet.getByLabel('Note (required) for Ann Bell').fill('Youth award')
  await sheet.getByRole('button', { name: 'Save payouts' }).click()
  await expect(page.getByText('Payouts saved.')).toBeVisible()

  const table = page.getByRole('table', { name: 'Payouts' })
  await expect(table.getByRole('row', { name: /Ann Bell/ })).toContainText(notice)
  await expect(table.getByRole('row', { name: /Dana Whitfield/ })).not.toContainText(notice)
  await expect(page.getByText('2 ($140.00: $100.00 cash, $40.00 SMART scholarship)')).toBeVisible()
  await expectNoViolations(page)

  await page.getByRole('button', { name: 'Print sign-off sheet' }).click()
  const printed = page.locator('[data-payout-print-copy]')
  await expect(printed.locator('tr', { hasText: 'Ann Bell' })).toContainText(notice)
  await expect(printed).toContainText('Cash $100.00')
  await expect(printed).toContainText('SMART scholarship $40.00')

  await menuLink(page, 'Payouts')
  await expect(page.getByRole('table', { name: 'Payouts by payout' })).toContainText(notice)
  await page.getByRole('link', { name: 'By bowler' }).click()
  await expect(page.getByRole('table', { name: 'Payouts by bowler' })).toContainText(notice)
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await fitsTheScreen(page)).toBe(true)
})
