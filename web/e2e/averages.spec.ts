import { expect, test } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/**
 * Checking averages (AVG-02 to AVG-07, AVG-11, D-287 to D-298). The mock server keeps its state until the
 * page reloads, so each test moves by links, as a visitor does.
 *
 * Demo data the tests lean on: Open, Women, and Seniors have a handicap, Scratch has none. Dana
 * Abbott (Open, average 205) and Maria Chen (Women, average 185, limit 199) are registered, and no one's
 * average is checked at first.
 */

async function openAverages(page: import('@playwright/test').Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Averages')
  await expect(page.getByRole('heading', { name: 'Averages', level: 1 })).toBeVisible()
}

test('a director verifies one bowler, adjusts another with a note, and sees both on the Registrations page', async ({
  page,
}) => {
  await openAverages(page)
  await expect(page.getByText('Not verified').first()).toBeVisible()

  // Verify Dana: she leaves the Unverified list.
  await page.getByRole('button', { name: 'Verify Dana Abbott' }).click()
  await expect(page.getByText('Average verified for Dana Abbott.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify Dana Abbott' })).toHaveCount(0)

  // Adjust Maria above her division's limit: the form says why, and nothing saves.
  await page.getByRole('button', { name: 'Adjust Maria Chen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Adjust average: Maria Chen' })
  await dialog.getByLabel('Verified average').fill('205')
  await dialog.getByRole('button', { name: 'Save adjusted average' }).click()
  await expect(
    dialog.getByText(
      'The verified average is above the division limit. Move the bowler to another division.',
    ),
  ).toBeVisible()
  await expect(
    dialog.getByText('Say why the average changed, or where it came from.'),
  ).toBeVisible()

  // Then with a fair average and a note.
  await dialog.getByLabel('Verified average').fill('190')
  await dialog.getByLabel(/Why was it adjusted/).fill('League sheet, 11/17')
  await dialog.getByRole('button', { name: 'Save adjusted average' }).click()
  await expect(page.getByText('Average adjusted for Maria Chen.')).toBeVisible()

  // The Registrations page shows a check mark, and the adjusted number with its details.
  await menuLink(page, 'Registrations')
  const dana = page.getByRole('row').filter({ hasText: 'Dana Abbott' })
  await expect(dana).toContainText('205')
  await expect(dana.getByText('verified')).toBeAttached()
  await page.getByRole('button', { name: 'Average 190, adjusted. Show details' }).click()
  const details = page.getByRole('dialog', { name: 'Average: Maria Chen' })
  await expect(details).toContainText('185')
  await expect(details).toContainText('190')
  await expect(details).toContainText('League sheet, 11/17')
})

test('a director takes a check away and the bowler is unverified again', async ({ page }) => {
  await openAverages(page)
  await page.getByRole('button', { name: 'Verify Dana Abbott' }).click()
  await expect(page.getByText('Average verified for Dana Abbott.')).toBeVisible()

  await page.getByRole('button', { name: 'All (', exact: false }).click()
  await page.getByRole('button', { name: 'Remove check for Dana Abbott' }).click()

  await expect(page.getByText('Check removed for Dana Abbott.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify Dana Abbott' })).toBeVisible()
})

test('the lane page marks a handicap bowler whose average is not verified (AVG-12)', async ({
  page,
}) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: 'Sat 10/24/2026 1:00 PM', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Unassigned/ })).toBeVisible()
  await expect(page.getByText('Avg not verified').first()).toBeVisible()
})
