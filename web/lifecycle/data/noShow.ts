import { bowlerAt, fullName, type Bowler } from './bowlers'
import type { SquadData, SweeperData } from './sessions'

/**
 * Stage 10 (docs/plans/no-show-move-refund.md): a bowler misses a squad, the squad is completed,
 * and they ask to bowl the next morning. A tournament of its own, so the hand-worked tables of the
 * main run do not move. Finals 1 in 7, cash 1 in 5, 3 games:
 *
 * | Entries | Advance | Cash |
 * | ------- | ------- | ---- |
 * | 21      | 3       | 1    |
 * | 20      | 2       | 2    |
 * | 19      | 2       | 1    |
 *
 * Three divisions in the first squad, one no-show in each:
 * - Move: 20 entries to 19. The second casher drops out. No payout is recorded yet.
 * - Ruling: 21 to 20. The third advancer is kept advancing by ruling, and bowls again the next day.
 * - Paid: 20 to 19 by a refund. A payout saved while the admin reviews gets the system note.
 */
export const noShowTournament = {
  name: 'Make-up Classic',
  start: '2025-04-10',
  end: '2025-04-12',
  bowlingCenter: 'Lifecycle Lanes',
  entryFee: '50',
  games: '3',
  finalsRatio: '7',
  cashRatio: '5',
  superSweeperCashRatio: '3',
}

export const missedSquad: SquadData = {
  date: '2025-04-10T08:00',
  label: 'Thu 04/10/2025 8:00 AM',
  startingLane: 1,
  lanes: 30,
  perPair: 5,
}

export const makeUpSquad: SquadData = {
  date: '2025-04-11T08:00',
  label: 'Fri 04/11/2025 8:00 AM',
  startingLane: 1,
  lanes: 30,
  perPair: 5,
}

export const makeUpSweeper: SweeperData = {
  date: '2025-04-11T18:00',
  label: 'Fri 04/11/2025 6:00 PM',
  startingLane: 1,
  lanes: 12,
  perPair: 4,
  entryFee: '25',
  games: '3',
  cashRatio: '4',
  bonusPins: {},
}

const range = (from: number, count: number): Bowler[] =>
  Array.from({ length: count }, (_, index) => bowlerAt(from + index))

function division(name: string, from: number, entries: number) {
  const all = range(from, entries)
  const noShow = all.at(-1)
  if (!noShow) throw new Error('A division needs bowlers')
  /** Best first: the names by finishing place in the first squad. The no-show is last. */
  return { name, bowled: all.slice(0, -1), noShow, nameAt: (place: number) => nameOf(all[place]) }
}

function nameOf(bowler: Bowler | undefined): string {
  if (!bowler) throw new Error('No bowler in that place')
  return fullName(bowler)
}

export const moveDivision = division('Move', 0, 20)
export const rulingDivision = division('Ruling', 20, 21)
export const paidDivision = division('Paid', 41, 20)

/** Five more in the Ruling division of the second squad. */
export const makeUpExtras = range(61, 5)

/** Scores of the first squad: 3 pins apart, so no ties. */
export const missedScore = (place: number) => 250 - place * 3

export const systemNote = `${fullName(paidDivision.noShow)} refunded from the 4/10 8:00 AM squad after completion.`
