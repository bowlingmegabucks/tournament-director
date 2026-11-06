import { expect, test } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

const rowOf = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) })

// DIV-12, DIV-01, D-153, D-154: the director deletes a division from its row, confirms in the
// dialog, and lands back on the list with the gap closed and a toast.
test('a director deletes a division and the numbers close up', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')
  await expect(rowOf(page, 'Seniors').getByRole('cell').first()).toHaveText('3')

  await page.getByRole('button', { name: 'Delete Women' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this division?' })
  await expect(dialog).toContainText('Women will be deleted.')
  await expect(dialog).toContainText('Divisions after it move up one number.')
  await dialog.getByRole('button', { name: 'Delete division' }).click()

  await expect(page.getByText('Division deleted')).toBeVisible()
  await expect(rowOf(page, 'Women')).toHaveCount(0)
  await expect(rowOf(page, 'Seniors').getByRole('cell').first()).toHaveText('2')
  await expect(rowOf(page, 'Open').getByRole('cell').first()).toHaveText('1')
})

test('Cancel leaves the division in place', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await page.getByRole('button', { name: 'Delete Women' }).click()
  await page
    .getByRole('dialog', { name: 'Delete this division?' })
    .getByRole('button', { name: 'Cancel' })
    .click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(rowOf(page, 'Women')).toHaveCount(1)
})

test('bowlers registered in the division block the delete in the dialog', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await page.getByRole('button', { name: 'Delete Scratch' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this division?' })

  await expect(dialog).toContainText('12 bowlers are registered in Scratch.')
  await expect(dialog.getByRole('button', { name: 'Delete division' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(rowOf(page, 'Scratch')).toHaveCount(1)
})

test('a visitor who is not signed in sees no Delete buttons', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Divisions')

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})
