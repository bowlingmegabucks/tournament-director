import type { Bowler } from './bowlers'
import { squadA, squadB, squadC, squadD, sweeperOne, sweeperTwo } from './sessions'

/**
 * Who enters what in the main tournament, written as rules over the bowler's number so the counts
 * can be worked out by hand. Division: the "Women or Seniors" division takes a woman of any age, or
 * anyone 50 or more, who averages 100 to 180 (the legacy rule, REG-04e); every second such bowler
 * (even number) goes there. Of the rest, every fourth bowler (number 1, 5, 9, ...) is Handicap and
 * the others are Scratch.
 */
export function divisionFor(bowler: Bowler): string {
  const ageOrGender = bowler.gender === 'F' || bowler.age >= 50
  if (ageOrGender && bowler.average >= 100 && bowler.average <= 180 && bowler.index % 2 === 0) {
    return 'Women or Seniors'
  }
  return bowler.index % 4 === 1 ? 'Handicap' : 'Scratch'
}

/**
 * Site bowlers (numbers 0 to 89) enter two squads each, by number modulo 4: 0 gets A and C, 1 gets B
 * and D, 2 gets A and D, 3 gets B and C. Each squad gets 45 (90 bowlers, 180 entries).
 */
const squadPairs = [
  [squadA, squadC],
  [squadB, squadD],
  [squadA, squadD],
  [squadB, squadC],
]
export const squadsFor = (bowler: Bowler) => squadPairs[bowler.index % 4] ?? []

/** Sweeper one: every third bowler (30 of 90). Sweeper two: every second bowler (45 of 90). */
export function sweepersFor(bowler: Bowler) {
  const entered = []
  if (bowler.index % 3 === 0) entered.push(sweeperOne)
  if (bowler.index % 2 === 0) entered.push(sweeperTwo)
  return entered
}

/** Bowlers 0, 6, and 12 are in the super sweeper: each is in both sweepers (D-203). */
export const superSweeperFor = (bowler: Bowler) => bowler.index % 6 === 0 && bowler.index < 18

/** What the Registrations page summary must show after the site's 90 (worked out by hand). */
export const siteExpected = {
  registrations: 90,
  superSweepers: 3,
  squadEntries: 45, // each of the four squads
  sweeperOneEntries: 30,
  sweeperTwoEntries: 45,
}

/**
 * The fee a bowler owes for these entries: each squad's own fee, else the tournament's ($60), plus
 * each sweeper's fee, and nothing for the super sweeper (ADD-01, D-166). Whole dollars here.
 */
export const squadFee = (squad: { entryFee?: string }, tournamentFee: number) =>
  squad.entryFee === undefined ? tournamentFee : Number(squad.entryFee)
/**
 * The desk's 60 new bowlers (numbers 90 to 149) arrive in four batches of 15, one batch before each
 * squad, as walk-ins do: batch 0 before squad A, batch 1 before B, and so on. A batch bowler enters
 * the squad that is next and, except in the last batch, one later squad. Later stages (lanes,
 * scores, complete) run between the batches, so a later batch registers after earlier squads are
 * scored and complete (D-203: a complete squad takes no new entries).
 */
export const deskBatchSize = 15
export const deskBatches = [0, 1, 2, 3] as const
export type DeskBatch = (typeof deskBatches)[number]

const batchSquads = [squadA, squadB, squadC, squadD]

/** The bowlers of one desk batch, by number. */
export const deskBatchOf = (desk: Bowler[], batch: DeskBatch) =>
  desk.filter((bowler) => Math.floor((bowler.index - 90) / deskBatchSize) === batch)

/**
 * The squads a desk bowler enters. Place k is the bowler's place in the batch (0 to 14). Batch 0:
 * A, plus B, C, or D by k modulo 3. Batch 1: B, plus C (even k) or D. Batch 2: C and D. Batch 3: D.
 */
export function deskSquadsFor(bowler: Bowler) {
  const offset = bowler.index - 90
  const batch = Math.floor(offset / deskBatchSize) as DeskBatch
  const place = offset % deskBatchSize
  const own = batchSquads[batch]
  if (!own) return []
  if (batch === 0) return [own, batchSquads[1 + (place % 3)]]
  if (batch === 1) return [own, place % 2 === 0 ? squadC : squadD]
  if (batch === 2) return [own, squadD]
  return [own]
}

/** The desk's super sweeper: bowlers 90 and 96 (each is in both sweepers by the same rules). */
export const deskSuperSweeperFor = (bowler: Bowler) => bowler.index === 90 || bowler.index === 96

/**
 * What the Registrations page summary must show once all four desk batches are in (by hand).
 * Squad entries: site 45 each, plus the desk's A 15, B 20 (15 + 5), C 28 (15 + 5 + 8), D 42
 * (15 + 5 + 7 + 15), which is 285 in all. The last 15 of the plan's 300 come from site bowlers who
 * add a squad at the desk (a later slice).
 */
export const afterDeskExpected = {
  registrations: 150,
  superSweepers: 5,
  squadEntries: { A: 60, B: 65, C: 73, D: 87 },
  sweeperOneEntries: 50, // site 30 + desk 20
  sweeperTwoEntries: 75, // site 45 + desk 30
}

/** The total the desk collects for these entries (whole dollars): the fee table (ADD-01). */
export function totalToCollect(
  squads: { entryFee?: string }[],
  sweepers: { entryFee: string }[],
  tournamentFee: number,
): number {
  return (
    squads.reduce((sum, squad) => sum + squadFee(squad, tournamentFee), 0) +
    sweepers.reduce((sum, sweeper) => sum + Number(sweeper.entryFee), 0)
  )
}
