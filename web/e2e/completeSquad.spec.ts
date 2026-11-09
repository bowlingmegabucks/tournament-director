import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

async function openList(page: Page, menu: 'Squads' | 'Sweepers') {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, menu)
}

// SQD-15, SQD-18, D-190 to D-195: the director opens an open squad, reads what the complete will do
// in the dialog, completes it, and sees the status flip with a toast and no button left.
test('a director completes a squad after reading the dialog', async ({ page }) => {
  await openList(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 1:00 PM', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Open')

  await page.getByRole('button', { name: 'Complete squad' }).click()
  const dialog = page.getByRole('dialog', { name: 'Complete this squad?' })
  await expect(dialog).toContainText('12 bowlers are entered.')
  await expect(dialog).toContainText('3 have no scores and will get 0 for each of')
  await expect(dialog).toContainText('1 has fewer than')
  await expect(dialog).toContainText('This cannot be undone.')
  // Cancel has focus first, so Enter on a fresh dialog is the safe choice.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Complete squad' }).click()

  await expect(page.getByText('Squad completed. 3 bowlers got zeros.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Complete')
  await expect(page.getByRole('button', { name: 'Complete squad' })).toHaveCount(0)
})

test('Cancel leaves the squad open', async ({ page }) => {
  await openList(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 1:00 PM', exact: true }).click()

  await page.getByRole('button', { name: 'Complete squad' }).click()
  await page
    .getByRole('dialog', { name: 'Complete this squad?' })
    .getByRole('button', { name: 'Cancel' })
    .click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Open')
  await expect(page.getByRole('button', { name: 'Complete squad' })).toBeVisible()
})

test('a complete squad has no Complete button', async ({ page }) => {
  await openList(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 9:00 AM', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Complete')
  await expect(page.getByRole('button', { name: 'Complete squad' })).toHaveCount(0)
})

// SQD-16, D-191: a sweeper completes the same way and fills nothing in.
test('a director completes a sweeper and nothing is filled in', async ({ page }) => {
  await openList(page, 'Sweepers')
  await page.getByRole('link', { name: 'Sat 10/24/2026 6:00 PM', exact: true }).click()

  await page.getByRole('button', { name: 'Complete sweeper' }).click()
  const dialog = page.getByRole('dialog', { name: 'Complete this sweeper?' })
  await expect(dialog).toContainText('This cannot be undone.')
  await dialog.getByRole('button', { name: 'Complete sweeper' }).click()

  await expect(page.getByText('Sweeper completed.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Complete')
  await expect(page.getByRole('button', { name: 'Complete sweeper' })).toHaveCount(0)
})
