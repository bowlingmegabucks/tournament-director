import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/** Open the first tournament's Sweepers page, then the New sweeper form. */
async function openForm(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')
  await page.getByRole('link', { name: 'New sweeper' }).click()
  await expect(page.getByRole('heading', { name: 'New sweeper', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Date and time (required)')).toBeVisible()
}

/** A time on the tournament's first day, read from the date box's limit, since the demo dates move. */
async function firstDayAt(page: Page, time: string): Promise<string> {
  const min = await page.getByLabel('Date and time (required)').getAttribute('min')
  if (!min) throw new Error('The date box has no minimum')
  return `${min.slice(0, 10)}T${time}`
}

// SQD-10 to SQD-13: the director opens the form from the Sweepers page, fixes the errors, adds the
// sweeper with bonus pins, and lands on the list with a toast and a new card.
test('a director adds a sweeper with bonus pins and sees it in the list', async ({ page }) => {
  await openForm(page)

  await page.getByRole('button', { name: 'Add sweeper' }).click()
  await expect(page.getByRole('alert')).toContainText('Fix')
  await expect(page.getByLabel('Date and time (required)')).toBeFocused()

  await page.getByLabel('Date and time (required)').fill(await firstDayAt(page, '21:30'))
  await page.getByLabel('Starting lane (required)').fill('3')
  await page.getByLabel('Number of lanes (required)').fill('10')
  await page.getByLabel('Bowlers per pair (required)').fill('5')
  await page.getByLabel('Entry fee (required)').fill('35')
  await page.getByLabel('Games (required)').fill('4')
  await page.getByLabel('Cash ratio (required)').fill('6.5')
  await page.getByLabel('Open', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Add sweeper' }).click()

  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByText('Sweeper created')).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: '9:30 PM' })
  await expect(card).toContainText('3 to 12 (10 lanes)')
  await expect(card).toContainText('Up to 5')
  await expect(card).toContainText('$35.00')
  await expect(card).toContainText('Open: +12')
})

test('a rule the browser checks shows under its box', async ({ page }) => {
  await openForm(page)

  await page.getByLabel('Date and time (required)').fill(await firstDayAt(page, '18:00'))
  await page.getByLabel('Starting lane (required)').fill('1')
  await page.getByLabel('Number of lanes (required)').fill('10')
  await page.getByLabel('Bowlers per pair (required)').fill('4')
  await page.getByLabel('Entry fee (required)').fill('0')
  await page.getByLabel('Games (required)').fill('3')
  await page.getByLabel('Cash ratio (required)').fill('5')
  await page.getByRole('button', { name: 'Add sweeper' }).click()

  await expect(page.getByLabel('Entry fee (required)')).toHaveAccessibleDescription(
    /Entry fee must be greater than \$0/,
  )
  await expect(page.getByLabel('Entry fee (required)')).toBeFocused()
})

test('a bonus-pins box takes 0 to 99 only', async ({ page }) => {
  await openForm(page)

  await page.getByLabel('Open', { exact: true }).fill('100')
  await page.getByLabel('Open', { exact: true }).blur()

  await expect(page.getByLabel('Open', { exact: true })).toHaveAccessibleDescription(
    /Bonus pins must be between 0 and 99/,
  )
})

test('a visitor who is not signed in sees no New sweeper link', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')

  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New sweeper' })).toHaveCount(0)
})
