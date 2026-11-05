import { expect, test } from '@playwright/test'
import { openTournamentsAsAdmin, openTournamentsSignedIn } from './menu'

// TRN-36, TRN-37: an admin deletes a tournament by typing its name and lands on the list.
test('an admin deletes a tournament after typing its name', async ({ page }) => {
  await openTournamentsAsAdmin(page)
  await page.getByRole('article').first().getByRole('link').click()
  const deleteButton = page.getByRole('button', { name: 'Delete tournament' })
  await expect(deleteButton).toBeVisible()
  const heading = page.getByRole('heading', { level: 1 })
  const name = (await heading.textContent())?.trim() ?? ''
  expect(name).not.toBe('')

  await deleteButton.click()
  const dialog = page.getByRole('dialog', { name: 'Delete this tournament?' })
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Delete tournament' })).toBeDisabled()

  // Escape closes it and sends nothing.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(heading).toHaveText(name)

  await deleteButton.click()
  await dialog.getByLabel('Type the tournament name to confirm').fill(name)
  await dialog.getByRole('button', { name: 'Delete tournament' }).click()

  await expect(page.getByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
  await expect(page.getByText('Tournament deleted')).toBeVisible()
  await expect(page.getByRole('heading', { name, level: 2 })).toHaveCount(0)
})

test('a director sees no Delete button', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await expect(page.getByRole('link', { name: 'Edit tournament' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Delete tournament' })).toHaveCount(0)
})
