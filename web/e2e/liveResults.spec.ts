import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/**
 * The TV page and the Results tab's ranking toggle (RES-45, RES-50 to RES-54, D-239, D-242). The
 * mock server has no live scores, so these tests cover what a viewer sees and can do: the link in
 * the sidebar, the screens, the toggle in the address, and the accessibility scan in both color
 * schemes and with reduced motion. The stream, the strip, and the scroll are unit tests.
 */

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openTournament(page: Page) {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

test('the sidebar opens the TV page, which fills the screen with every screen of results (RES-50, RES-54)', async ({
  page,
}) => {
  await openTournament(page)

  await menuLink(page, 'Live results')

  await expect(page).toHaveURL(/\/tournaments\/[^/]+\/liveResults$/)
  await expect(page.getByRole('heading', { level: 1, name: /^Live results/ })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Results for the Open division' }).first(),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Sweeper results' }).first()).toBeVisible()
  await expect(page.getByRole('table', { name: 'Super sweeper results' }).first()).toBeVisible()
  // No header, main menu, or sidebar: the page is the screen.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('status').first()).toHaveText(/^Updated \d{1,2}:\d{2} (am|pm)$/)
})

test('the TV page scrolls on its own, and the heading stays pinned at the top (RES-50, D-254)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 400 })
  await openTournament(page)
  await menuLink(page, 'Live results')
  const heading = page.getByRole('heading', { level: 2 }).first()
  await expect(heading).toBeVisible()
  const view = page.locator('main > div').first()
  const scrolled = () => view.evaluate((node) => node.scrollTop)

  // 40 pixels a second: it moves within a few seconds.
  await expect.poll(scrolled, { timeout: 8000 }).toBeGreaterThan(5)

  // The line under the column heads is a shadow in the cell, so it stays under the pinned head.
  const head = page.getByRole('columnheader').first()
  expect(await head.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none')

  // The first division's heading sits at the top of the view while its rows go past.
  const mainTop = (await page.locator('main').boundingBox())?.y ?? 0
  const headingTop = (await heading.boundingBox())?.y ?? 0
  expect(Math.abs(headingTop - mainTop)).toBeLessThan(2)
})

test('on a phone the pinned heading leaves room for rows, and the page does not scroll sideways (RES-50, D-73)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTournament(page)
  await menuLink(page, 'Live results')
  const heading = page.getByRole('heading', { level: 2 }).first()
  await expect(heading).toBeVisible()

  // The heading block (name, counts, cut and cash lines) takes under a third of the screen.
  const pinned = await heading.evaluate(
    (node) => node.parentElement?.getBoundingClientRect().height,
  )
  expect(pinned).toBeLessThan(844 / 3)

  // A bowler's +/- figure sits on the name's line, at the right edge of the card.
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader') })
    .first()
  const name = (await row.getByRole('rowheader').boundingBox()) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }
  const figure = (await row.getByRole('cell').nth(1).boundingBox()) ?? name
  const card = (await row.boundingBox()) ?? name
  expect(Math.abs(figure.y - name.y)).toBeLessThan(8)
  expect(figure.x).toBeGreaterThan(name.x)
  expect(card.x + card.width - (figure.x + figure.width)).toBeLessThan(8)

  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(sideways).toBe(false)
})

test('on a phone a handicap card puts its totals on their own line (D-73)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTournament(page)
  await menuLink(page, 'Live results')
  // Only a handicap division has Scratch Total, so its cells are in the table that has the label.
  const scratch = page.locator('td[data-label="Scratch Total"]').first()
  await expect(scratch).toBeVisible()
  const row = scratch.locator('xpath=ancestor::tr[1]')
  const lastGame = row.locator('td[data-label^="G"]').last()
  const gameBox = (await lastGame.boundingBox()) ?? { y: 0, height: 0 }
  const scratchBox = (await scratch.boundingBox()) ?? gameBox

  // The totals sit below the games, not beside them.
  expect(scratchBox.y).toBeGreaterThan(gameBox.y + gameBox.height - 1)
  // The three totals share one line.
  const handicapTotal = (await row.locator('td[data-label="HDCP Total"]').boundingBox()) ?? gameBox
  expect(Math.abs(handicapTotal.y - scratchBox.y)).toBeLessThan(4)
})

test('the Results tab keeps the ranking in the address (RES-45, D-239)', async ({ page }) => {
  // The squad page opens on its lanes, which need sign-in; the Results tab itself is public.
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page
    .getByRole('link', { name: /1:00 PM/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Lanes (1 to 24)' })).toBeVisible()
  await page.getByRole('link', { name: 'Results', exact: true }).click()
  const ranking = page.getByRole('group', { name: 'Ranking' })
  await expect(ranking.getByRole('radio', { name: /^Through/ })).toBeChecked()

  await ranking.getByText('Live', { exact: true }).click()

  await expect(page).toHaveURL(/mode=live/)
  await expect(ranking.getByRole('radio', { name: 'Live' })).toBeChecked()
  await ranking.getByText(/^Through/).click()
  await expect(page).not.toHaveURL(/mode=/)
})

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('the TV page has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await openTournament(page)
      await menuLink(page, 'Live results')
      await expect(
        page.getByRole('table', { name: 'Results for the Open division' }).first(),
      ).toBeVisible()

      await expectNoViolations(page)
    })

    test('the TV page flips screens when the viewer asks for less motion, with no violations (RES-53)', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 1920, height: 1080 })
      await openTournament(page)
      await menuLink(page, 'Live results')

      await expect(page.getByText(/Screen 1 of \d+/)).toBeAttached()
      // One screen at a time: a single division heading, not the whole list.
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1)
      await expectNoViolations(page)
    })
  })
}
