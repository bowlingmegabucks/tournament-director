import { expect, test } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

const rowOf = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) })

// DIV-12, D-146, D-147: the director opens a division from the list, sees the number cannot change,
// changes the name and the handicap, and lands back on the list with a toast.
test('a director edits a division and sees the change in the list', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await page.getByRole('link', { name: 'Edit Seniors' }).click()
  await expect(page.getByRole('heading', { name: 'Edit division', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Name (required)', { exact: true })).toHaveValue('Seniors')
  await expect(page.getByText('The number cannot change.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /Number/ })).toHaveCount(0)

  await page.getByLabel('Name (required)', { exact: true }).fill('Super seniors')
  await page.getByLabel('Minimum age').fill('60')
  await page.getByLabel('Handicap percent').fill('85')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByText('Division saved')).toBeVisible()
  const row = rowOf(page, 'Super seniors')
  await expect(row).toContainText('60')
  await expect(row).toContainText('85% of 210')
  await expect(rowOf(page, 'Seniors')).toHaveCount(0)
})

test('a name another division uses shows under the name and saves nothing', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')
  await page.getByRole('link', { name: 'Edit Seniors' }).click()

  await page.getByLabel('Name (required)', { exact: true }).fill('women')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByLabel('Name (required)', { exact: true })).toHaveAccessibleDescription(
    /A division with this name already exists in this tournament/,
  )
  await expect(page.getByRole('heading', { name: 'Edit division', level: 1 })).toBeVisible()
})

test('a percent over 100 asks the director to confirm the change', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')
  await page.getByRole('link', { name: 'Edit Open' }).click()

  await page.getByLabel('Handicap percent').fill('110')
  await page.getByRole('button', { name: 'Save changes' }).click()

  const dialog = page.getByRole('dialog', { name: 'Save these changes?' })
  await expect(dialog).toContainText('A handicap percentage above 100 is unusual')
  await expect(dialog).toContainText('Handicap percent: 90% → 110%')
  await dialog.getByRole('button', { name: 'Save anyway' }).click()

  await expect(rowOf(page, 'Open')).toContainText('110% of 220')
})

test('a visitor who is not signed in sees no Edit links', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0)
})
