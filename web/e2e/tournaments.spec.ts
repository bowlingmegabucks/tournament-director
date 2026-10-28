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

test('a tournament sidebar leads to its divisions table (DIV-12, DIV-13)', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()

  await page
    .getByRole('navigation', { name: /Northeast MegaBuck/ })
    .getByRole('link', { name: 'Divisions' })
    .click()

  await expect(page.getByRole('heading', { name: 'Divisions', level: 1 })).toBeVisible()
  const names = page.getByRole('rowheader')
  await expect(names).toHaveText(['Open', 'Women', 'Seniors', 'Scratch'])
  await expect(page.getByRole('row', { name: /Women/ })).toContainText('90% of 220, max 40 a game')
})

test('a tournament sidebar leads to its squads and sweepers (SQD-21, SQD-22)', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  const sidebar = page.getByRole('navigation', { name: /Northeast MegaBuck/ })

  await sidebar.getByRole('link', { name: 'Squads' }).click()

  await expect(page.getByRole('heading', { name: 'Squads', level: 1 })).toBeVisible()
  const squads = page.getByRole('heading', { level: 2, name: /\d{2}\/\d{2}\/\d{4}/ })
  await expect(squads).toHaveText([
    'Sat 10/24/2026 9:00 AMComplete',
    'Sat 10/24/2026 1:00 PMOpen',
    'Sun 10/25/2026 9:00 AMOpen',
  ])
  await expect(page.getByText('$60.00 (override)')).toBeVisible()

  await sidebar.getByRole('link', { name: 'Sweepers' }).click()

  await expect(page.getByRole('heading', { name: 'Sweepers', level: 1 })).toBeVisible()
  await expect(page.getByText('Open: +10')).toBeVisible()
  await expect(page.getByText('Women: +6')).toHaveCount(2)
})

test('a tournament sidebar leads to its registrations, which a filter narrows (REG-23, REG-24)', async ({
  page,
}) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()

  await page
    .getByRole('navigation', { name: /Northeast MegaBuck/ })
    .getByRole('link', { name: 'Registrations' })
    .click()

  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  const names = page.getByRole('rowheader')
  await expect(names).toHaveText([
    'Dana Abbott',
    'Ray Baptiste, Jr',
    'Maria Chen',
    'Tom Delgado',
    'Joe Fontaine',
    'Joe Fontaine',
  ])
  await expect(page.getByRole('heading', { name: 'By division' })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Filter by name or USBC ID' }).fill('joe 2045')

  await expect(names).toHaveText(['Joe Fontaine'])
  await expect(page.getByText('Showing 1 of 6 registrations.')).toBeVisible()
  // The summary counts the whole tournament, filtered or not.
  await expect(page.getByRole('term').filter({ hasText: 'Bowlers registered' })).toBeVisible()
})

test('on a narrow screen the card leaves out a blank super sweeper (REG-23, D-47)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await page.getByRole('link', { name: 'Registrations' }).click()
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()

  const lastCell = (name: string) =>
    page.getByRole('rowheader', { name }).locator('xpath=..').locator('td').last()

  await expect(lastCell('Dana Abbott')).toBeVisible()
  await expect(lastCell('Ray Baptiste, Jr')).toBeHidden()
})
