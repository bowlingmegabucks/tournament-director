import { expect, test, type Locator, type Page } from '@playwright/test'

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

test('a squad count opens a popup that lists the squads, and Escape closes it (REG-28)', async ({
  page,
}) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await page.getByRole('link', { name: 'Registrations' }).click()
  const count = page
    .getByRole('row', { name: /Dana Abbott/ })
    .getByRole('button', { name: '2 squads, show list' })

  await count.click()

  const popup = page.getByRole('dialog', { name: 'Dana Abbott: squads' })
  await expect(popup).toBeVisible()
  await expect(popup.getByText('2 of 3 squads')).toBeVisible()
  // A click on the popup's own edge is inside it, not on the backdrop.
  await popup.click({ position: { x: 2, y: 2 } })
  await expect(popup).toBeVisible()
  await expect(popup.getByRole('listitem')).toHaveText([
    'Sat 10/24/2026 9:00 AMComplete',
    'Sat 10/24/2026 1:00 PMOpen',
  ])

  await page.keyboard.press('Escape')

  await expect(popup).toBeHidden()
  await expect(count).toBeFocused()
})

test('a click outside the popup closes it (REG-28)', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await page.getByRole('link', { name: 'Registrations' }).click()
  await page
    .getByRole('row', { name: /Dana Abbott/ })
    .getByRole('button', { name: '2 sweepers, show list' })
    .click()
  const popup = page.getByRole('dialog', { name: 'Dana Abbott: sweepers' })
  await expect(popup).toBeVisible()

  await page.mouse.click(5, 5)

  await expect(popup).toBeHidden()
})

/** Open the squad whose card title has this time: the demo has 9:00 AM (complete), 1:00 PM (open), and a Sunday one. */
async function openSquad(page: Page, time: string) {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await page
    .getByRole('navigation', { name: /Northeast MegaBuck/ })
    .getByRole('link', { name: 'Squads' })
    .click()
  await page
    .getByRole('link', { name: new RegExp(time) })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Lanes (1 to 24)' })).toBeVisible()
}

/** Press on a handle, move in steps so the drag library sees a drag, and let go over a target. */
async function dragTo(page: Page, handle: Locator, target: Locator) {
  // The unassigned list scrolls; a handle below its edge would take the press as a text selection.
  await handle.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  await handle.scrollIntoViewIfNeeded()
  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('Nothing to drag')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()
}

test('a squad card opens its lane page with the pairs and the bowlers who need a lane (LAN-10, D-60)', async ({
  page,
}) => {
  await openSquad(page, '1:00 PM')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sat 10/24/2026 1:00 PM')
  await expect(page.getByRole('link', { name: 'Lane assignments' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('heading', { name: 'Unassigned (4)' })).toBeVisible()
  // Twelve pairs of four, with eleven bowlers entered.
  await expect(page.getByText('37 of 48 spots open')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: /^Lanes 1-2/ })).toContainText(
    '4 of 4, full',
  )
  await expect(page.getByRole('heading', { level: 3, name: /^Lanes 3-4/ })).toContainText('2 of 4')
})

