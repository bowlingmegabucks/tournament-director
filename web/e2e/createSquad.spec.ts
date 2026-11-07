import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/** Open the first tournament's Squads page, then the New squad form. */
async function openForm(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: 'New squad' }).click()
  await expect(page.getByRole('heading', { name: 'New squad', level: 1 })).toBeVisible()
}

/** A time on the tournament's first day, read from the date box's limit, since the demo dates move. */
async function firstDayAt(page: Page, time: string): Promise<string> {
  const min = await page.getByLabel('Date and time (required)').getAttribute('min')
  if (!min) throw new Error('The date box has no minimum')
  return `${min.slice(0, 10)}T${time}`
}

// SQD-01 to SQD-08: the director opens the form from the Squads page, fixes the errors, adds the
// squad, and lands on the list with a toast and a new card.
test('a director adds a squad and sees it in the list', async ({ page }) => {
  await openForm(page)

  await page.getByRole('button', { name: 'Add squad' }).click()
  await expect(page.getByRole('alert')).toContainText('Fix')
  await expect(page.getByLabel('Date and time (required)')).toBeFocused()

  await page.getByLabel('Date and time (required)').fill(await firstDayAt(page, '21:30'))
  await page.getByLabel('Starting lane (required)').fill('3')
  await page.getByLabel('Number of lanes (required)').fill('10')
  await page.getByLabel('Bowlers per pair (required)').fill('5')
  await page.getByLabel('Entry fee').fill('77')
  await page.getByRole('button', { name: 'Add squad' }).click()

  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  await expect(page.getByText('Squad created')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: '9:30 PM' })
  await expect(card).toContainText('3 to 12 (10 lanes)')
  await expect(card).toContainText('Up to 5')
  await expect(card).toContainText('$77.00 (override)')
})

test('a rule the browser checks shows under its box', async ({ page }) => {
  await openForm(page)

  await page.getByLabel('Date and time (required)').fill(await firstDayAt(page, '09:00'))
  await page.getByLabel('Starting lane (required)').fill('2')
  await page.getByLabel('Number of lanes (required)').fill('10')
  await page.getByLabel('Bowlers per pair (required)').fill('4')
  await page.getByRole('button', { name: 'Add squad' }).click()

  await expect(page.getByLabel('Starting lane (required)')).toHaveAccessibleDescription(
    /Starting lane must be odd/,
  )
  await expect(page.getByLabel('Starting lane (required)')).toBeFocused()
})

test('a visitor who is not signed in sees no New squad link', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')

  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New squad' })).toHaveCount(0)
})
