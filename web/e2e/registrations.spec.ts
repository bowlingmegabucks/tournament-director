import { expect, test, type Page } from '@playwright/test'
import { menuLink, openTournamentsSignedIn, sidebar } from './menu'

/**
 * Registration is the critical desk flow: every path of the add-registration feature is here
 * (REG-01 to REG-08, REG-22, BWL-14, BWL-15, D-157 to D-165). The mock server keeps its state until
 * the page reloads, so each test moves by links, as a visitor does.
 *
 * Demo data the tests lean on:
 * - Squads: Sat 10/24 9:00 AM (complete), Sat 10/24 1:00 PM, Sun 10/25 9:00 AM.
 * - Sweepers: Sat 10/24 6:00 PM, Sun 10/25 5:00 PM (complete).
 * - Divisions: Open, Women, and Seniors have a handicap and need a USBC ID; Scratch does not.
 * - Dana Abbott is registered in Open on both 10/24 squads. Sam Scored is registered and has a score.
 *   Maria Gonzalez (1234-56789) is on file and not registered. Race Runner is on file, shows as not
 *   registered, and is registered by "someone else" the first time the desk saves.
 */

const morning = /Sat 10\/24\/2026 9:00 AM/
const afternoon = /Sat 10\/24\/2026 1:00 PM/
const sunday = /Sun 10\/25\/2026 9:00 AM/
const sweeperSaturday = /Sat 10\/24\/2026 6:00 PM/

async function openRegistrations(page: Page) {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
}