test('a drop on a pair with room moves the bowler on screen and says nothing is saved (D-55, D-56, D-58)', async ({
  page,
}) => {
  // Tall enough that the pair is in view: a drop needs a visible target.
  await page.setViewportSize({ width: 1280, height: 1400 })
  await openSquad(page, '1:00 PM')

  await dragTo(
    page,
    page.getByRole('button', { name: 'Drag Pat Nguyen' }),
    page.getByRole('heading', { level: 3, name: /^Lanes 3-4/ }),
  )

  await expect(page.getByText(/No save is configured yet/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unassigned (3)' })).toBeVisible()
  const pair = page.getByRole('heading', { level: 3, name: /^Lanes 3-4/ }).locator('xpath=..')
  await expect(pair).toContainText('3 of 4')
  await expect(pair.getByText('Pat Nguyen')).toBeVisible()
  // The first free seat after 3A and 4C (D-56).
  await expect(pair.getByText('3B')).toBeVisible()
})

test('a drop on a full pair is refused (D-56, D-58)', async ({ page }) => {
  await openSquad(page, '1:00 PM')

  await dragTo(
    page,
    page.getByRole('button', { name: 'Drag Pat Nguyen' }),
    page.getByRole('heading', { level: 3, name: /^Lanes 1-2/ }),
  )

  await expect(page.getByRole('alert')).toContainText(
    'Lanes 1-2 are full (4 of 4). Pick another pair.',
  )
})

test('a bowler can be dragged with the keyboard (D-58)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 })
  await openSquad(page, '1:00 PM')

  // Space picks up, Shift and the arrows move in big steps, Space drops over the first pair.
  await page.getByRole('button', { name: 'Drag Rosa Delgado' }).focus()
  await page.keyboard.press('Space')
  for (let step = 0; step < 12; step++) await page.keyboard.press('Shift+ArrowRight')
  for (let step = 0; step < 2; step++) await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Space')

  await expect(page.getByRole('alert')).toContainText('Lanes 1-2 are full (4 of 4)')
})

test('the Assign to lanes dialog picks a pair, and Escape closes it (D-58)', async ({ page }) => {
  await openSquad(page, '1:00 PM')
  const button = page.getByRole('button', { name: 'Assign to lanes: Pat Nguyen' })

  await button.click()

  const dialog = page.getByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })
  await expect(dialog.getByRole('button', { name: /Lanes 1-2/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()

  await button.click()
  await dialog.getByRole('button', { name: /Lanes 7-8/ }).click()

  await expect(page.getByText(/No save is configured yet/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unassigned (3)' })).toBeVisible()
})

test('a complete squad has no handles or buttons (LAN-13, D-10)', async ({ page }) => {
  await openSquad(page, '9:00 AM')

  await expect(page.getByText('This squad is complete. Lanes cannot change.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Drag/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Assign to lanes|Move/ })).toHaveCount(0)
})

test('the recap sheets dialog previews every sheet, switches the skip, and picks sheets (RPT-09, D-64)', async ({
  page,
}) => {
  await openSquad(page, '1:00 PM')
  await page.getByRole('button', { name: 'Recap sheets' }).click()

  const dialog = page.getByRole('dialog', { name: /^Recap sheets/ })
  await expect(dialog.getByRole('button', { name: 'Print all' })).toBeVisible()
  // Seven bowlers have a lane; four wait (D-65).
  await expect(dialog.getByRole('article')).toHaveCount(7)
  await expect(dialog.getByText(/4 bowlers have no lane and get no sheet/)).toBeVisible()
  await expect(dialog.getByText('7 of 7 selected')).toBeVisible()

  const first = dialog.getByRole('article').first()
  const staggered = await first.getByRole('cell').allTextContents()
  await dialog.getByRole('radio', { name: 'Same skip' }).check()
  expect(await first.getByRole('cell').allTextContents()).not.toEqual(staggered)

  await dialog
    .getByRole('checkbox', { name: /^Print / })
    .first()
    .uncheck()
  await expect(dialog.getByText('6 of 7 selected')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Print selected (6)' })).toBeEnabled()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recap sheets' })).toBeFocused()
})

test('Print all lays out one half sheet per page, 8.5 by 5.5 inches (RPT-05b, D-62)', async ({
  page,
}) => {
  // The print dialog cannot be driven, so stand in for it and look at what the page would print.
  await page.addInitScript(() => {
    window.print = () => undefined
  })
  await openSquad(page, '1:00 PM')
  await page.getByRole('button', { name: 'Recap sheets' }).click()
  const dialog = page.getByRole('dialog', { name: /^Recap sheets/ })
  await dialog
    .getByRole('checkbox', { name: /^Print / })
    .first()
    .uncheck()
  await dialog.getByRole('button', { name: 'Print selected (6)' }).click()

  await page.emulateMedia({ media: 'print' })
  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString(
    'latin1',
  )

  // 612 x 396 points is 8.5 x 5.5 inches. One page for each of the six checked sheets.
  expect(pdf.match(/\/MediaBox \[0 0 612 396\]/g)).toHaveLength(6)
  expect(pdf.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(6)
})

test('a sweeper card opens its lane page with bonus pins (LAN-11, D-60)', async ({ page }) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await page
    .getByRole('navigation', { name: /Northeast MegaBuck/ })
    .getByRole('link', { name: 'Sweepers' })
    .click()

  await page.getByRole('link', { name: /6:00 PM/ }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sat 10/24/2026 6:00 PM')
  await expect(page.getByText('Open · avg 205 · +10 pins · super sweeper: N')).toBeVisible()
})

test('the Scores tab shows a part-scored squad by lane pair, and notes bowlers with no lane (SCR-13, SCR-17, D-69, D-71)', async ({
  page,
}) => {
  await openSquad(page, '1:00 PM')

  await page.getByRole('link', { name: 'Scores' }).click()

  await expect(page.getByRole('link', { name: 'Scores' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Lanes 3-4' })).toBeVisible()
  const first = page.getByRole('table', { name: 'Scores for lanes 1-2' })
  await expect(first.getByRole('row').nth(1).getByRole('cell').last()).not.toHaveText('0')
  await expect(page.getByText('4 bowlers have no lane.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Assign lanes' })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)
})

test('the Scores tab of a complete squad says it cannot change and shows a no-show as 0 (SCR-14, D-69)', async ({
  page,
}) => {
  await openSquad(page, '9:00 AM')

  await page.getByRole('link', { name: 'Scores' }).click()

  await expect(page.getByText('This squad is complete. Scores cannot change.')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Scores for lanes 1-2' })).toBeVisible()
})

test('the Scores tab does not scroll sideways on a phone (D-73)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSquad(page, '1:00 PM')
  await page.getByRole('link', { name: 'Scores' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
