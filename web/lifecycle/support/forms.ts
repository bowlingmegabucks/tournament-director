import { expect, type Page } from '@playwright/test'
import type { Bowler } from '../data/bowlers'
import type { DivisionData } from '../data/divisions'
import type { SquadData, SweeperData } from '../data/sessions'

/** The Divisions page row of a division. */
export const divisionRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) })

/** The squad or sweeper card with this date text. */
export const sessionCard = (page: Page, label: string) =>
  page.getByRole('listitem').filter({ hasText: label })

/** On the Divisions page: open New division, fill it, and save. Leaves the page where the save lands. */
export async function addDivision(
  page: Page,
  division: Pick<DivisionData, 'name' | 'fields'>,
  gender?: string,
) {
  await page.getByRole('link', { name: 'New division' }).click()
  await page.getByLabel('Name (required)', { exact: true }).fill(division.name)
  if (gender) await page.getByLabel('Gender').selectOption(gender)
  for (const [label, value] of Object.entries(division.fields)) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByRole('button', { name: 'Add division' }).click()
}

/** Type `YYYY-MM-DD` into a date box as the director does: `mm/dd/yyyy`. */
async function usDay(page: Page, label: string, day: string) {
  const [year, month, date] = day.split('-')
  await page.getByLabel(label, { exact: true }).fill(`${month}/${date}/${year}`)
}

async function fillSession(page: Page, session: SquadData) {
  const [day = '', time = ''] = session.date.split('T')
  await usDay(page, 'Date and time (required)', day)
  await page.getByLabel('Time', { exact: true }).fill(time)
  await page.getByLabel('Starting lane (required)').fill(String(session.startingLane))
  await page.getByLabel('Number of lanes (required)').fill(String(session.lanes))
  await page.getByLabel('Bowlers per pair (required)').fill(String(session.perPair))
}

/** On the Squads page: open New squad, fill it, and save. */
export async function addSquad(page: Page, squad: SquadData) {
  await page.getByRole('link', { name: 'New squad' }).click()
  await expect(page.getByRole('heading', { name: 'New squad', level: 1 })).toBeVisible()
  await fillSession(page, squad)
  if (squad.entryFee) await page.getByLabel('Entry fee').fill(squad.entryFee)
  if (squad.cashRatio) await page.getByLabel('Cash ratio').fill(squad.cashRatio)
  await page.getByRole('button', { name: 'Add squad' }).click()
}

/** On the Sweepers page: open New sweeper, fill it (with bonus pins), and save. */
export async function addSweeper(page: Page, sweeper: SweeperData) {
  await page.getByRole('link', { name: 'New sweeper' }).click()
  await expect(page.getByRole('heading', { name: 'New sweeper', level: 1 })).toBeVisible()
  await fillSession(page, sweeper)
  await page.getByLabel('Entry fee (required)').fill(sweeper.entryFee)
  await page.getByLabel('Games (required)').fill(sweeper.games)
  await page.getByLabel('Cash ratio (required)').fill(sweeper.cashRatio)
  for (const [division, pins] of Object.entries(sweeper.bonusPins)) {
    await page.getByLabel(division, { exact: true }).fill(pins)
  }
  await page.getByRole('button', { name: 'Add sweeper' }).click()
}

interface TournamentData {
  name: string
  start: string
  end: string
  bowlingCenter: string
  entryFee: string
  games: string
  finalsRatio: string
  cashRatio: string
  superSweeperCashRatio: string
}

/** On the Tournaments page: open New tournament, fill it, and save. Lands on the overview. */
export async function addTournament(page: Page, tournament: TournamentData) {
  await page.getByRole('link', { name: 'New tournament' }).click()
  await page.getByLabel('Name (required)', { exact: true }).fill(tournament.name)
  await usDay(page, 'Start date (required)', tournament.start)
  await usDay(page, 'End date (required)', tournament.end)
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
}

/** A label made safe to put inside a regular expression. */
function exactly(text: string): RegExp {
  return new RegExp(
    text
      .split('')
      .map((char) => (/[a-z0-9 :/]/i.test(char) ? char : `\\${char}`))
      .join(''),
  )
}

/**
 * At the desk, add a new bowler (Registrations page, Add registration, New bowler, Registration,
 * Review) and save. Checks the "what to collect" total before saving (ADD-01). The bowler record is
 * typed in full; the desk picks the division and the squads and sweepers by their dates. Starts and
 * ends on the Registrations page.
 */
