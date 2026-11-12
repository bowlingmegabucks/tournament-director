import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'
import { fillDateTime, firstDayAt } from './dateFields'

async function openSweepers(page: Page, signedIn = true) {
  if (signedIn) {
    await openTournamentsSignedIn(page)
  } else {
    await page.goto('/tournaments')
  }
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')
}

/**
 * The demo's two sweepers are scored and complete, so neither can go. Add a new one at 9:30 PM on
 * the first day (read from the date box's limit, since the demo dates move) and return its card.
 */
async function addEmptySweeper(page: Page) {
  await page.getByRole('link', { name: 'New sweeper' }).click()
  await fillDateTime(page, await firstDayAt(page, '21:30'))
  await page.getByLabel('Starting lane (required)').fill('3')
  await page.getByLabel('Number of lanes (required)').fill('10')
  await page.getByLabel('Bowlers per pair (required)').fill('5')
  await page.getByLabel('Entry fee (required)').fill('35')
  await page.getByLabel('Games (required)').fill('4')
  await page.getByLabel('Cash ratio (required)').fill('6.5')
  await page.getByRole('button', { name: 'Add sweeper' }).click()
  await expect(page.getByText('Sweeper created')).toBeVisible()
  return page.getByRole('listitem').filter({ hasText: '9:30 PM' })
}

const deleteButton = (page: Page) =>
  page.getByRole('button', { name: /^Delete sweeper .* 9:30 PM$/ })

// SQD-14, D-186 to D-189: the director deletes an empty, open sweeper from its card, confirms in
// the dialog, and lands back on the list with a toast.
test('a director deletes a sweeper and it leaves the list', async ({ page }) => {
  await openSweepers(page)
  const card = await addEmptySweeper(page)
  await expect(card).toHaveCount(1)

  await deleteButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this sweeper?' })
  await expect(dialog).toContainText('will be deleted.')
  await expect(dialog).toContainText('Its bonus pins go too.')
  await dialog.getByRole('button', { name: 'Delete sweeper' }).click()

  await expect(page.getByText('Sweeper deleted')).toBeVisible()
  await expect(card).toHaveCount(0)
})

test('Cancel leaves the sweeper in place', async ({ page }) => {
  await openSweepers(page)
  const card = await addEmptySweeper(page)

  await deleteButton(page).click()
  await page
    .getByRole('dialog', { name: 'Delete this sweeper?' })
    .getByRole('button', { name: 'Cancel' })
    .click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card).toHaveCount(1)
})

test('saved scores block the delete in the dialog', async ({ page }) => {
  await openSweepers(page)

  await page.getByRole('button', { name: 'Delete sweeper Sat 10/24/2026 6:00 PM' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this sweeper?' })

  await expect(dialog).toContainText(
    'Scores are saved for Sat 10/24/2026 6:00 PM, so it cannot be deleted.',
  )
  await expect(dialog.getByRole('button', { name: 'Delete sweeper' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '6:00 PM' })).toHaveCount(1)
})

test('a complete sweeper has no Delete button (SQD-17, SQD-18)', async ({ page }) => {
  await openSweepers(page)

  await expect(page.getByRole('heading', { name: /Sun 10\/25\/2026 5:00 PM/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Delete sweeper Sun 10/25/2026 5:00 PM' }),
  ).toHaveCount(0)
})

test('a visitor who is not signed in sees no Delete buttons', async ({ page }) => {
  await openSweepers(page, false)

  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})
