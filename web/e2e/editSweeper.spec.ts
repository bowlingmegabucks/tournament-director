import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

async function openSweepers(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')
}

// SQD-23, SQD-24, SQD-25, SQD-29, D-180: the demo's first sweeper pretends scores are saved, so
// games lock and the ratio and the pins ask for a confirmation.
test('a director edits a scored sweeper: games lock, the ratio and pins ask to confirm', async ({
  page,
}) => {
  await openSweepers(page)
  await page.getByRole('link', { name: 'Edit sweeper Sat 10/24/2026 6:00 PM' }).click()
  await expect(page.getByRole('heading', { name: 'Edit sweeper', level: 1 })).toBeVisible()

  await expect(page.getByLabel('Games (required)')).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Games (required)')).toHaveAccessibleDescription(
    /Locked: Scores are saved, so the number of games cannot change./,
  )
  await expect(page.getByLabel('Open', { exact: true })).toHaveValue('10')

  await page.getByLabel('Cash ratio (required)').fill('3.5')
  await page.getByLabel('Open', { exact: true }).fill('8')
  await page.getByLabel('Women', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save changes' }).click()

  const dialog = page.getByRole('dialog', { name: 'Save these changes?' })
  await expect(dialog).toContainText('Scores are saved. Posted results change at once.')
  await expect(dialog).toContainText('Open bonus pins: 10 → 8')
  await expect(dialog).toContainText('Women bonus pins: 6 → none')
  await dialog.getByRole('button', { name: 'Save anyway' }).click()

  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByText('Sweeper saved')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: '10/24/2026' })
  await expect(card).toContainText('3.5')
  await expect(card).toContainText('Open: +8')
  await expect(card).not.toContainText('Women')
})

test('a rule the browser checks shows under its box and saves nothing', async ({ page }) => {
  await openSweepers(page)
  await page.getByRole('link', { name: 'Edit sweeper Sat 10/24/2026 6:00 PM' }).click()

  await page.getByLabel('Entry fee (required)').fill('0')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByLabel('Entry fee (required)')).toHaveAccessibleDescription(
    /Entry fee must be greater than \$0/,
  )
  await expect(page.getByLabel('Entry fee (required)')).toBeFocused()
})

test('a complete sweeper has no Edit link, and a visitor sees none at all', async ({ page }) => {
  await openSweepers(page)
  await expect(page.getByRole('link', { name: /^Edit sweeper/ })).toHaveCount(1)

  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')
  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit sweeper/ })).toHaveCount(0)
})
