import { expect, test } from '@playwright/test'

test('home shows the current tournament and leads to the list and the overview', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  const card = page.getByRole('article')
  await expect(card.getByText('In progress')).toBeVisible()

  await page.getByRole('link', { name: 'All tournaments' }).click()
  await expect(page.getByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current and upcoming' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible()

  await page
    .getByRole('article')
    .first()
    .getByRole('link', { name: /Northeast MegaBuck\$ Tournament/ })
    .click()
  await expect(page.getByRole('navigation', { name: /Northeast MegaBuck/ })).toBeVisible()
  await expect(page.getByText('Spare Time Lanes, Worcester MA')).toBeVisible()
})

test('change tournament goes back to the list and hides the sidebar', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await expect(page.getByRole('navigation', { name: /Northeast MegaBuck/ })).toBeVisible()

  await page.getByRole('link', { name: 'Change tournament' }).click()

  await expect(page.getByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(1)
})

test('a deep link to an unknown tournament shows not found', async ({ page }) => {
  await page.goto('/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')

  await expect(page.getByRole('heading', { name: 'Tournament not found' })).toBeVisible()
})

test('check API shows a success toast', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Check API' }).click()

  await expect(page.getByRole('status')).toContainText('API is healthy')
})
