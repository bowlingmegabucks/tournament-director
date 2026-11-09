import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsAsAdmin, openTournamentsSignedIn } from './menu'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const colorSchemes = ['dark', 'light'] as const

// axe checks color contrast in a real browser, which jsdom unit tests cannot do.
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()
  expect(violations).toEqual([])
}

for (const colorScheme of colorSchemes) {
  test.describe(`${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme })
    })

    test('home page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/')
      // Wait for data so axe scans the card and not the loading text.
      await expect(page.getByRole('article')).toBeVisible()

      await expectNoViolations(page)
    })

    test('sign-in page has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()

      await expectNoViolations(page)
    })

    test('add-user page has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('admin@example.com')
      await page.getByLabel('Password').fill('adminP4sswordLocal')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Users' })
        .click()
      await page.getByRole('link', { name: 'Add user' }).click()
      await expect(page.getByRole('group', { name: 'Roles' })).toBeVisible()
      // Show the error state too, so axe scans the message colors.
      await page.getByLabel('Name', { exact: true }).fill('Bea Bowler')
      await page.getByLabel('Email').fill('bea@example.com')
      await page.getByRole('button', { name: 'Add user' }).click()
      await expect(page.getByText('Pick at least one role.')).toBeVisible()

      await expectNoViolations(page)
    })

    test('account page has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('director@example.com')
      await page.getByLabel('Password').fill('directorP4sswordLocal')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Local Director' })
        .click()
      await expect(page.getByRole('heading', { name: 'My account', level: 1 })).toBeVisible()
      // Show an error alert and a toast too, so axe scans both.
      await page.getByLabel('Current password').fill('x')
      await page.getByLabel('New password', { exact: true }).fill('a long enough password')
      await page.getByLabel('Confirm new password').fill('a different long password')
      await page.getByRole('button', { name: 'Change password' }).click()
      await expect(page.getByText('The two new passwords do not match.')).toBeVisible()

      await expectNoViolations(page)
    })

    test('users page has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('admin@example.com')
      await page.getByLabel('Password').fill('adminP4sswordLocal')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Users' })
        .click()
      await expect(page.getByRole('table', { name: 'Users' })).toBeVisible()
      // Show a toast too, so axe scans its colors.
      await page.getByRole('button', { name: 'Send reset link to Local Director' }).click()
      await expect(page.getByText('Reset link sent to director@example.com.')).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit-roles and disable dialogs have no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('admin@example.com')
      await page.getByLabel('Password').fill('adminP4sswordLocal')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Users' })
        .click()
      await page.getByRole('button', { name: 'Edit roles for Local Director' }).click()
      await expect(page.getByRole('checkbox', { name: 'Admin' })).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Disable Local Director' }).click()
      await expect(page.getByRole('dialog', { name: 'Disable Local Director?' })).toBeVisible()
      await expectNoViolations(page)
    })

    test('forgot-password page (sent) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/forgot-password')
      await page.getByLabel('Email').fill('bea@example.com')
      await page.getByRole('button', { name: 'Send link' }).click()
      await expect(page.getByRole('status')).toBeVisible()

      await expectNoViolations(page)
    })

    test('set-password page (with an error) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/set-password?token=abc')
      await page.getByLabel('New password').fill('a long enough password')
      await page.getByLabel('Confirm password').fill('a long enough password!')
      await page.getByRole('button', { name: 'Set password' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('sign-in page with an error has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('director@example.com')
      await page.getByLabel('Password').fill('wrong')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('tournaments page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('new tournament form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('link', { name: 'New tournament' }).click()
      await expect(page.getByRole('heading', { name: 'New tournament', level: 1 })).toBeVisible()

      await expectNoViolations(page)
    })

    test('new tournament form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('link', { name: 'New tournament' }).click()
      await page.getByRole('button', { name: 'Save tournament' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('new division form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'New division' }).click()
      await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Name (required)', { exact: true })).toBeVisible()

      await expectNoViolations(page)
    })

    test('new division form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'New division' }).click()
      await page.getByRole('button', { name: 'Add division' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('new squad form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'New squad' }).click()
      await expect(page.getByRole('heading', { name: 'New squad', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Date and time (required)')).toBeVisible()

      await expectNoViolations(page)
    })

    test('new squad form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'New squad' }).click()
      await page.getByRole('button', { name: 'Add squad' }).click()
      await expect(page.getByRole('alert')).toContainText('Fix')

      await expectNoViolations(page)
    })

    test('new sweeper form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('link', { name: 'New sweeper' }).click()
      await expect(page.getByRole('heading', { name: 'New sweeper', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Date and time (required)')).toBeVisible()

      await expectNoViolations(page)
    })

    test('new sweeper form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('link', { name: 'New sweeper' }).click()
      await page.getByRole('button', { name: 'Add sweeper' }).click()
      await expect(page.getByRole('alert')).toContainText('Fix')

      await expectNoViolations(page)
    })

    test('new division confirm dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'New division' }).click()
      await page.getByLabel('Name (required)', { exact: true }).fill('Bonus')
      await page.getByLabel('Handicap percent').fill('110')
      await page.getByLabel('Handicap base').fill('220')
      await page.getByRole('button', { name: 'Add division' }).click()
      await expect(page.getByRole('dialog', { name: 'Add this division?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('divisions page with Edit links has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await expect(page.getByRole('link', { name: 'Edit Open' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit division form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'Edit Open' }).click()
      await expect(page.getByRole('heading', { name: 'Edit division', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Name (required)', { exact: true })).toHaveValue('Open')

      await expectNoViolations(page)
    })

    test('edit division form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'Edit Open' }).click()
      await page.getByLabel('Name (required)', { exact: true }).fill('')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit division confirm dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('link', { name: 'Edit Open' }).click()
      await page.getByLabel('Handicap percent').fill('110')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit squad form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'Edit squad Sat 10/24/2026 1:00 PM' }).click()
      await expect(page.getByRole('heading', { name: 'Edit squad', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Entry fee')).toHaveValue('60')
      await expect(page.getByText('Asks you to confirm:').first()).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit squad form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'Edit squad Sun 10/25/2026 9:00 AM' }).click()
      await page.getByLabel('Starting lane (required)').fill('2')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('alert')).toContainText('Fix')

      await expectNoViolations(page)
    })

    test('edit squad confirm dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'Edit squad Sat 10/24/2026 1:00 PM' }).click()
      await page.getByLabel('Entry fee').fill('75')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('complete squad dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: 'Sat 10/24/2026 1:00 PM', exact: true }).click()
      await page.getByRole('button', { name: 'Complete squad' }).click()
      const dialog = page.getByRole('dialog', { name: 'Complete this squad?' })
      await expect(dialog).toContainText('12 bowlers are entered.')

      await expectNoViolations(page)
    })

    test('complete sweeper dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('link', { name: 'Sat 10/24/2026 6:00 PM', exact: true }).click()
      await page.getByRole('button', { name: 'Complete sweeper' }).click()
      await expect(page.getByRole('dialog', { name: 'Complete this sweeper?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit sweeper form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('link', { name: 'Edit sweeper Sat 10/24/2026 6:00 PM' }).click()
      await expect(page.getByRole('heading', { name: 'Edit sweeper', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Games (required)')).toHaveAttribute('readonly', '')

      await expectNoViolations(page)
    })

    test('edit sweeper confirm dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('link', { name: 'Edit sweeper Sat 10/24/2026 6:00 PM' }).click()
      await page.getByLabel('Cash ratio (required)').fill('3.5')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('delete division dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('button', { name: 'Delete Open' }).click()
      await expect(page.getByRole('dialog', { name: 'Delete this division?' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete division' })).toBeEnabled()

      await expectNoViolations(page)
    })

    test('delete division dialog with bowlers registered has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Divisions')
      await page.getByRole('button', { name: 'Delete Scratch' }).click()
      await expect(page.getByText('12 bowlers are registered in')).toBeVisible()

      await expectNoViolations(page)
    })

    test('delete squad dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('button', { name: 'Delete squad Sun 10/25/2026 9:00 AM' }).click()
      await expect(page.getByRole('dialog', { name: 'Delete this squad?' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete squad', exact: true })).toBeEnabled()

      await expectNoViolations(page)
    })

    test('delete squad dialog with a refusal has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('button', { name: 'Delete squad Sat 10/24/2026 1:00 PM' }).click()
      await expect(page.getByText('12 bowlers are entered in')).toBeVisible()

      await expectNoViolations(page)
    })

    test('delete sweeper dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      // The demo's two sweepers cannot be deleted, so add one first.
      await page.getByRole('link', { name: 'New sweeper' }).click()
      const min = await page.getByLabel('Date and time (required)').getAttribute('min')
      if (!min) throw new Error('The date box has no minimum')
      await page.getByLabel('Date and time (required)').fill(`${min.slice(0, 10)}T21:30`)
      await page.getByLabel('Starting lane (required)').fill('3')
      await page.getByLabel('Number of lanes (required)').fill('10')
      await page.getByLabel('Bowlers per pair (required)').fill('5')
      await page.getByLabel('Entry fee (required)').fill('35')
      await page.getByLabel('Games (required)').fill('4')
      await page.getByLabel('Cash ratio (required)').fill('6.5')
      await page.getByRole('button', { name: 'Add sweeper' }).click()
      await expect(page.getByText('Sweeper created')).toBeVisible()
      await page.getByRole('button', { name: /^Delete sweeper .* 9:30 PM$/ }).click()
      await expect(page.getByRole('dialog', { name: 'Delete this sweeper?' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete sweeper', exact: true })).toBeEnabled()

      await expectNoViolations(page)
    })

    test('delete sweeper dialog with a refusal has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Sweepers')
      await page.getByRole('button', { name: 'Delete sweeper Sat 10/24/2026 6:00 PM' }).click()
      await expect(page.getByText('Scores are saved for')).toBeVisible()

      await expectNoViolations(page)
    })

    test('edit tournament form has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page.getByRole('link', { name: 'Edit tournament' }).click()
      await expect(page.getByRole('heading', { name: 'Edit tournament', level: 1 })).toBeVisible()
      await expect(page.getByLabel('Name (required)', { exact: true })).not.toHaveValue('')

      await expectNoViolations(page)
    })

    test('edit tournament form with errors has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page.getByRole('link', { name: 'Edit tournament' }).click()
      await page.getByLabel('Name (required)', { exact: true }).fill('')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test('delete tournament dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsAsAdmin(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page.getByRole('button', { name: 'Delete tournament' }).click()
      await expect(page.getByRole('dialog', { name: 'Delete this tournament?' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('tournament overview has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await expect(page.getByRole('navigation', { name: /Northeast MegaBuck/ })).toBeVisible()

      await expectNoViolations(page)
    })

    test('divisions page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Divisions' })
        .click()
      await expect(page.getByRole('table')).toBeVisible()

      await expectNoViolations(page)
    })

    for (const [name, label] of [
      ['Squads', 'squads'],
      ['Sweepers', 'sweepers'],
    ] as const) {
      test(`${label} page (loaded) has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto('/tournaments')
        await page.getByRole('article').first().getByRole('link').click()
        await page
          .getByRole('navigation', { name: /Northeast MegaBuck/ })
          .getByRole('link', { name })
          .click()
        await expect(
          page.getByRole('heading', { level: 2, name: /\d{2}\/\d{2}\/\d{4}/ }).first(),
        ).toBeVisible()

        await expectNoViolations(page)
      })
    }

    test('registrations page (loaded and filtered) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Registrations' })
        .click()
      await expect(page.getByRole('table')).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('searchbox', { name: 'Filter by name or USBC ID' }).fill('zz')
      await expect(page.getByText('No registrations match the filter.')).toBeVisible()
      await expectNoViolations(page)
    })

    test('scores page (loaded, on a wide and a narrow screen) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
      await page.getByRole('link', { name: 'Scores' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Lanes 1-2' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('squad results page (a division with lines, ties and sections, on a wide and a narrow screen) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page
        .getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 9:00 AM$/ })
        .first()
        .click()
      await page.getByRole('link', { name: 'Results' }).click()
      await expect(page.getByRole('heading', { level: 3, name: 'Did not finish' })).toBeVisible()
      await expectNoViolations(page)

      await page
        .getByRole('combobox', { name: 'Division' })
        .selectOption({ label: 'Women (12 entries)' })
      await expect(page.getByRole('columnheader', { name: 'Total HDCP' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('sweeper results page (loaded) has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Sweepers' })
        .click()
      await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 6:00 PM$/ }).click()
      await page.getByRole('link', { name: 'Results' }).click()
      await expect(page.getByRole('table', { name: 'Sweeper results' })).toBeVisible()
      await expectNoViolations(page)
    })

    test('at-large, seeding, and super sweeper pages (loaded, on a wide and a narrow screen) have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      const sidebar = () => page.getByRole('navigation', { name: /Northeast MegaBuck/ })
      await page.goto('/tournaments')
      await page.getByRole('article').first().getByRole('link').click()

      await sidebar().getByRole('link', { name: 'At-large' }).click()
      await expect(page.getByRole('table', { name: /At-large results/ })).toBeVisible()
      await expectNoViolations(page)

      await sidebar().getByRole('link', { name: 'Seeding' }).click()
      await expect(page.getByRole('table', { name: /Finals seeding/ })).toBeVisible()
      await expectNoViolations(page)

      await sidebar().getByRole('link', { name: 'Sweepers' }).click()
      await page.getByRole('link', { name: 'Super sweeper results' }).click()
      await expect(page.getByRole('table', { name: 'Super sweeper results' })).toBeVisible()
      await expectNoViolations(page)

      await page.setViewportSize({ width: 320, height: 800 })
      await expectNoViolations(page)
    })

    test('lane assignments page (loaded, and with the Assign dialog open) has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
      await expect(page.getByRole('heading', { name: 'Unassigned (4)' })).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Assign to lanes: Pat Nguyen' }).click()
      await expect(page.getByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })).toBeVisible()
      await expectNoViolations(page)

      // The "not saved" notice, with the moved bowler in place.
      await page.getByRole('button', { name: /Lanes 7-8/ }).click()
      await expect(page.getByText(/No save is configured yet/)).toBeVisible()
      await expectNoViolations(page)
    })

    test('recap sheets dialog has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
      await page.getByRole('button', { name: 'Recap sheets' }).click()
      await expect(page.getByRole('button', { name: 'Print all' })).toBeVisible()

      await expectNoViolations(page)

      // One sheet unchecked: dimmed, and still readable.
      await page
        .getByRole('checkbox', { name: /^Print / })
        .first()
        .uncheck()
      await expect(page.getByText('Not printing')).toBeVisible()
      await expectNoViolations(page)
    })

    test('lane assignments page of a complete squad has no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page
        .getByRole('navigation', { name: /Northeast MegaBuck/ })
        .getByRole('link', { name: 'Squads' })
        .click()
      await page
        .getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 9:00 AM$/ })
        .first()
        .click()
      await expect(page.getByText('This squad is complete. Lanes cannot change.')).toBeVisible()

      await expectNoViolations(page)
    })

    test('registrations squad popup (open) has no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await page.getByRole('link', { name: 'Registrations' }).click()
      await page
        .getByRole('row', { name: /Dana Abbott/ })
        .getByRole('button', { name: '2 squads, show list' })
        .click()
      await expect(page.getByRole('dialog', { name: 'Dana Abbott: squads' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('tournament not found has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')
      await expect(page.getByRole('heading', { name: 'Tournament not found' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('page not found has no WCAG 2.2 AA violations', async ({ page }) => {
      await page.goto('/nowhere')
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

      await expectNoViolations(page)
    })

    test('add-registration page, every step, and its dialogs have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Registrations')
      await page.getByRole('link', { name: 'Add registration' }).click()
      await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
      await expectNoViolations(page)

      // The search with its error, then its results (a Registered badge among them).
      await page.getByRole('button', { name: 'Search' }).click()
      await expect(page.getByRole('alert')).toContainText('Enter at least one search field.')
      await expectNoViolations(page)
      await page.getByLabel('Last name starts with').fill('Abbott')
      await page.getByRole('button', { name: 'Search' }).click()
      await expect(page.getByText('✓ Registered: Open')).toBeVisible()
      await expectNoViolations(page)

      // A stored bowler, not registered: step 1, step 2 with errors and with a locked squad, step 3.
      await page.getByLabel('Last name starts with').fill('Gonzalez')
      await page.getByLabel('First name starts with').fill('Maria')
      await page.getByRole('button', { name: 'Search' }).click()
      await page.getByRole('button', { name: /^Pick Maria Gonzalez, 1234-56789/ }).click()
      await expect(page.getByRole('heading', { name: 'Bowler', level: 2 })).toBeVisible()
      await page.getByLabel('Street').fill('88 Pine Road')
      await expectNoViolations(page)
      await page.getByRole('button', { name: 'Next: registration' }).click()
      await page.getByRole('button', { name: 'Next: review' }).click()
      await expect(page.getByRole('alert')).toContainText('Pick a division')
      await expectNoViolations(page)
      await page.getByLabel('Division (required)').selectOption('Scratch')
      await page.getByLabel(/Sat 10\/24\/2026 1:00 PM/).check()
      await expectNoViolations(page)
      await page.getByRole('button', { name: 'Next: review' }).click()
      await expect(page.getByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
      await expectNoViolations(page)
    })

    test('edit-registration page, every step, and the locks have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Registrations')
      await expectNoViolations(page)

      // Dana holds a complete squad and sweeper: disabled boxes with their reasons in words.
      await page.getByRole('link', { name: 'Edit Dana Abbott' }).click()
      await expect(page.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()
      await expect(page.getByText('Cannot remove: this one is complete.').first()).toBeVisible()
      await expectNoViolations(page)

      // Bowler step, then an error, then Review with collect, refund, net, and the tick.
      await page.getByRole('button', { name: '1. Bowler' }).click()
      await expectNoViolations(page)
      await page.getByLabel('First name (required)').fill('')
      await page.getByRole('button', { name: 'Next: registration' }).click()
      await expect(page.getByRole('alert')).toContainText('First Name is Required')
      await expectNoViolations(page)
      await page.getByLabel('First name (required)').fill('Dana')
      await page.getByRole('button', { name: 'Next: registration' }).click()
      await page.getByLabel(/Sat 10\/24\/2026 1:00 PM/).uncheck()
      await page.getByLabel(/Sun 10\/25\/2026 9:00 AM/).check()
      await page.getByRole('button', { name: 'Next: review' }).click()
      await expect(page.getByText('Net: refund $10.00.')).toBeVisible()
      await expectNoViolations(page)
    })

    test('edit-registration changed notice and the empty review have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Registrations')
      await page
        .getByRole('row')
        .filter({ hasText: '5560-11902' })
        .getByRole('link', { name: /^Edit/ })
        .click()
      await page.getByRole('button', { name: 'Next: review' }).click()
      await expect(page.getByText(/No changes yet/)).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Back', exact: true }).click()
      await page.getByLabel('Average').fill('175')
      await page.getByRole('button', { name: 'Next: review' }).click()
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('This registration changed.')).toBeVisible()
      await expectNoViolations(page)
    })

    test('lane page registration actions (menu, move, remove) have no WCAG 2.2 AA violations', async ({
      page,
    }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Squads')
      await page.getByRole('link', { name: /^[A-Z][a-z]{2} \d{2}\/\d{2}\/\d{4} 1:00 PM$/ }).click()
      await expect(page.getByRole('heading', { name: 'Unassigned (4)' })).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Registration actions: Tom Delgado' }).click()
      const dialog = page.getByRole('dialog', { name: 'Registration actions for Tom Delgado' })
      await expect(dialog.getByRole('link', { name: 'Edit registration' })).toBeVisible()
      await expectNoViolations(page)

      await dialog.getByRole('button', { name: 'Move to another squad…' }).click()
      await dialog.getByRole('radio', { name: /Sun 10\/25\/2026 9:00 AM/ }).check()
      await expectNoViolations(page)

      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await dialog.getByRole('button', { name: 'Remove from this squad…' }).click()
      await dialog.getByRole('button', { name: 'Remove from squad' }).click()
      await expect(dialog.getByRole('alert')).toContainText('Bowler must enter at least one squad')
      await expectNoViolations(page)
    })

    test('add-registration dialogs have no WCAG 2.2 AA violations', async ({ page }) => {
      await openTournamentsSignedIn(page)
      await page.getByRole('article').first().getByRole('link').click()
      await menuLink(page, 'Registrations')
      await page.getByRole('link', { name: 'Add registration' }).click()

      // USBC ID on file.
      await page.getByRole('button', { name: 'New bowler' }).click()
      await page.getByLabel('First name (required)').fill('Mary')
      await page.getByLabel('Last name (required)').fill('Gonzalez')
      await page.getByLabel('USBC ID').fill('1234-56789')
      await page.getByRole('button', { name: 'Next: registration' }).click()
      await page.getByLabel('Division (required)').selectOption('Scratch')
      await page.getByLabel(/Sat 10\/24\/2026 1:00 PM/).check()
      await page.getByRole('button', { name: 'Next: review' }).click()
      await page.getByRole('button', { name: 'Add registration', exact: true }).click()
      await expect(
        page.getByRole('dialog', { name: 'A bowler with this USBC ID is on file' }),
      ).toBeVisible()
      await expectNoViolations(page)
      await page.getByRole('button', { name: 'No, change the USBC ID' }).click()
      await page.getByRole('link', { name: 'Cancel' }).click()

      // Already registered, found at save.
      await page.getByRole('link', { name: 'Add registration' }).click()
      await page.getByLabel('Last name starts with').fill('Runner')
      await page.getByRole('button', { name: 'Search' }).click()
      await page.getByRole('button', { name: /^Pick Race Runner/ }).click()
      await page.getByRole('button', { name: 'Next: registration' }).click()
      await page.getByLabel('Division (required)').selectOption('Scratch')
      await page.getByLabel(/Sun 10\/25\/2026 9:00 AM/).check()
      await page.getByRole('button', { name: 'Next: review' }).click()
      await page.getByRole('button', { name: 'Add registration', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Already registered' })).toBeVisible()
      await expectNoViolations(page)
    })
  })
}

// Empty and error states: force the API response with `route`. The mock service worker
// would answer first, so block it for these tests.
test.describe('other states', () => {
  test.use({ serviceWorkers: 'block' })

  for (const colorScheme of colorSchemes) {
    test(`tournaments page (empty) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/v1/tournaments', (route) => route.fulfill({ json: { tournaments: [] } }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/tournaments')
      await expect(page.getByText('No tournaments yet.')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`tournaments page (error) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.route('**/v1/tournaments', (route) => route.fulfill({ status: 500, body: '' }))
      await page.emulateMedia({ colorScheme })
      await page.goto('/tournaments')
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`divisions page (empty) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      const id = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
      await page.route(`**/v1/tournaments/${id}`, (route) =>
        route.fulfill({
          json: {
            tournament: {
              id,
              name: 'Spring Open',
              startDate: '2026-10-23',
              endDate: '2026-10-25',
              entryFee: 50,
              bowlingCenter: 'Spare Time Lanes, Worcester MA',
            },
          },
        }),
      )
      await page.route(`**/v1/tournaments/${id}/divisions`, (route) =>
        route.fulfill({ json: { divisions: [] } }),
      )
      await page.emulateMedia({ colorScheme })
      await page.goto(`/tournaments/${id}/divisions`)
      await expect(page.getByText('No divisions yet.')).toBeVisible()

      await expectNoViolations(page)
    })

    test(`divisions page (error) has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      const id = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
      await page.route(`**/v1/tournaments/${id}`, (route) =>
        route.fulfill({
          json: {
            tournament: {
              id,
              name: 'Spring Open',
              startDate: '2026-10-23',
              endDate: '2026-10-25',
              entryFee: 50,
              bowlingCenter: 'Spare Time Lanes, Worcester MA',
            },
          },
        }),
      )
      await page.route(`**/v1/tournaments/${id}/divisions`, (route) =>
        route.fulfill({ status: 503, body: '' }),
      )
      await page.emulateMedia({ colorScheme })
      await page.goto(`/tournaments/${id}/divisions`)
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible({ timeout: 5000 })

      await expectNoViolations(page)
    })
  }
})
