import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn, sidebar } from './menu'

/**
 * Editing a registration is a critical desk flow: a prepaid bowler arrives and bowls another squad,
 * a bowler drops one, switches, or moves division. Every path of the edit feature is here
 * (REG-15 to REG-21, BWL-16, EDR-01 to EDR-05, D-197 to D-207). The mock server keeps its state until
 * the page reloads, so each test moves by links, as a visitor does.
 *
 * Demo data the tests lean on:
 * - Squads: Sat 10/24 9:00 AM (complete, $50), Sat 10/24 1:00 PM ($60), Sun 10/25 9:00 AM ($50).
 * - Sweepers: Sat 10/24 6:00 PM ($25), Sun 10/25 5:00 PM (complete, $30).
 * - Tom Delgado: Open (handicap), no USBC ID, average 190, the 1:00 PM squad and the 6:00 PM sweeper.
 * - Dana Abbott: Open, both Saturday squads (one complete), both sweepers (one complete), super sweeper.
 * - Joe Fontaine (5560-11902): Women, the 1:00 PM squad. The first save finds the last squad added by "the site".
 */

const morning = /Sat 10\/24\/2026 9:00 AM/
const afternoon = /Sat 10\/24\/2026 1:00 PM/
const sunday = /Sun 10\/25\/2026 9:00 AM/
const sweeperSaturday = /Sat 10\/24\/2026 6:00 PM/
const sweeperSunday = /Sun 10\/25\/2026 5:00 PM/

async function openRegistrations(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
}

async function rowOf(page: Page, name: string) {
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) })
  await expect(row).toHaveCount(1)
  return row
}

/** From the list, open the edit page of one bowler and wait for the Registration step. */
async function openEdit(page: Page, name: string) {
  await page.getByRole('link', { name: `Edit ${name}` }).click()
  await expect(page.getByRole('heading', { name: 'Edit registration', level: 1 })).toBeVisible()
  await expect(stepHeading(page, 'Registration')).toBeVisible()
}

const stepHeading = (page: Page, name: 'Bowler' | 'Registration' | 'Review') =>
  page.getByRole('heading', { name, level: 2 })

const nextTo = (page: Page, label: 'registration' | 'review') =>
  page.getByRole('button', { name: `Next: ${label}` }).click()

const save = (page: Page) => page.getByRole('button', { name: 'Save changes' })

async function openTomsEdit(page: Page) {
  await openRegistrations(page)
  await openEdit(page, 'Tom Delgado')
}

test('every row has an Edit link, and the page starts on Registration with what is stored (REG-25, D-197)', async ({
  page,
}) => {
  await openRegistrations(page)
  await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(6)

  await openEdit(page, 'Tom Delgado')

  await expect(page.getByLabel('Division (required)')).toHaveValue(/.+/)
  await expect(page.getByLabel('Average')).toHaveValue('190')
  await expect(page.getByLabel(afternoon)).toBeChecked()
  await expect(page.getByLabel(afternoon)).toBeEnabled()
  await expect(page.getByLabel(sunday)).not.toBeChecked()
  await expect(page.getByLabel(sweeperSaturday)).toBeChecked()
  await expect(page.getByText('Entered')).toHaveCount(2)
  await expect(page.getByLabel(morning)).toBeDisabled()
})

test('a prepaid bowler adds a squad at the desk: the fee to collect, one save, the list shows it (REG-21, D-200)', async ({
  page,
}) => {
  await openTomsEdit(page)

  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await expect(page.getByRole('row', { name: 'Squad Sun 10/25/2026 9:00 AM $50.00' })).toBeVisible()
  await expect(page.getByText('Net: collect $50.00.')).toBeVisible()
  await expect(page.getByText(/records a \$0 desk entry/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /I understand/ })).toHaveCount(0)
  await save(page).click()

  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByText('Tom Delgado: Registration updated. Added 1.')).toBeVisible()
  const row = await rowOf(page, 'Tom Delgado')
  await expect(row.getByRole('button', { name: '2 squads, show list' })).toBeVisible()
})

