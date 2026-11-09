import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn } from './menu'

/**
 * Deleting a registration is a destructive desk flow, so every path is here (REG-19, REG-25,
 * D-209 to D-215). The mock server keeps its state until the page reloads, so each test moves by
 * links, as a visitor does.
 *
 * Demo data the tests lean on:
 * - Squads: Sat 10/24 9:00 AM (complete, $50), Sat 10/24 1:00 PM ($60), Sun 10/25 9:00 AM ($50).
 * - Sweepers: Sat 10/24 6:00 PM ($25), Sun 10/25 5:00 PM (complete, $30).
 * - Joe Fontaine (5560-11902): Women, the 1:00 PM squad only. No payment, no scores: a plain delete.
 * - Tom Delgado: the 1:00 PM squad and the 6:00 PM sweeper, and he paid $85 outside this system.
 * - Dana Abbott: in complete sessions, so she has scores and cannot be deleted.
 */

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openRegistrations(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
}

/** The row of one bowler by USBC ID, for Joe Fontaine, who is in the list twice. */
const rowWith = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text })

const joe = (page: Page) => rowWith(page, '5560-11902')

async function openDialog(page: Page, name: string) {
  // Joe Fontaine is in the list twice: the 5560-11902 row is the one these tests use.
  const scope = name === 'Joe Fontaine' ? joe(page) : page
  await scope.getByRole('button', { name: `Delete ${name}'s registration` }).click()
  return page.getByRole('dialog', { name: `Delete ${name}'s registration?` })
}

const deleteInDialog = (page: Page) =>
  page.getByRole('dialog').getByRole('button', { name: 'Delete registration' })