/** From the Registrations list, open the add page and wait for the search form. */
async function addAnother(page: Page) {
  await page.getByRole('link', { name: 'Add registration' }).click()
  await expect(page.getByRole('heading', { name: 'Add registration', level: 1 })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
}

async function openAdd(page: Page) {
  await openRegistrations(page)
  await addAnother(page)
}

async function search(
  page: Page,
  fields: { last?: string; first?: string; email?: string; usbc?: string },
) {
  if (fields.last) await page.getByLabel('Last name starts with').fill(fields.last)
  if (fields.first) await page.getByLabel('First name starts with').fill(fields.first)
  if (fields.email) await page.getByLabel('Email', { exact: true }).fill(fields.email)
  if (fields.usbc) await page.getByLabel('USBC ID').fill(fields.usbc)
  await page.getByRole('button', { name: 'Search' }).click()
}

const pick = (page: Page, name: RegExp | string) =>
  page.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^Pick ${name}`) : name })

async function fillNames(page: Page, first: string, last: string) {
  await page.getByLabel('First name (required)').fill(first)
  await page.getByLabel('Last name (required)').fill(last)
}

const nextTo = (page: Page, label: 'registration' | 'review') =>
  page.getByRole('button', { name: `Next: ${label}` }).click()

const addButton = (
  page: Page,
  name: 'Add registration' | 'Add to registration' = 'Add registration',
) => page.getByRole('button', { name, exact: true })

const stepHeading = (page: Page, name: 'Bowler' | 'Registration' | 'Review') =>
  page.getByRole('heading', { name, level: 2 })

async function rowOf(page: Page, name: string) {
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) })
  await expect(row).toHaveCount(1)
  return row
}

test('a new bowler with only names, one squad, and no USBC ID is added and shows in the list (REG-02, D-162)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Ann', 'Lee')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')

  await expect(page.getByText('New registration in Scratch.')).toBeVisible()
  await expect(page.getByText(/records a \$0 desk entry/)).toBeVisible()
  await expect(page.getByRole('row', { name: 'Squad Sat 10/24/2026 1:00 PM $60.00' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Total to collect $60.00' })).toBeVisible()
  await addButton(page).click()

  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByText('Registration added for Ann Lee')).toBeVisible()
  const row = await rowOf(page, 'Ann Lee')
  await expect(row).toContainText('Scratch')
  await expect(row.getByRole('button', { name: '1 squad, show list' })).toBeVisible()
})

test('a new bowler with every field, a sweeper, and the super sweeper (REG-06, REG-07)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Bea', 'Chen')
  await page.getByLabel('Middle initial').fill('Q')
  await page.getByLabel('Suffix').fill('III')
  await page.getByLabel('Street').fill('9 Oak Lane')
  await page.getByLabel('City').fill('Salem')
  await page.getByLabel('State (2 letters)').fill('MA')
  await page.getByLabel('Zip').fill('01970')
  await page.getByLabel('Email', { exact: true }).fill('bea@example.com')
  await page.getByLabel('Phone').fill('978-555-0100')
  await page.getByLabel('USBC ID').fill('5555-66666')
  await page.getByLabel('Date of birth').fill('04/01/1975')
  await page.getByLabel('Gender').selectOption('Female')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Open')
  await page.getByLabel('Average').fill('195')
  await page.getByLabel(afternoon).check()
  await page.getByLabel(sunday).check()
  await page.getByLabel(sweeperSaturday).check()
  await page.getByLabel('Super sweeper').check()
  await nextTo(page, 'review')
  await expect(page.getByText(/in Open, average 195/)).toBeVisible()
  await expect(page.getByText('Super sweeper.')).toBeVisible()
  // 1:00 PM $60 + Sunday $50 + the 6:00 PM sweeper $25.
  await expect(
    page.getByRole('row', { name: 'Sweeper Sat 10/24/2026 6:00 PM $25.00' }),
  ).toBeVisible()
  await expect(page.getByRole('row', { name: 'Total to collect $135.00' })).toBeVisible()
  await addButton(page).click()

  await expect(page.getByText('Registration added for Bea Chen, III')).toBeVisible()
  const row = await rowOf(page, 'Bea Chen, III')
  await expect(row).toContainText('5555-66666')
  await expect(row.getByRole('button', { name: '2 squads, show list' })).toBeVisible()
  await expect(row.getByRole('button', { name: '1 sweeper, show list' })).toBeVisible()
  await expect(row.getByText('Yes')).toBeAttached()
})

test('the search finds a bowler by name, by USBC ID, and by email (BWL-14)', async ({ page }) => {
  await openAdd(page)

  await search(page, { last: 'gon', first: 'mar' })
  await expect(page.getByRole('heading', { name: '3 bowlers found' })).toBeVisible()
  await expect(pick(page, 'Maria Gonzalez, 1234-56789')).toBeVisible()
  await expect(pick(page, 'Maria Gonzales')).toBeVisible()
  await expect(pick(page, 'Maria Gonzalez, Jr, 2233-44556')).toBeVisible()

  await page.getByLabel('Last name starts with').fill('')
  await page.getByLabel('First name starts with').fill('')
  await search(page, { usbc: '1234-56789' })
  await expect(page.getByRole('heading', { name: '1 bowler found' })).toBeVisible()
  await expect(pick(page, 'Maria Gonzalez, 1234-56789')).toBeVisible()

  await page.getByLabel('USBC ID').fill('')
  await search(page, { email: 'MARIA.G@example.com' })
  await expect(page.getByRole('heading', { name: '1 bowler found' })).toBeVisible()
  await expect(pick(page, 'Maria Gonzalez, 1234-56789')).toBeVisible()
})

test('a search with no field, no match, too many, or a server failure each say so (BWL-14)', async ({
  page,
}) => {
  await openAdd(page)

  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter at least one search field.')

  await search(page, { last: 'Zzzz' })
  await expect(page.getByText(/No bowler matches/)).toBeVisible()

  await page.getByLabel('Last name starts with').fill('')
  await search(page, { last: 'Many' })
  await expect(page.getByText(/Showing the first 25/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '25 bowlers found' })).toBeVisible()

  await page.getByLabel('Last name starts with').fill('Boom')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Could not search for bowlers.')).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Could not search for bowlers.')).toHaveCount(0)
})

test('the search marks a bowler already registered with the division (REG-01, D-159)', async ({
  page,
}) => {
  await openAdd(page)

  await search(page, { last: 'Abbott' })

  await expect(page.getByText('✓ Registered: Open')).toBeVisible()
})

test('a stored bowler not yet registered: the address is changed, Review shows old against new, and it saves (BWL-15, D-05, D-158)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { usbc: '1234-56789' })
  await pick(page, 'Maria Gonzalez, 1234-56789').click()

  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await expect(page.getByText(/Using the bowler on file/)).toBeVisible()
  await expect(page.getByLabel('Street')).toHaveValue('14 Elm Street')
  await expect(page.getByLabel('Gender')).toHaveValue('Female')
  await page.getByLabel('Street').fill('88 Pine Road')
  await page.getByLabel('City').fill('Auburn')
  await page.getByLabel('Zip').fill('01501')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await expect(page.getByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
  await expect(page.getByText('City: Worcester → Auburn')).toBeVisible()
  await expect(page.getByText('Zip: 01604 → 01501')).toBeVisible()
  await addButton(page).click()

  await expect(page.getByText('Registration added for Maria Gonzalez')).toBeVisible()
  await expect(await rowOf(page, 'Maria Gonzalez')).toContainText('Scratch')

  // The record now holds the new address, and the bowler shows as registered.
  await addAnother(page)
  await search(page, { usbc: '1234-56789' })
  await expect(page.getByText('✓ Registered: Scratch')).toBeVisible()
  await pick(page, 'Maria Gonzalez, 1234-56789').click()
  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await page.getByRole('button', { name: '1. Bowler' }).click()
  await expect(page.getByLabel('Street')).toHaveValue('88 Pine Road')
})

test('a blank box leaves the stored value alone (D-05)', async ({ page }) => {
  await openAdd(page)
  await search(page, { usbc: '1234-56789' })
  await pick(page, 'Maria Gonzalez, 1234-56789').click()
  await page.getByLabel('Email', { exact: true }).fill('')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')

  await expect(page.getByText('Changes to the bowler')).toHaveCount(0)
  await addButton(page).click()
  await expect(page.getByText('Registration added for Maria Gonzalez')).toBeVisible()

  await addAnother(page)
  await search(page, { usbc: '1234-56789' })
  await pick(page, 'Maria Gonzalez, 1234-56789').click()
  await page.getByRole('button', { name: '1. Bowler' }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('maria.g@example.com')
})

test('a bowler already registered starts on Registration with what they hold locked, and adds a squad (REG-10, REG-11, D-165)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { last: 'Abbott' })
  await pick(page, 'Dana Abbott').click()

  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await expect(page.getByText(/Dana Abbott is already registered/)).toBeVisible()
  for (const held of [morning, afternoon]) {
    await expect(page.getByLabel(held)).toBeChecked()
    await expect(page.getByLabel(held)).toBeDisabled()
  }
  await expect(page.getByLabel('Division (required)')).toHaveValue(/.+/)
  await expect(page.getByLabel('Division (required)').locator('option:checked')).toHaveText('Open')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await expect(page.getByText(/Adds to the existing registration in Open/)).toBeVisible()
  await expect(page.getByText(/Squads: Sun 10\/25\/2026 9:00 AM\./)).toBeVisible()
  // Dana's two squads are held: only the new Sunday squad is collected.
  await expect(
    page.getByRole('table', { name: 'What to collect for these additions' }),
  ).toBeVisible()
  await expect(page.getByRole('row', { name: 'Total to collect $50.00' })).toBeVisible()
  await addButton(page, 'Add to registration').click()

  await expect(page.getByText('Registration added for Dana Abbott')).toBeVisible()
  await expect(
    (await rowOf(page, 'Dana Abbott')).getByRole('button', { name: '3 squads, show list' }),
  ).toBeVisible()
})

test('a registered bowler goes back to the details, changes the city, and saves with the append (D-165)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { last: 'Abbott' })
  await pick(page, 'Dana Abbott').click()
  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await page.getByLabel(sunday).check()

  await page.getByRole('button', { name: 'Back to bowler details' }).click()
  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await page.getByLabel('City').fill('Lowell')
  await nextTo(page, 'registration')
  await expect(page.getByLabel(sunday)).toBeChecked()
  await nextTo(page, 'review')

  await expect(page.getByText('City: Worcester → Lowell')).toBeVisible()
  await addButton(page, 'Add to registration').click()
  await expect(page.getByText('Registration added for Dana Abbott')).toBeVisible()
})

test('an append can move the division, and Review says so (REG-12, D-160)', async ({ page }) => {
  await openAdd(page)
  await search(page, { last: 'Abbott' })
  await pick(page, 'Dana Abbott').click()
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')

  await expect(page.getByText('Moves the registration from Open to Scratch.')).toBeVisible()
  await addButton(page, 'Add to registration').click()

  await expect(page.getByText('Registration added for Dana Abbott')).toBeVisible()
  await expect(await rowOf(page, 'Dana Abbott')).toContainText('Scratch')
})

test('a division move is refused once the bowler has a score, and the page shows the field (REG-15, D-160)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { last: 'Scored' })
  await pick(page, 'Sam Scored').click()
  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')
  await addButton(page, 'Add to registration').click()

  await expect(stepHeading(page, 'Registration')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Cannot change bowler division after scores have been recorded.',
  )
  await expect(page.getByLabel('Division (required)')).toHaveAccessibleDescription(
    /Cannot change bowler division/,
  )

  // Putting the division back lets the same squad go through.
  await page.getByLabel('Division (required)').selectOption('Open')
  await nextTo(page, 'review')
  await addButton(page, 'Add to registration').click()
  await expect(page.getByText('Registration added for Sam Scored')).toBeVisible()
})

test('the lane page opens Add registration with that squad checked and locked (REG-22, D-164)', async ({
  page,
}) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page
    .getByRole('link', { name: /1:00 PM/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Lanes (1 to 24)' })).toBeVisible()

  await page.getByRole('link', { name: 'Add registration to this squad' }).click()
  await search(page, { usbc: '1234-56789' })
  await pick(page, 'Maria Gonzalez, 1234-56789').click()
  await nextTo(page, 'registration')

  await expect(page.getByLabel(afternoon)).toBeChecked()
  await expect(page.getByLabel(afternoon)).toBeDisabled()
  await expect(page.getByText('Added from the lane page')).toBeVisible()
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await nextTo(page, 'review')
  await expect(page.getByText(/Squads: Sat 10\/24\/2026 1:00 PM\./)).toBeVisible()
  // The squad from the lane page is charged like any other (D-166).
  await expect(page.getByRole('row', { name: 'Total to collect $60.00' })).toBeVisible()
  await addButton(page).click()
  await expect(page.getByText('Registration added for Maria Gonzalez')).toBeVisible()
  await expect(
    (await rowOf(page, 'Maria Gonzalez')).getByRole('button', { name: '1 squad, show list' }),
  ).toBeVisible()
})

test('the lane page of a sweeper locks the sweeper the same way (REG-22)', async ({ page }) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Sweepers')
  await page
    .getByRole('link', { name: /6:00 PM/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'Add registration to this sweeper' }).click()

  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Ann', 'Lee')
  await nextTo(page, 'registration')

  await expect(page.getByLabel(sweeperSaturday)).toBeChecked()
  await expect(page.getByLabel(sweeperSaturday)).toBeDisabled()
})

test('a complete squad has no Add registration link on its lane page (REG-33)', async ({
  page,
}) => {
  await openTournamentsSignedIn(page)
  await page.getByRole('article').first().getByRole('link').click()
  await menuLink(page, 'Squads')
  await page
    .getByRole('link', { name: /9:00 AM/ })
    .first()
    .click()

  await expect(
    page
      .getByRole('link', { name: 'Recap sheets' })
      .or(page.getByRole('button', { name: 'Recap sheets' })),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Add registration/ })).toHaveCount(0)
})

test('a new bowler whose USBC ID is on file: Use this bowler carries the typed details (BWL-15, D-161)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Mary', 'Gonzalez')
  await page.getByLabel('Street').fill('88 Pine Road')
  await page.getByLabel('USBC ID').fill('1234-56789')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')
  await addButton(page).click()

  const dialog = page.getByRole('dialog', { name: 'A bowler with this USBC ID is on file' })
  await expect(dialog).toContainText('Maria Gonzalez')
  await dialog.getByRole('button', { name: 'Yes, use this bowler' }).click()

  await expect(stepHeading(page, 'Review')).toBeVisible()
  await expect(page.getByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
  await expect(page.getByText('First name: Maria → Mary')).toBeVisible()
  await addButton(page).click()
  await expect(page.getByText('Registration added for Mary Gonzalez')).toBeVisible()
})

test('a new bowler whose USBC ID is on file: No returns to the Bowler step with a message (D-161)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Mary', 'Gonzalez')
  await page.getByLabel('USBC ID').fill('1234-56789')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')
  await addButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'A bowler with this USBC ID is on file' })

  await dialog.getByRole('button', { name: 'No, change the USBC ID' }).click()

  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await expect(page.getByLabel('USBC ID')).toHaveAccessibleDescription(/belongs to another bowler/)
  // Nothing was saved: the list has no Mary.
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page.getByRole('rowheader', { name: 'Mary Gonzalez' })).toHaveCount(0)
})

test('someone else registers the bowler first: the desk is asked before it appends, and Yes appends (D-159)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { last: 'Runner' })
  await pick(page, 'Race Runner').click()
  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')
  await addButton(page).click()

  const dialog = page.getByRole('dialog', { name: 'Already registered' })
  await expect(dialog).toContainText('Race Runner is already registered')
  await expect(dialog).toContainText('Squad: Sun 10/25/2026 9:00 AM')
  await dialog.getByRole('button', { name: 'Yes, add to registration' }).click()

  await expect(page.getByText('Registration added for Race Runner')).toBeVisible()
  await expect(
    (await rowOf(page, 'Race Runner')).getByRole('button', { name: '2 squads, show list' }),
  ).toBeVisible()
})

test('No at the already-registered dialog saves nothing and stays on Review (D-159)', async ({
  page,
}) => {
  await openAdd(page)
  await search(page, { last: 'Runner' })
  await pick(page, 'Race Runner').click()
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(sunday).check()
  await nextTo(page, 'review')
  await addButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Already registered' })

  await dialog.getByRole('button', { name: 'No, go back' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(stepHeading(page, 'Review')).toBeVisible()
  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Leave page' }).click()
  // The other desk's registration is there with its one squad, and nothing was added to it.
  await expect(
    (await rowOf(page, 'Race Runner')).getByRole('button', { name: '1 squad, show list' }),
  ).toBeVisible()
})

test('the names are required before the next step, with the legacy words (BWL-01, BWL-02)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()

  await nextTo(page, 'registration')

  await expect(page.getByRole('alert')).toContainText('Fix 2 things to save.')
  await expect(page.getByRole('alert')).toContainText('First Name is Required')
  await expect(page.getByRole('alert')).toContainText('Last Name is Required')
  await expect(page.getByLabel('First name (required)')).toHaveAccessibleDescription(
    'First Name is Required',
  )
  await expect(stepHeading(page, 'Bowler')).toBeVisible()

  await page.getByRole('link', { name: 'First Name is Required' }).click()
  await expect(page.getByLabel('First name (required)')).toBeFocused()
})

test('a division and a squad are required before Review, and the average must be 1 to 300 (REG-03, REG-16)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Ann', 'Lee')
  await nextTo(page, 'registration')

  await nextTo(page, 'review')
  await expect(page.getByRole('alert')).toContainText('Pick a division')
  await expect(page.getByRole('alert')).toContainText('Bowler must enter at least one squad')

  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await page.getByLabel('Average').fill('301')
  await nextTo(page, 'review')
  await expect(page.getByRole('alert')).toContainText('Average must be less than or equal to 300.')

  await page.getByLabel('Average').fill('0')
  await nextTo(page, 'review')
  await expect(page.getByRole('alert')).toContainText('Average must be greater than 0.')

  await page.getByLabel('Average').fill('200')
  await nextTo(page, 'review')
  await expect(stepHeading(page, 'Review')).toBeVisible()
})

test('a handicap division without a USBC ID sends the desk back to the Bowler step with the field (REG-05)', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Ann', 'Lee')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Open')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')
  await addButton(page).click()

  await expect(stepHeading(page, 'Bowler')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('USBC Id is required for Handicap Divisions')
  await expect(page.getByLabel('USBC ID')).toHaveAccessibleDescription(
    /USBC Id is required for Handicap Divisions/,
  )

  await page.getByLabel('USBC ID').fill('7777-88888')
  await nextTo(page, 'registration')
  await nextTo(page, 'review')
  await addButton(page).click()
  await expect(page.getByText('Registration added for Ann Lee')).toBeVisible()
})

test('Back and the progress list keep everything typed, and Cancel leaves without saving', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Ann', 'Lee')
  await page.getByLabel('Email', { exact: true }).fill('ann@example.com')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await page.getByLabel('Average').fill('210')
  await nextTo(page, 'review')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByLabel('Average')).toHaveValue('210')
  await expect(page.getByLabel(afternoon)).toBeChecked()
  await page.getByRole('button', { name: '1. Bowler' }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ann@example.com')
  await expect(page.getByRole('button', { name: '3. Review' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Leave page' }).click()
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Ann Lee' })).toHaveCount(0)
})

test('Search again returns to the search from a new bowler, and Pick someone else from a stored one', async ({
  page,
}) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await page.getByRole('button', { name: 'Search again' }).click()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()

  await search(page, { usbc: '1234-56789' })
  await pick(page, 'Maria Gonzalez, 1234-56789').click()
  await page.getByRole('button', { name: 'Pick someone else' }).click()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
})

test('a failed save shows a toast, and the desk saves again (D-157)', async ({ page }) => {
  await openAdd(page)
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Fay', 'Flaky')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')

  await addButton(page).click()
  await expect(page.getByRole('alert')).toContainText('Failed to save the registration (500)')
  await expect(stepHeading(page, 'Review')).toBeVisible()
  await addButton(page).click()

  await expect(page.getByText('Registration added for Fay Flaky')).toBeVisible()
})

test('a complete tournament has no Add registration link, and the page says why (D-130)', async ({
  page,
}) => {
  await openTournamentsSignedIn(page)
  // The past tournaments are complete in the demo.
  await page.getByRole('article').nth(1).getByRole('link').click()
  await menuLink(page, 'Registrations')
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add registration' })).toHaveCount(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', window.location.pathname + '/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByText('This tournament is complete')).toBeVisible()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to registrations' })).toBeVisible()
})

test('a visitor who is signed out is sent to sign in, and sees no Registrations link (D-157, D-52)', async ({
  page,
}) => {
  await page.goto('/tournaments')
  await page.getByRole('article').first().getByRole('link').click()
  await expect(sidebar(page).getByRole('link', { name: 'Registrations' })).toHaveCount(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', window.location.pathname + '/registrations/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})

test('a score keeper sees the registrations but cannot add one (D-157, D-97)', async ({ page }) => {
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
  await expect(page.getByRole('link', { name: 'Add registration' })).toHaveCount(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', window.location.pathname + '/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByText(/do not have access|not have permission/i)).toBeVisible()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toHaveCount(0)
})

test('an admin can add a registration too (D-157)', async ({ page }) => {
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

  await page.getByRole('link', { name: 'Add registration' }).click()
  await page.getByRole('button', { name: 'New bowler' }).click()
  await fillNames(page, 'Al', 'Admin')
  await nextTo(page, 'registration')
  await page.getByLabel('Division (required)').selectOption('Scratch')
  await page.getByLabel(afternoon).check()
  await nextTo(page, 'review')
  await addButton(page).click()

  await expect(page.getByText('Registration added for Al Admin')).toBeVisible()
})

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

  test('every step and dialog fits 320 px with no sideways scroll (D-73)', async ({ page }) => {
    await openAdd(page)
    expect(await sidewaysScrollers(page), 'search').toEqual([])

    await search(page, { last: 'gon' })
    await expect(page.getByRole('heading', { name: '3 bowlers found' })).toBeVisible()
    expect(await sidewaysScrollers(page), 'results').toEqual([])

    await pick(page, 'Maria Gonzalez, 1234-56789').click()
    await expect(stepHeading(page, 'Bowler')).toBeVisible()
    expect(await sidewaysScrollers(page), 'step 1').toEqual([])

    await nextTo(page, 'registration')
    expect(await sidewaysScrollers(page), 'step 2').toEqual([])

    await page.getByLabel('Division (required)').selectOption('Scratch')
    await page.getByLabel(afternoon).check()
    await nextTo(page, 'review')
    expect(await sidewaysScrollers(page), 'step 3').toEqual([])

    await page.getByRole('button', { name: '1. Bowler' }).click()
    await page.getByLabel('Street').fill('88 Pine Road')
    await nextTo(page, 'registration')
    await nextTo(page, 'review')
    expect(await sidewaysScrollers(page), 'review with changes').toEqual([])
  })
})