export async function addDeskRegistration(
  page: Page,
  bowler: Bowler,
  entry: {
    division: string
    squadLabels: string[]
    sweeperLabels: string[]
    superSweeper: boolean
    total: number
  },
) {
  await page.getByRole('link', { name: 'Add registration' }).click()
  await expect(page.getByRole('form', { name: 'Find a bowler' })).toBeVisible()
  await page.getByRole('button', { name: 'New bowler' }).click()

  await page.getByLabel('First name (required)').fill(bowler.firstName)
  await page.getByLabel('Last name (required)').fill(bowler.lastName)
  await page.getByLabel('Street').fill(bowler.street)
  await page.getByLabel('City').fill(bowler.city)
  await page.getByLabel('State (2 letters)').fill(bowler.state)
  await page.getByLabel('Zip').fill(bowler.zipCode)
  await page.getByLabel('Email', { exact: true }).fill(bowler.email)
  await page.getByLabel('Phone').fill(bowler.phoneNumber)
  await page.getByLabel('USBC ID').fill(bowler.usbcId)
  await page.getByLabel('Date of birth').fill(bowler.dateOfBirth)
  await page.getByLabel('Gender').selectOption(bowler.gender === 'F' ? 'Female' : 'Male')
  await page.getByRole('button', { name: 'Next: registration' }).click()

  await page.getByLabel('Division (required)').selectOption(entry.division)
  await page.getByLabel('Average').fill(String(bowler.average))
  const squads = page.getByRole('group', { name: /Squads/ })
  for (const label of entry.squadLabels) await squads.getByLabel(exactly(label)).check()
  const sweepers = page.getByRole('group', { name: /Sweepers/ })
  for (const label of entry.sweeperLabels) await sweepers.getByLabel(exactly(label)).check()
  if (entry.superSweeper) await page.getByLabel('Super sweeper').check()
  await page.getByRole('button', { name: 'Next: review' }).click()

  await expect(page.getByRole('row', { name: `Total to collect $${entry.total}.00` })).toBeVisible()
  await page.getByRole('button', { name: 'Add registration', exact: true }).click()
  await expect(
    page.getByText(`Registration added for ${bowler.firstName} ${bowler.lastName}`),
  ).toBeVisible()
}

/** What one desk edit changes. Every field is optional; the page starts on the Registration step. */
export interface DeskEdit {
  division?: string
  average?: number
  addSquads?: string[]
  removeSquads?: string[]
  addSweepers?: string[]
  removeSweepers?: string[]
  superSweeper?: boolean
  /** The net line the Review step must show, e.g. `Net: refund $5.00.`. Left out when no fee moves. */
  net?: string
}

/**
 * From the Registrations page, open one bowler's Edit page, make the changes, read the Review
 * step, and save. A removal needs the tick (D-207). Ends on the Registrations page with the toast.
 */
export async function editDeskRegistration(page: Page, bowler: Bowler, change: DeskEdit) {
  const name = `${bowler.firstName} ${bowler.lastName}`
  await page.getByRole('link', { name: `Edit ${name}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit registration', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Registration', level: 2 })).toBeVisible()

  if (change.division) await page.getByLabel('Division (required)').selectOption(change.division)
  if (change.average !== undefined) await page.getByLabel('Average').fill(String(change.average))
  const squads = page.getByRole('group', { name: /Squads/ })
  for (const label of change.addSquads ?? []) await squads.getByLabel(exactly(label)).check()
  for (const label of change.removeSquads ?? []) await squads.getByLabel(exactly(label)).uncheck()
  const sweepers = page.getByRole('group', { name: /Sweepers/ })
  for (const label of change.addSweepers ?? []) await sweepers.getByLabel(exactly(label)).check()
  for (const label of change.removeSweepers ?? []) {
    await sweepers.getByLabel(exactly(label)).uncheck()
  }
  if (change.superSweeper !== undefined) {
    await page.getByLabel('Super sweeper').setChecked(change.superSweeper)
  }
  await page.getByRole('button', { name: 'Next: review' }).click()

  if (change.net) await expect(page.getByText(change.net, { exact: true })).toBeVisible()
  const removes = (change.removeSquads?.length ?? 0) + (change.removeSweepers?.length ?? 0)
  if (removes > 0) await page.getByRole('checkbox', { name: /I understand/ }).check()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Registrations', level: 1 })).toBeVisible()
  await expect(page.getByText(`${name}: Registration updated.`)).toBeVisible()
}
