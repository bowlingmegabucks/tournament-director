import { expect, test } from '@playwright/test'
import { admin, director, scoreKeeper } from './data/people'
import { editedBowlingCenter, tournament } from './data/tournament'
import { divisions, scratch } from './data/divisions'
import {
  outsideDate,
  spareSquad,
  spareSweeper,
  squadA,
  squadAEdited,
  squadB,
  squadC,
  squadD,
  squads,
  sweeperOne,
  sweeperTwo,
  sweeperTwoEdited,
  sweepers,
} from './data/sessions'
import { createFirstAdmin } from './support/createAdmin'
import { addDivision, addSquad, addSweeper, divisionRow, sessionCard } from './support/forms'
import { openTournamentPage } from './support/navigate'
import { inviteLinkIn, waitForMail } from './support/mail'
import { mainMenu, signIn } from './support/signIn'

// docs/plans/lifecycle-e2e.md. Stages run in order (rule 8): a failed stage skips the rest.
test.describe.configure({ mode: 'serial' })

test('stage 0: the first admin, then the other users through the add-user page', async ({
  page,
}) => {
  createFirstAdmin(admin)
  await signIn(page, admin)

  for (const person of [director, scoreKeeper]) {
    await mainMenu(page).getByRole('link', { name: 'Users' }).click()
    await page.getByRole('link', { name: 'Add user' }).click()
    await page.getByLabel('Name', { exact: true }).fill(person.name)
    await page.getByLabel('Email').fill(person.email)
    await page.getByRole('checkbox', { name: person.role }).check()
    await page.getByRole('button', { name: 'Add user' }).click()
    await expect(page.getByText(`Invite sent to ${person.email}.`)).toBeVisible()
  }

  // The invite lands in the mail catcher; the link sets the password (the set-password flow).
  for (const person of [director, scoreKeeper]) {
    await page.goto(inviteLinkIn(await waitForMail(person.email)))
    await page.getByLabel('New password').fill(person.password)
    await page.getByLabel('Confirm password').fill(person.password)
    await page.getByRole('button', { name: 'Set password' }).click()
    await expect(page.getByText('Your password is set.')).toBeVisible()
  }

  // Each new user signs in with the password they chose.
  await signIn(page, director)
})

