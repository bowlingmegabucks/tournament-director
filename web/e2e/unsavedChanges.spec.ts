import { expect, test } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

// A form with changes asks before the director leaves it.
async function openNewDivision(page: Parameters<typeof menuLink>[0]) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')
  await page.getByRole('link', { name: 'New division' }).click()
  await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
}

test('a form left untouched lets the director go without a question', async ({ page }) => {
  await openNewDivision(page)

  await page.getByRole('link', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Stay keeps the typed text, and Leave goes on', async ({ page }) => {
  await openNewDivision(page)
  await page.getByLabel('Name (required)', { exact: true }).fill('Juniors')

  await page.getByRole('link', { name: 'Cancel' }).click()
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Stay on this page' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Stay on this page' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('Name (required)', { exact: true })).toHaveValue('Juniors')

  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Leave page' }).click()
  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
})

test('typing a value and clearing it again is not a change', async ({ page }) => {
  await openNewDivision(page)
  const name = page.getByLabel('Name (required)', { exact: true })
  await name.fill('Juniors')
  await name.fill('')

  await page.getByRole('link', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
})

test('a saved form goes to the list without a question', async ({ page }) => {
  await openNewDivision(page)
  await page.getByLabel('Name (required)', { exact: true }).fill('Veterans')

  await page.getByRole('button', { name: 'Add division' }).click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByText('Division created')).toBeVisible()
})

test('Escape on the question means Stay', async ({ page }) => {
  await openNewDivision(page)
  await page.getByLabel('Name (required)', { exact: true }).fill('Juniors')
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
})
