import { expect, test } from '@playwright/test'

test('home page lists tournaments', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  await expect(page.getByRole('listitem').first()).toContainText('entrants')
})