test('stage 1: the director creates the tournament, edits a free field, and checks the overview', async ({
  page,
}) => {
  await signIn(page, director)
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await page.getByRole('link', { name: 'New tournament' }).click()

  await page.getByLabel('Name (required)', { exact: true }).fill(tournament.name)
  await page.getByLabel('Start date (required)', { exact: true }).fill(tournament.start)
  await page.getByLabel('End date (required)', { exact: true }).fill(tournament.end)
  await page.getByLabel('Bowling center (required)', { exact: true }).fill(tournament.bowlingCenter)
  await page
    .getByLabel('Entry fee in dollars (required)', { exact: true })
    .fill(tournament.entryFee)
  await page.getByLabel('Games per squad (required)', { exact: true }).fill(tournament.games)
  await page.getByLabel('Finals ratio (required)', { exact: true }).fill(tournament.finalsRatio)
  await page.getByLabel('Cash ratio (required)', { exact: true }).fill(tournament.cashRatio)
  await page
    .getByLabel('Super sweeper cash ratio (required)', { exact: true })
    .fill(tournament.superSweeperCashRatio)
  await page.getByRole('button', { name: 'Save tournament' }).click()

  await expect(page.getByRole('heading', { name: tournament.name, level: 1 })).toBeVisible()
  await expect(page.getByText('Games per squad').locator('+ dd')).toHaveText(tournament.games)
  await expect(page.getByText('Finals ratio').locator('+ dd')).toHaveText('1 in 7.5')
  await expect(page.getByText('Cash ratio', { exact: true }).locator('+ dd')).toHaveText('1 in 4.5')
  await expect(page.getByText('Super sweeper cash ratio').locator('+ dd')).toHaveText('1 in 3')

  await page.getByRole('link', { name: 'Edit tournament' }).click()
  await page.getByLabel('Bowling center (required)', { exact: true }).fill(editedBowlingCenter)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Tournament saved')).toBeVisible()
  await expect(page.getByText('Bowling center').locator('+ dd')).toHaveText(editedBowlingCenter)

  // Exactly one tournament now exists: the list shows it once.
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('stage 2: the director makes three divisions and the list numbers them', async ({ page }) => {
  await signIn(page, director)
  await openTournamentPage(page, 'Divisions')
  await expect(page.getByText('No divisions yet.')).toBeVisible()

  for (const division of divisions) {
    await addDivision(page, division, division.gender === 'Any' ? undefined : division.gender)
    await expect(page.getByText('Division created')).toBeVisible()
    const row = divisionRow(page, division.name)
    await expect(row.getByRole('cell').nth(0)).toHaveText(String(division.number))
    await expect(row).toContainText(division.gender)
    await expect(row).toContainText(division.ages)
    await expect(row).toContainText(division.averages)
    await expect(row).toContainText(division.handicap)
  }
  await expect(page.getByRole('rowheader')).toHaveText(divisions.map((division) => division.name))

  // Scripted failure: a name already used is a 409 and the list does not change.
  await addDivision(page, scratch)
  await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Name (required)', { exact: true })).toHaveAccessibleDescription(
    /already/i,
  )
  await openTournamentPage(page, 'Divisions')
  await expect(page.getByRole('rowheader')).toHaveCount(divisions.length)
})

test('stage 3: four squads and two sweepers, an edit of each, and a spare of each deleted', async ({
  page,
}) => {
  await signIn(page, director)
  await openTournamentPage(page, 'Squads')

  for (const squad of squads) {
    await addSquad(page, squad)
    await expect(page.getByText('Squad created')).toBeVisible()
  }

  // Scripted failure: a squad dated after the tournament is a 409 with the message.
  await addSquad(page, { ...squadA, date: outsideDate })
  await expect(page.getByRole('heading', { name: 'New squad', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Date and time (required)')).toHaveAccessibleDescription(
    /tournament/i,
  )
  await openTournamentPage(page, 'Squads')

  // Edit one squad: A gains two lanes.
  await page.getByRole('link', { name: `Edit squad ${squadA.label}` }).click()
  await page.getByLabel('Number of lanes (required)').fill(String(squadAEdited.lanes))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Squad saved')).toBeVisible()

  // The cards: the tournament's fee where the squad has none, the squad's own where it has.
  await expect(sessionCard(page, squadA.label)).toContainText(squadAEdited.rangeText)
  await expect(sessionCard(page, squadA.label)).toContainText('Up to 4')
  await expect(sessionCard(page, squadA.label)).toContainText('$60.00')
  await expect(sessionCard(page, squadA.label)).not.toContainText('(override)')
  await expect(sessionCard(page, squadB.label)).toContainText('48 lanes')
  await expect(sessionCard(page, squadB.label)).toContainText('Up to 5')
  await expect(sessionCard(page, squadB.label)).toContainText('$75.00 (override)')
  await expect(sessionCard(page, squadC.label)).toContainText('11 to 42 (32 lanes)')
  await expect(sessionCard(page, squadC.label)).toContainText('1 in 5.0 (override)')
  await expect(sessionCard(page, squadD.label)).toContainText('1 to 40 (40 lanes)')

  // A spare squad is made and deleted (SQD-14).
  await addSquad(page, spareSquad)
  await expect(sessionCard(page, spareSquad.label)).toHaveCount(1)
  await page.getByRole('button', { name: `Delete squad ${spareSquad.label}` }).click()
  await page
    .getByRole('dialog', { name: 'Delete this squad?' })
    .getByRole('button', { name: 'Delete squad' })
    .click()
  await expect(page.getByText('Squad deleted')).toBeVisible()
  await expect(sessionCard(page, spareSquad.label)).toHaveCount(0)
  for (const squad of squads) await expect(sessionCard(page, squad.label)).toHaveCount(1)

  // Sweepers.
  await openTournamentPage(page, 'Sweepers')
  for (const sweeper of sweepers) {
    await addSweeper(page, sweeper)
    await expect(page.getByText('Sweeper created')).toBeVisible()
  }
  await expect(sessionCard(page, sweeperOne.label)).toContainText('$35.00')
  await expect(sessionCard(page, sweeperOne.label)).toContainText('Senior Women: +15')
  await expect(sessionCard(page, sweeperTwo.label)).toContainText('$25.00')
  await expect(sessionCard(page, sweeperTwo.label)).not.toContainText('+')

  // Edit one sweeper: two's fee goes from $25 to $30.
  await page.getByRole('link', { name: `Edit sweeper ${sweeperTwo.label}` }).click()
  await page.getByLabel('Entry fee (required)').fill(sweeperTwoEdited.entryFee)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Sweeper saved')).toBeVisible()
  await expect(sessionCard(page, sweeperTwo.label)).toContainText(sweeperTwoEdited.feeText)

  // A spare sweeper is made and deleted.
  await addSweeper(page, spareSweeper)
  await expect(sessionCard(page, spareSweeper.label)).toHaveCount(1)
  await page.getByRole('button', { name: `Delete sweeper ${spareSweeper.label}` }).click()
  await page
    .getByRole('dialog', { name: 'Delete this sweeper?' })
    .getByRole('button', { name: 'Delete sweeper' })
    .click()
  await expect(page.getByText('Sweeper deleted')).toBeVisible()
  await expect(sessionCard(page, spareSweeper.label)).toHaveCount(0)
  for (const sweeper of sweepers) await expect(sessionCard(page, sweeper.label)).toHaveCount(1)
})
