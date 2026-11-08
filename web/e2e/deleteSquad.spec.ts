import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

async function openSquads(page: Page, signedIn = true) {
  if (signedIn) {
    await openTournamentsSignedIn(page)
  } else {
    await page.goto('/tournaments')
  }
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
}

// SQD-14, D-186 to D-189: the director deletes an empty, open squad from its card, confirms in the
// dialog, and lands back on the list with a toast.
test('a director deletes a squad and it leaves the list', async ({ page }) => {
  await openSquads(page)
  const card = page.getByRole('listitem').filter({ hasText: '10/25/2026' })
  await expect(card).toHaveCount(1)

  await page.getByRole('button', { name: 'Delete squad Sun 10/25/2026 9:00 AM' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this squad?' })
  await expect(dialog).toContainText('Sun 10/25/2026 9:00 AM will be deleted.')
  await dialog.getByRole('button', { name: 'Delete squad' }).click()

  await expect(page.getByText('Squad deleted')).toBeVisible()
  await expect(card).toHaveCount(0)
})

test('Cancel leaves the squad in place', async ({ page }) => {
  await openSquads(page)

  await page.getByRole('button', { name: 'Delete squad Sun 10/25/2026 9:00 AM' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this squad?' })
    .getByRole('button', { name: 'Cancel' })
    .click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: '10/25/2026' })).toHaveCount(1)
})

test('bowlers entered in the squad blocks the delete in the dialog', async ({ page }) => {
  await openSquads(page)

  await page.getByRole('button', { name: 'Delete squad Sat 10/24/2026 1:00 PM' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this squad?' })

  await expect(dialog).toContainText(
    '12 bowlers are entered in Sat 10/24/2026 1:00 PM. Remove them from the squad first.',
  )
  await expect(dialog.getByRole('button', { name: 'Delete squad' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '1:00 PM' })).toHaveCount(1)
})

test('a complete squad has no Delete button (SQD-17, SQD-18)', async ({ page }) => {
  await openSquads(page)

  await expect(page.getByRole('heading', { name: /Sat 10\/24\/2026 9:00 AM/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Delete squad Sat 10/24/2026 9:00 AM' }),
  ).toHaveCount(0)
})

test('a visitor who is not signed in sees no Delete buttons', async ({ page }) => {
  await openSquads(page, false)

  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})
