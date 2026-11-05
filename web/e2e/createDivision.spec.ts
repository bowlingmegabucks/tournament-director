import { expect, test } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

// DIV-12: the director opens the form from the Divisions page, fixes the errors, adds the division,
// and lands on the list with a toast.
test('a director adds a division and sees it in the list', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await page.getByRole('link', { name: 'New division' }).click()
  await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
  // The number is plain text: nothing to type (D-139, D-144).
  await expect(page.getByText('Number:', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /Number/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Add division' }).click()
  await expect(page.getByRole('alert')).toContainText('Fix 1 field to save.')
  await expect(page.getByLabel('Name (required)', { exact: true })).toBeFocused()

  await page.getByLabel('Name (required)', { exact: true }).fill('Juniors')
  await page.getByLabel('Maximum age').fill('17')
  await page.getByLabel('Handicap percent').fill('90')
  await page.getByLabel('Handicap base').fill('220')
  await page.getByRole('button', { name: 'Add division' }).click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByText('Division created')).toBeVisible()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Juniors' }) })
  await expect(row).toContainText('Up to 17')
  await expect(row).toContainText('90% of 220')
})

test('a percent over 100 asks the director to confirm', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')
  await page.getByRole('link', { name: 'New division' }).click()

  await page.getByLabel('Name (required)', { exact: true }).fill('Bonus')
  await page.getByLabel('Handicap percent').fill('110')
  await page.getByLabel('Handicap base').fill('220')
  await page.getByRole('button', { name: 'Add division' }).click()

  const dialog = page.getByRole('dialog', { name: 'Add this division?' })
  await expect(dialog).toContainText('A handicap percentage above 100 is unusual')
  await dialog.getByRole('button', { name: 'Add division' }).click()

  await expect(page.getByRole('rowheader', { name: 'Bonus' })).toBeVisible()
})

test('a visitor who is not signed in sees no New division link', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New division' })).toHaveCount(0)
})
