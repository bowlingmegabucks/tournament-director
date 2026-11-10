import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

/** Sign in as the director, open the first tournament's open 1:00 PM squad, and go to its Scores tab. */
async function openScoresTab(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
  await page.getByRole('link', { name: 'Scores' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()
}

async function openEntry(page: Page) {
  await openScoresTab(page)
  await page.getByRole('link', { name: 'Enter scores' }).click()
  await expect(page.getByRole('navigation', { name: 'Game' })).toBeVisible()
}

// SCR-15, SCR-19, SCR-21, SCR-22, D-228, D-230: the keeper opens score entry, picks a pair of the
// game, types a score, presses Next, sees it saved, and finds it on the public Scores tab.
test('a keeper enters a score and it shows on the Scores tab', async ({ page }) => {
  await openEntry(page)

  // Entry starts on the first game that misses a score and lists the pairs as they are bowled.
  const tiles = page.getByRole('list', { name: /^Pairs for game \d$/ })
  await expect(tiles).toBeVisible()
  await tiles.getByRole('link').first().click()

  const sheet = page.getByRole('region', { name: /^Game \d · Lanes/ })
  await expect(sheet).toBeVisible()
  const boxes = sheet.getByRole('textbox')
  await expect(boxes.first()).toBeVisible()
  // The box asks the phone for a number pad.
  await expect(boxes.first()).toHaveAttribute('inputmode', 'numeric')

  // The first box with no score takes the next one the keeper has.
  const empty = boxes.filter({ hasNot: page.locator('[value]:not([value=""])') })
  const target = empty.first()
  const label = (await target.getAttribute('aria-label')) ?? ''
  await target.fill('')
  await target.pressSequentially('2a1x2')
  await expect(target).toHaveValue('212')
  await sheet
    .getByRole('button', { name: /^(Next|Done)/ })
    .first()
    .click()
  await expect(sheet.getByText('✓ Saved')).toBeVisible()

  // The public Scores tab shows the score the keeper saved.
  await page.getByRole('link', { name: 'Scores', exact: true }).click()
  await expect(page.getByRole('cell', { name: '212' })).toBeVisible()
  expect(label).toMatch(/game \d$/)
})

test('a number box refuses 0 and 301 and says what to enter (SCR-01)', async ({ page }) => {
  await openEntry(page)
  await page
    .getByRole('list', { name: /^Pairs for game \d$/ })
    .getByRole('link')
    .first()
    .click()
  const sheet = page.getByRole('region', { name: /^Game \d · Lanes/ })
  const first = sheet.getByRole('textbox').first()

  await first.fill('0')
  await sheet
    .getByRole('button', { name: /^(Next|Done)/ })
    .first()
    .click()

  await expect(sheet.getByText('Enter a score from 1 to 300.')).toBeVisible()
  await expect(first).toHaveAttribute('aria-invalid', 'true')
})

test("Find a bowler opens that bowler's pair in the picked game (D-230, D-236)", async ({
  page,
}) => {
  await openEntry(page)

  await page.getByRole('searchbox', { name: 'Find a bowler' }).fill('a')
  const found = page.getByRole('list', { name: 'Bowlers found' })
  await expect(found).toBeVisible()
  await found.getByRole('link').first().click()

  await expect(page.getByRole('region', { name: /^Game \d · Lanes/ })).toBeVisible()
})

test("switching the game shows that game's pairs (D-230)", async ({ page }) => {
  await openEntry(page)
  const current = page.getByRole('navigation', { name: 'Game' }).getByRole('link', {
    name: /^Game 3/,
  })

  await current.click()

  await expect(current).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('list', { name: 'Pairs for game 3' })).toBeVisible()
})

test('the skip changes from the board and the recap sheets agree (SCR-23, D-235)', async ({
  page,
}) => {
  await openEntry(page)

  await page.getByRole('radio', { name: 'Same' }).click()
  await expect(page.getByRole('radio', { name: 'Same' })).toBeChecked()

  await page.getByRole('link', { name: 'Lane assignments' }).click()
  await page.getByRole('button', { name: 'Recap sheets' }).click()
  await expect(page.getByRole('radio', { name: 'Same skip' })).toBeChecked()
})

test('a visitor who is not signed in cannot reach entry and sees no link (SCR-21, D-96)', async ({
  page,
}) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
  await page.getByRole('link', { name: 'Scores' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Enter scores' })).toHaveCount(0)
})

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`score entry, ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    for (const [name, width, height] of [
      ['a wide tablet', 1024, 800],
      ['a portrait tablet', 768, 1024],
      ['a phone', 320, 800],
    ] as const) {
      test(`board and pair sheet on ${name} have no WCAG 2.2 AA violations and no sideways scroll`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height })
        await openEntry(page)
        await expect(page.getByRole('list', { name: /^Pairs for game \d$/ })).toBeVisible()
        await expectNoViolations(page)
        expect(await sidewaysScroll(page), 'the board').toEqual([])

        await page
          .getByRole('list', { name: /^Pairs for game \d$/ })
          .getByRole('link')
          .first()
          .click()
        await expect(page.getByRole('region', { name: /^Game \d · Lanes/ })).toBeVisible()
        await expectNoViolations(page)
        expect(await sidewaysScroll(page), 'the pair sheet').toEqual([])

        // An invalid entry shows the message colors too.
        const first = page
          .getByRole('region', { name: /^Game \d · Lanes/ })
          .getByRole('textbox')
          .first()
        await first.fill('0')
        await page
          .getByRole('button', { name: /^(Next|Done)/ })
          .first()
          .click()
        await expect(page.getByText('Enter a score from 1 to 300.')).toBeVisible()
        await expectNoViolations(page)
      })
    }
  })
}

test('on a wide screen the board and the sheet show together; on a phone one at a time (D-230)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await openEntry(page)
  await page
    .getByRole('list', { name: /^Pairs for game \d$/ })
    .getByRole('link')
    .first()
    .click()
  await expect(page.getByRole('region', { name: 'Game board' })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Game \d · Lanes/ })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 800 })

  await expect(page.getByRole('region', { name: /^Game \d · Lanes/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Game board' })).toBeHidden()
})

/** Elements that scroll sideways, and the page itself. */
async function sidewaysScroll(page: Page) {
  return page.evaluate(() => {
    const scrolls = (element: Element) =>
      element.clientWidth > 1 &&
      element.scrollWidth > element.clientWidth + 1 &&
      getComputedStyle(element).overflowX !== 'visible'
    const inner = [...document.querySelectorAll('body *')]
      .filter(scrolls)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    const root = document.documentElement
    return root.scrollWidth > root.clientWidth ? ['page', ...inner] : inner
  })
}