test('switching squads is one save: collect, refund, a net, and a tick before it saves (REG-20, REG-21, D-202, D-207)', async ({
  page,
}) => {
  await openTomsEdit(page)

  await page.getByLabel(afternoon).uncheck()
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await expect(page.getByRole('row', { name: 'Squad Sun 10/25/2026 9:00 AM $50.00' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Squad Sat 10/24/2026 1:00 PM $60.00' })).toBeVisible()
  await expect(page.getByText('Net: refund $10.00.')).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole('checkbox', { name: /I understand/ }).check()
  await expect(save(page)).toBeEnabled()
  await save(page).click()

  await expect(
    page.getByText('Tom Delgado: Registration updated. Added 1, removed 1.'),
  ).toBeVisible()
  const row = await rowOf(page, 'Tom Delgado')
  await expect(row.getByRole('button', { name: '1 squad, show list' })).toBeVisible()
  await row.getByRole('button', { name: '1 squad, show list' }).click()
  await expect(page.getByRole('dialog')).toContainText('Sun 10/25/2026 9:00 AM')
})

test('removing a sweeper shows the refund and needs the tick (REG-20, D-207)', async ({ page }) => {
  await openTomsEdit(page)

  await page.getByLabel(sweeperSaturday).uncheck()
  await nextTo(page, 'review')

  await expect(page.getByRole('table', { name: /Refund may be due/ })).toBeVisible()
  await expect(page.getByText('Net: refund $25.00.')).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole('checkbox', { name: /I understand/ }).check()
  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated. Removed 1.')).toBeVisible()
  const row = await rowOf(page, 'Tom Delgado')
  await expect(row.getByRole('button', { name: /sweeper, show list/ })).toHaveCount(0)
})

test('changing the tick choice after Back asks for it again (D-207)', async ({ page }) => {
  await openTomsEdit(page)
  await page.getByLabel(sweeperSaturday).uncheck()
  await nextTo(page, 'review')
  await page.getByRole('checkbox', { name: /I understand/ }).check()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByLabel(sweeperSaturday).check()
  await page.getByLabel(sweeperSaturday).uncheck()
  await nextTo(page, 'review')

  await expect(page.getByRole('checkbox', { name: /I understand/ })).not.toBeChecked()
  await expect(save(page)).toBeDisabled()
})

test('the last squad cannot be removed: the page says so before it asks the server (REG-03, D-04)', async ({
  page,
}) => {
  await openTomsEdit(page)

  await page.getByLabel(afternoon).uncheck()
  await nextTo(page, 'review')

  await expect(page.getByRole('alert')).toContainText('Bowler must enter at least one squad')
  await expect(stepHeading(page, 'Registration')).toBeVisible()
})

test('a complete squad and sweeper the bowler holds are locked, with the reason in words (REG-34, D-10)', async ({
  page,
}) => {
  await openRegistrations(page)
  await openEdit(page, 'Dana Abbott')

  await expect(page.getByLabel(morning)).toBeChecked()
  await expect(page.getByLabel(morning)).toBeDisabled()
  await expect(page.getByLabel(morning)).toHaveAccessibleDescription(
    'Cannot remove: this one is complete.',
  )
  await expect(page.getByLabel(sweeperSunday)).toBeDisabled()
  await expect(page.getByLabel(sweeperSunday)).toHaveAccessibleDescription(
    'Cannot remove: this one is complete.',
  )
  await expect(page.getByLabel(afternoon)).toBeEnabled()
})

test('a division change says it moves, and the list shows the new division (REG-15, D-205)', async ({
  page,
}) => {
  await openTomsEdit(page)

  await page.getByLabel('Division (required)').selectOption('Scratch')
  await nextTo(page, 'review')

  await expect(page.getByText('Moves the registration from Open to Scratch.')).toBeVisible()
  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated.')).toBeVisible()
  await expect(await rowOf(page, 'Tom Delgado')).toContainText('Scratch')
})

test('a handicap division without a USBC ID sends the desk to the Bowler step, where adding one saves (REG-05, BWL-18)', async ({
  page,
}) => {
  await openTomsEdit(page)
  await page.getByLabel('Division (required)').selectOption('Women')
  await nextTo(page, 'review')
  await save(page).click()

  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('USBC Id is required for Handicap Divisions')
  await page.getByLabel('USBC ID').fill('9999-88888')
  await nextTo(page, 'registration')
  await nextTo(page, 'review')
  await expect(page.getByText('USBC ID: not set → 9999-88888')).toBeVisible()
  await expect(page.getByText('Moves the registration from Open to Women.')).toBeVisible()
  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated.')).toBeVisible()
  const row = await rowOf(page, 'Tom Delgado')
  await expect(row).toContainText('Women')
  await expect(row).toContainText('9999-88888')
})

test('the average can change or clear, and must be 1 to 300 (REG-16)', async ({ page }) => {
  await openTomsEdit(page)
  await page.getByLabel('Average').fill('301')
  await nextTo(page, 'review')
  await expect(page.getByRole('alert')).toContainText('Average must be less than or equal to 300.')
  await page.getByLabel('Average').fill('0')
  await nextTo(page, 'review')
  await expect(page.getByRole('alert')).toContainText('Average must be greater than 0.')

  await page.getByLabel('Average').fill('')
  await nextTo(page, 'review')
  await expect(page.getByText('Average: 190 → (cleared)')).toBeVisible()
  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated.')).toBeVisible()
})

test('turning super sweeper off says so on Review and saves (REG-18, D-204)', async ({ page }) => {
  await openRegistrations(page)
  await openEdit(page, 'Dana Abbott')

  await page.getByRole('checkbox', { name: /Super sweeper/ }).uncheck()
  await nextTo(page, 'review')

  await expect(page.getByText('Super sweeper: turned off.')).toBeVisible()
  await save(page).click()

  await expect(page.getByText('Dana Abbott: Registration updated.')).toBeVisible()
  await expect((await rowOf(page, 'Dana Abbott')).getByText('No')).toBeVisible()
})

test('a bowler detail can change and an emptied box clears (BWL-16, D-206)', async ({ page }) => {
  await openTomsEdit(page)
  await page.getByRole('button', { name: '1. Bowler' }).click()
  await page.getByLabel('City').fill('Quincy')
  await page.getByLabel('State (2 letters)').fill('')
  await nextTo(page, 'registration')
  await nextTo(page, 'review')

  await expect(page.getByText('City: Worcester → Quincy')).toBeVisible()
  await expect(page.getByText('State: MA → (cleared)')).toBeVisible()
  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated.')).toBeVisible()
})

test('an emptied name is refused with the legacy words (BWL-01)', async ({ page }) => {
  await openTomsEdit(page)
  await page.getByRole('button', { name: '1. Bowler' }).click()

  await page.getByLabel('First name (required)').fill('')
  await nextTo(page, 'registration')

  await expect(page.getByRole('alert')).toContainText('First Name is Required')
  await expect(stepHeading(page, 'Bowler')).toBeVisible()
})

test('nothing changed: Review says so and offers no save, and Cancel leaves the list as it was', async ({
  page,
}) => {
  await openTomsEdit(page)

  await nextTo(page, 'review')

  await expect(page.getByText(/No changes yet/)).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(
    (await rowOf(page, 'Tom Delgado')).getByRole('button', { name: '1 squad, show list' }),
  ).toBeVisible()
})

test('the registration changed while the desk had it open: the desk is told and reloads (D-199)', async ({
  page,
}) => {
  await openRegistrations(page)
  await page
    .getByRole('row')
    .filter({ hasText: '5560-11902' })
    .getByRole('link', { name: /^Edit/ })
    .click()
  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await page.getByLabel('Average').fill('175')
  await nextTo(page, 'review')

  await save(page).click()

  await expect(page.getByText('This registration changed.')).toBeVisible()
  await expect(
    page.getByText(/Now entered: .*Sat 10\/24\/2026 1:00 PM.*Sun 10\/25\/2026 9:00 AM/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reload registration' }).click()

  await expect(page.getByText('This registration changed.')).toHaveCount(0)
  await expect(page.getByLabel(sunday)).toBeChecked()
  await expect(page.getByLabel('Average')).toHaveValue('190')
})

test('a failed save shows a toast and the desk saves again (D-197)', async ({ page }) => {
  await openTomsEdit(page)
  await page.getByRole('button', { name: '1. Bowler' }).click()
  await page.getByLabel('Last name (required)').fill('Flaky')
  await nextTo(page, 'registration')
  await nextTo(page, 'review')

  await save(page).click()

  await expect(page.getByRole('alert')).toContainText('Failed to save the registration (500)')
  await save(page).click()
  await expect(page.getByText('Tom Flaky: Registration updated.')).toBeVisible()
})

test('the lane page: Registration opens Edit, Move, and Remove (REG-20, D-197)', async ({
  page,
}) => {
  await openLanePage(page)

  await page.getByRole('button', { name: 'Registration actions: Tom Delgado' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registration actions for Tom Delgado' })

  await expect(dialog.getByRole('link', { name: 'Edit registration' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Move to another squad…' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Remove from this squad…' })).toBeEnabled()
  await dialog.getByRole('link', { name: 'Edit registration' }).click()
  await expect(page.getByRole('heading', { name: 'Edit registration', level: 1 })).toBeVisible()
})

test('the lane page: Move to a later squad shows both fees and the net, and saves (D-202, EDR-01)', async ({
  page,
}) => {
  await openLanePage(page)
  await page.getByRole('button', { name: 'Registration actions: Tom Delgado' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registration actions for Tom Delgado' })
  await dialog.getByRole('button', { name: 'Move to another squad…' }).click()

  await expect(dialog.getByRole('button', { name: 'Move', exact: true })).toBeDisabled()
  await dialog.getByRole('radio', { name: sunday }).check()
  await expect(dialog.getByText('Net: refund $10.00.')).toBeVisible()
  await expect(dialog.getByText(/lands in the unassigned list/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('Tom Delgado moved to another squad.')).toBeVisible()
  await menuLink(page, 'Registrations')
  await (
    await rowOf(page, 'Tom Delgado')
  )
    .getByRole('button', { name: '1 squad, show list' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Sun 10/25/2026 9:00 AM')
})

test('the lane page: Remove shows the refund, and removes one squad (REG-20, D-207)', async ({
  page,
}) => {
  await openLanePage(page)
  await page.getByRole('button', { name: 'Registration actions: Dana Abbott' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registration actions for Dana Abbott' })
  await dialog.getByRole('button', { name: 'Remove from this squad…' }).click()

  await expect(dialog.getByText(/Refund may be due: \$60\.00/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove from squad' }).click()

  await expect(page.getByText('Dana Abbott removed from this squad.')).toBeVisible()
})

test('the lane page: removing a bowler’s only squad is refused in the dialog (D-04, D-203)', async ({
  page,
}) => {
  await openLanePage(page)
  await page.getByRole('button', { name: 'Registration actions: Tom Delgado' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registration actions for Tom Delgado' })
  await dialog.getByRole('button', { name: 'Remove from this squad…' }).click()

  await dialog.getByRole('button', { name: 'Remove from squad' }).click()

  await expect(dialog.getByRole('alert')).toContainText('Bowler must enter at least one squad')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByRole('link', { name: 'Edit registration' })).toBeVisible()
})

test('a bowler who is not in the registration list shows an error in the lane dialog', async ({
  page,
}) => {
  await openLanePage(page)

  await page.getByRole('button', { name: 'Registration actions: Priya Nair' }).click()

  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/not found/i)
})

test('the lane page of a complete squad has no Registration button (D-10)', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page
    .getByRole('link', { name: /9:00 AM/ })
    .first()
    .click()
  await expect(page.getByText('Maria Chen').first()).toBeVisible()

  await expect(page.getByRole('button', { name: /Registration actions/ })).toHaveCount(0)
})

test('a complete tournament has no Edit links (D-130)', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').nth(1).getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0)
})

test('a score keeper sees the registrations but no Edit link (D-198)', async ({ page }) => {
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
  await expect(page.getByRole('rowheader', { name: 'Tom Delgado' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit / })).toHaveCount(0)
})

test('a visitor who is signed out is sent to sign in, and sees no Edit link (D-198, D-52)', async ({
  page,
}) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await expect(sidebar(page).getByRole('link', { name: 'Registrations' })).toHaveCount(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', window.location.pathname + '/registrations/anything/edit')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})

test('an admin can edit a registration too (D-198)', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('adminP4sswordLocal')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Tournaments' })
    .click()
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')
  await openEdit(page, 'Tom Delgado')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await save(page).click()

  await expect(page.getByText('Tom Delgado: Registration updated. Added 1.')).toBeVisible()
})

async function openLanePage(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page
    .getByRole('link', { name: /1:00 PM/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Lanes (1 to 24)' })).toBeVisible()
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 320, height: 800 } })

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

  test('the Edit link, every step, the Review tables, and the lane dialogs fit 320 px (D-73)', async ({
    page,
  }) => {
    await openRegistrations(page)
    expect(await sidewaysScrollers(page), 'list with Edit links').toEqual([])

    await openEdit(page, 'Tom Delgado')
    expect(await sidewaysScrollers(page), 'step 2').toEqual([])

    await page.getByLabel(afternoon).uncheck()
    await page.getByLabel(sunday).check()
    await nextTo(page, 'review')
    await expect(page.getByText('Net: refund $10.00.')).toBeVisible()
    expect(await sidewaysScrollers(page), 'review with collect and refund').toEqual([])

    await page.getByRole('button', { name: '1. Bowler' }).click()
    expect(await sidewaysScrollers(page), 'step 1').toEqual([])
  })

  test('the lane page actions fit 320 px (D-73)', async ({ page }) => {
    await openLanePage(page)
    await page.getByRole('button', { name: 'Registration actions: Tom Delgado' }).click()
    const dialog = page.getByRole('dialog', { name: 'Registration actions for Tom Delgado' })
    await expect(dialog.getByRole('link', { name: 'Edit registration' })).toBeVisible()
    expect(await sidewaysScrollers(page), 'menu').toEqual([])

    await dialog.getByRole('button', { name: 'Move to another squad…' }).click()
    await dialog.getByRole('radio', { name: sunday }).check()
    expect(await sidewaysScrollers(page), 'move').toEqual([])
  })
})
