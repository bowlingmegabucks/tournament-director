import { expect, test, type Page } from '@playwright/test'
import { menuLink, sidebar, signInAsDirector } from './menu'

/**
 * Every page fits a 320 px phone with no sideways scroll, on the page or inside a table or
 * wrapper (D-73). A wide table reflows into stacked rows instead. The mock server forgets its
 * tournaments on a full page load, so the test moves by links, as a visitor does.
 */
test.use({ viewport: { width: 320, height: 800 } })

/** Elements that scroll sideways, and the page itself. The visually hidden table heads are exempt. */
async function sidewaysScrollers(page: Page) {
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

/** A stacked cell with no value still prints its label above nothing, unless it is hidden. */
const emptyLabelledCells = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('td[data-label]')].filter(
        (cell) => !cell.textContent?.trim() && getComputedStyle(cell).display !== 'none',
      ).length,
  )

async function fits(page: Page, where: string) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/^Loading/)).toHaveCount(0)
  expect(await sidewaysScrollers(page), where).toEqual([])
  expect(await emptyLabelledCells(page), `${where}: empty labelled cells`).toBe(0)
}

test('every page fits a phone with no sideways scroll, signed in as a director (D-73)', async ({
  page,
}) => {
  // The registrations and lane pages need sign-in (D-52). Signing in ends on the home page.
  await signInAsDirector(page)
  await fits(page, 'home')
  await page.getByRole('link', { name: 'All tournaments' }).click()
  await fits(page, 'tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await expect(sidebar(page)).toBeVisible()
  await fits(page, 'overview')

  for (const link of ['Divisions', 'Registrations', 'At-large', 'Seeding']) {
    await menuLink(page, link)
    await fits(page, link)
  }

  for (const [list, tabs] of [
    ['Squads', ['Lane assignments', 'Scores', 'Results']],
    ['Sweepers', ['Lane assignments', 'Scores', 'Results']],
  ] as const) {
    await menuLink(page, list)
    await fits(page, list)
    const sessions = page.getByRole('main').getByRole('link', { name: /\d{1,2}:\d{2} [AP]M/ })
    await expect(sessions.first()).toBeVisible()
    const count = await sessions.count()
    for (let index = 0; index < count; index++) {
      await menuLink(page, list)
      await expect(sessions.first()).toBeVisible()
      await sessions.nth(index).click()
      await fits(page, `${list} ${index}`)
      for (const tab of tabs) {
        await page.getByRole('link', { name: tab }).click()
        await fits(page, `${list} ${index} ${tab}`)
      }
    }
  }

  await menuLink(page, 'Sweepers')
  await page.getByRole('link', { name: 'Super sweeper results' }).click()
  await fits(page, 'super sweeper')
})
