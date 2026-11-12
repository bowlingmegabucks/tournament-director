import { expect, test } from '@playwright/test'
import { openTournamentsAsAdmin, openTournamentsSignedIn } from './menu'

// TRN-10, TRN-38 to TRN-43, D-130, D-256 to D-260: a director completes a tournament by reading what
// it will do, typing the name, and sees the badge and a toast, with the Danger zone gone.
test('a director completes a tournament after reading the dialog and typing its name', async ({
  page,
}) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  const zone = page.getByRole('region', { name: 'Danger zone' })
  // The overview is open once its Danger zone shows; before that the heading is the list's.
  await expect(zone).toBeVisible()
  const heading = page.getByRole('heading', { level: 1 })
  const name = (await heading.textContent())?.trim() ?? ''
  expect(name).not.toBe('')

  await zone.getByRole('button', { name: 'Complete tournament' }).click()
  const dialog = page.getByRole('dialog', { name: 'Complete this tournament?' })
  await expect(dialog).toContainText('Complete 2 open squads and 1 open sweeper.')
  await expect(dialog).toContainText('Save a zero for every game of 3 bowlers with no scores.')
  await expect(dialog).toContainText('This cannot be undone.')
  // Cancel has focus first, so Enter on a fresh dialog is the safe choice.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Complete tournament' })).toBeDisabled()

  // Escape closes it and nothing changes.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Completed', { exact: true })).toHaveCount(0)

  await zone.getByRole('button', { name: 'Complete tournament' }).click()
  await dialog.getByLabel('Type the tournament name to confirm').fill(name)
  await dialog.getByRole('button', { name: 'Complete tournament' }).click()

  await expect(
    page.getByText('Tournament completed. 2 squads and 1 sweeper closed, 3 bowlers got zeros.'),
  ).toBeVisible()
  await expect(page.getByText('Completed', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Danger zone' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit tournament' })).toHaveCount(0)
})

test('an admin sees Complete above Delete in one Danger zone', async ({ page }) => {
  await openTournamentsAsAdmin(page)
  await page.getByRole('article').first().getByRole('link').click()

  const zone = page.getByRole('region', { name: 'Danger zone' })
  await expect(zone.getByRole('button', { name: 'Complete tournament' })).toBeVisible()
  await expect(zone.getByRole('button', { name: 'Delete tournament' })).toBeVisible()
})
