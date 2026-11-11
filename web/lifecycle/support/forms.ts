import { expect, type Page } from '@playwright/test'
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

async function fillSession(page: Page, session: SquadData) {
  await page.getByLabel('Date and time (required)').fill(session.date)
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
}
