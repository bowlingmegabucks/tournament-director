import { expect, test } from '@playwright/test'
import { openTournamentsSignedIn } from './menu'

// TRN-29, TRN-31: the director opens a tournament, edits it, saves, and lands on the overview.
test('a director edits a tournament and sees the change on the overview', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await expect(page.getByRole('link', { name: 'Edit tournament' })).toBeVisible()

  await page.getByRole('link', { name: 'Edit tournament' }).click()
  await expect(page.getByRole('heading', { name: 'Edit tournament', level: 1 })).toBeVisible()
  const name = page.getByLabel('Name (required)', { exact: true })
  await expect(name).not.toHaveValue('')

  await name.fill('')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText('Fix 1 field to save.')
  await expect(name).toBeFocused()

  await name.fill('Renamed Classic')
  await page.getByLabel('Games per squad (required)', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { name: 'Renamed Classic', level: 1 })).toBeVisible()
  await expect(page.getByText('Tournament saved')).toBeVisible()
  await expect(page.getByText('Games per squad').locator('+ dd')).toHaveText('7')
})

test('a visitor who is not signed in sees no Edit link', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()

  await expect(page.getByRole('heading', { name: 'Format', level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit tournament' })).toHaveCount(0)
})
