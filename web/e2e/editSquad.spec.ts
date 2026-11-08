import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

async function openSquads(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
}

// SQD-23, SQD-27: the director opens an open squad from its card, changes the lanes and the fee,
// and lands back on the list with a toast and the new values.
test('a director edits a squad and sees the change in the list', async ({ page }) => {
  await openSquads(page)

  await page.getByRole('link', { name: 'Edit squad Sun 10/25/2026 9:00 AM' }).click()
  await expect(page.getByRole('heading', { name: 'Edit squad', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Starting lane (required)')).toHaveValue('11')
  await expect(page.getByLabel('Number of lanes (required)')).toHaveValue('10')

  await page.getByLabel('Starting lane (required)').fill('3')
  await page.getByLabel('Number of lanes (required)').fill('12')
  await page.getByLabel('Entry fee').fill('65')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  await expect(page.getByText('Squad saved')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: '10/25/2026' })
  await expect(card).toContainText('3 to 14 (12 lanes)')
  await expect(card).toContainText('$65.00 (override)')
})

// SQD-25, SQD-28, D-180: a squad with entries asks before it moves or changes its fee.
test('a squad with entries asks the director to confirm a new fee', async ({ page }) => {
  await openSquads(page)
  await page.getByRole('link', { name: 'Edit squad Sat 10/24/2026 1:00 PM' }).click()

  await expect(page.getByLabel('Entry fee')).toHaveAccessibleDescription(
    /12 bowlers are entered. They keep what they paid/,
  )
  await page.getByLabel('Entry fee').fill('75')
  await page.getByRole('button', { name: 'Save changes' }).click()

  const dialog = page.getByRole('dialog', { name: 'Save these changes?' })
  await expect(dialog).toContainText('12 bowlers are entered. They keep what they paid.')
  await expect(dialog).toContainText('Entry fee: $60.00 → $75.00')
  await dialog.getByRole('button', { name: 'Save anyway' }).click()

  await expect(page.getByText('Squad saved')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '1:00 PM' })).toContainText(
    '$75.00 (override)',
  )
})

test('a rule the browser checks shows under its box and saves nothing', async ({ page }) => {
  await openSquads(page)
  await page.getByRole('link', { name: 'Edit squad Sun 10/25/2026 9:00 AM' }).click()

  await page.getByLabel('Starting lane (required)').fill('2')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByLabel('Starting lane (required)')).toHaveAccessibleDescription(
    /Starting lane must be odd/,
  )
  await expect(page.getByLabel('Starting lane (required)')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Edit squad', level: 1 })).toBeVisible()
})

test('a complete squad has no Edit link, and a visitor sees none at all', async ({ page }) => {
  await openSquads(page)
  await expect(page.getByRole('link', { name: 'Edit squad Sat 10/24/2026 9:00 AM' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Edit squad/ })).not.toHaveCount(0)

  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit squad/ })).toHaveCount(0)
})
