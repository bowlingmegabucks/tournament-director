import { expect, test } from '@playwright/test'
import { openTournamentsSignedIn } from './menu'
import { fillDay } from './dateFields'

// TRN-22: the director opens the form from the list, fixes the errors, saves, and lands on the overview.
test('a director creates a tournament and sees it on the overview', async ({ page }) => {
  await openTournamentsSignedIn(page)

  await page.getByRole('link', { name: 'New tournament' }).click()
  await expect(page.getByRole('heading', { name: 'New tournament', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Save tournament' }).click()
  await expect(page.getByRole('alert')).toContainText('Fix 9 fields to save.')
  await expect(page.getByLabel('Name (required)', { exact: true })).toBeFocused()

  await page.getByLabel('Name (required)', { exact: true }).fill('Spring Classic')
  await fillDay(page, 'Start date (required)', '2099-03-12', true)
  await fillDay(page, 'End date (required)', '2099-03-14', true)
  await page.getByLabel('Bowling center (required)', { exact: true }).fill('Bowl-O-Rama')
  await page.getByLabel('Entry fee in dollars (required)', { exact: true }).fill('60')
  await page.getByLabel('Games per squad (required)', { exact: true }).fill('6')
  await page.getByLabel('Finals ratio (required)', { exact: true }).fill('7.5')
  await page.getByLabel('Cash ratio (required)', { exact: true }).fill('4.5')
  await page.getByLabel('Super sweeper cash ratio (required)', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Save tournament' }).click()

  await expect(page.getByRole('heading', { name: 'Spring Classic', level: 1 })).toBeVisible()
  await expect(page.getByText('Tournament created')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Format', level: 2 })).toBeVisible()
  // What was typed comes back, not a default.
  await expect(page.getByText('Games per squad').locator('+ dd')).toHaveText('6')
  await expect(page.getByText('Finals ratio').locator('+ dd')).toHaveText('1 in 7.5')
  await expect(page.getByText('Cash ratio', { exact: true }).locator('+ dd')).toHaveText('1 in 4.5')
  await expect(page.getByText('Super sweeper cash ratio').locator('+ dd')).toHaveText('1 in 3')
})

test('a visitor who is not signed in sees no New tournament button', async ({ page }) => {
  await page.goto('/tournaments')

  await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New tournament' })).toHaveCount(0)
})
