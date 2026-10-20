import { expect, test } from '@playwright/test'

test('home page lists tournaments', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  await expect(page.getByRole('listitem').first()).toContainText('entrants')
})

test('check API shows a success toast', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Check API' }).click()

  await expect(page.getByRole('status')).toContainText('API is healthy')
})