test('every row has a Delete button of its own, apart from Edit and named for the bowler (REG-25, D-214, D-215)', async ({
  page,
}) => {
  await openRegistrations(page)

  await expect(page.getByRole('button', { name: /^Delete .*'s registration$/ })).toHaveCount(6)
  const row = rowWith(page, 'Tom Delgado')
  const edit = row.getByRole('link', { name: 'Edit Tom Delgado' })
  const remove = row.getByRole('button', { name: "Delete Tom Delgado's registration" })
  await expect(remove).toBeVisible()
  const cells = await Promise.all([
    edit.evaluate((node) => node.closest('td')?.cellIndex),
    remove.evaluate((node) => node.closest('td')?.cellIndex),
  ])
  expect(cells[1]).toBe((cells[0] ?? 0) + 1)
  // Red outline, not filled: the filled button is the confirm in the dialog.
  const style = await remove.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { background: computed.backgroundColor, border: computed.borderColor }
  })
  expect(style.background).toBe('rgba(0, 0, 0, 0)')
  expect(style.border).not.toBe('rgba(0, 0, 0, 0)')
})

test('a plain delete lists the entries and the total, then removes the row with a toast (REG-19, D-212, D-213)', async ({
  page,
}) => {
  await openRegistrations(page)

  const dialog = await openDialog(page, 'Joe Fontaine')

  await expect(dialog.getByText('Refund may be due, handled outside the app')).toBeVisible()
  await expect(
    dialog.getByRole('row', { name: 'Squad, Sat 10/24/2026 1:00 PM $60.00' }),
  ).toBeVisible()
  await expect(dialog.getByRole('row', { name: 'Total $60.00' })).toBeVisible()
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await expect(deleteInDialog(page)).toBeEnabled()
  await deleteInDialog(page).click()

  await expect(page.getByText('Joe Fontaine: Registration deleted.')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(joe(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Delete .*'s registration$/ })).toHaveCount(5)
})

test('Cancel and Escape leave the registration alone (REG-19, D-213)', async ({ page }) => {
  await openRegistrations(page)

  const dialog = await openDialog(page, 'Joe Fontaine')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(joe(page)).toHaveCount(1)

  await openDialog(page, 'Joe Fontaine')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(joe(page)).toHaveCount(1)
  await expect(page.getByText('Registration deleted')).toHaveCount(0)
})

test('a real payment shows what was paid and needs a tick before Delete turns on (D-210, D-212, D-213)', async ({
  page,
}) => {
  await openRegistrations(page)

  const dialog = await openDialog(page, 'Tom Delgado')

  await expect(
    dialog.getByRole('row', { name: 'Squad, Sat 10/24/2026 1:00 PM $60.00' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('row', { name: 'Sweeper, Sat 10/24/2026 6:00 PM $25.00' }),
  ).toBeVisible()
  await expect(dialog.getByRole('row', { name: 'Entries total $85.00' })).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText(
    'Paid outside this system: $85.00 (BowlingSite, 1 payment)',
  )
  await expect(dialog.getByText(/Any refund is handled outside the app/).first()).toBeVisible()
  await expect(deleteInDialog(page)).toBeDisabled()

  const tick = dialog.getByRole('checkbox', {
    name: 'I know this bowler paid outside this system and any refund is handled outside the app.',
  })
  await tick.check()
  await expect(deleteInDialog(page)).toBeEnabled()
  await tick.uncheck()
  await expect(deleteInDialog(page)).toBeDisabled()
  await tick.check()
  await deleteInDialog(page).click()

  await expect(page.getByText('Tom Delgado: Registration deleted.')).toBeVisible()
  await expect(rowWith(page, 'Tom Delgado')).toHaveCount(0)
})

test('a bowler with scores cannot be deleted: the dialog says why and offers only Close (REG-19, D-211)', async ({
  page,
}) => {
  await openRegistrations(page)

  const dialog = await openDialog(page, 'Dana Abbott')

  await expect(dialog.getByText('Cannot delete registration with scores.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Delete registration' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(rowWith(page, 'Dana Abbott')).toHaveCount(1)
})

test('the edit page has a Danger zone, and a delete from it returns to the list with a toast (D-214, D-215)', async ({
  page,
}) => {
  await openRegistrations(page)
  await joe(page).getByRole('link', { name: 'Edit Joe Fontaine' }).click()
  await expect(page.getByRole('heading', { name: 'Edit registration', level: 1 })).toBeVisible()

  const zone = page.getByRole('region', { name: 'Danger zone' })
  await expect(zone).toBeVisible()
  await expect(zone).toContainText('cannot be undone')
  await zone.getByRole('button', { name: 'Delete registration' }).click()
  await expect(
    page.getByRole('dialog', { name: "Delete Joe Fontaine's registration?" }),
  ).toBeVisible()
  await deleteInDialog(page).click()

  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByText('Joe Fontaine: Registration deleted.')).toBeVisible()
  await expect(joe(page)).toHaveCount(0)
})

test('removing the last squad on the edit page points to delete (D-203, D-214)', async ({
  page,
}) => {
  await openRegistrations(page)
  await joe(page).getByRole('link', { name: 'Edit Joe Fontaine' }).click()
  await expect(page.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()

  await page.getByLabel(/Sat 10\/24\/2026 1:00 PM/).uncheck()
  await page.getByRole('button', { name: 'Next: review' }).click()

  // The page shows it in the summary and under the squads: check the one under the field.
  await expect(page.locator('#registration-squads-error')).toHaveText(
    'Bowler must enter at least one squad. To remove the last one, delete the registration.',
  )
})

test('Delete is not offered to a score keeper (D-198)', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('scorekeeper@example.com')
  await page.getByLabel('Password').fill('scoreKeeperP4sswordLocal')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Tournaments' })
    .click()
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')

  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(rowWith(page, 'Tom Delgado')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})

test.describe('on a phone (D-73, D-215)', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  async function sideways(page: Page) {
    return page.evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth > root.clientWidth
    })
  }

  test('the card puts Delete below Edit, and the paid dialog fits with no sideways scroll', async ({
    page,
  }) => {
    await openRegistrations(page)
    const remove = page.getByRole('button', { name: "Delete Tom Delgado's registration" })
    const edit = page.getByRole('link', { name: 'Edit Tom Delgado' })
    const [editBox, removeBox] = await Promise.all([edit.boundingBox(), remove.boundingBox()])
    expect((removeBox?.y ?? 0) > (editBox?.y ?? 0) + (editBox?.height ?? 0)).toBe(true)
    expect(await sideways(page)).toBe(false)

    const dialog = await openDialog(page, 'Tom Delgado')
    await expect(dialog.getByRole('checkbox')).toBeVisible()
    expect(await sideways(page)).toBe(false)
    const box = await dialog.boundingBox()
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 320).toBe(true)
    await dialog.getByRole('checkbox').check()
    await deleteInDialog(page).click()

    await expect(page.getByText('Tom Delgado: Registration deleted.')).toBeVisible()
    expect(await sideways(page)).toBe(false)
  })

  test('the Danger zone on the edit page fits with no sideways scroll', async ({ page }) => {
    await openRegistrations(page)
    await page.getByRole('link', { name: 'Edit Tom Delgado' }).click()
    await expect(page.getByRole('region', { name: 'Danger zone' })).toBeVisible()

    expect(await sideways(page)).toBe(false)
  })
})

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    async function expectNoViolations(page: Page) {
      const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
      expect(violations).toEqual([])
    }

    test('the list with its Delete buttons, and each dialog state, have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openRegistrations(page)
      await expectNoViolations(page)

      await openDialog(page, 'Joe Fontaine')
      await expect(page.getByText('Refund may be due, handled outside the app')).toBeVisible()
      await expectNoViolations(page)
      await page.getByRole('button', { name: 'Cancel' }).click()

      await openDialog(page, 'Tom Delgado')
      await expect(deleteInDialog(page)).toBeDisabled()
      await expectNoViolations(page)
      await page.getByRole('checkbox').check()
      await expectNoViolations(page)
      await page.getByRole('button', { name: 'Cancel' }).click()

      await openDialog(page, 'Dana Abbott')
      await expect(page.getByText('Cannot delete registration with scores.')).toBeVisible()
      await expectNoViolations(page)
    })

    test('the edit page Danger zone has no WCAG 2.2 AA violations', async ({ page }) => {
      await openRegistrations(page)
      await page.getByRole('link', { name: 'Edit Tom Delgado' }).click()
      await expect(page.getByRole('region', { name: 'Danger zone' })).toBeVisible()

      await expectNoViolations(page)
    })
  })
}
