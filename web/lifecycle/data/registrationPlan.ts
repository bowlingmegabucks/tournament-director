import type { Bowler } from './bowlers'
import { squadA, squadB, squadC, squadD, sweeperOne, sweeperTwo } from './sessions'

/**
 * Who enters what in the main tournament, written as rules over the bowler's number so the counts
 * can be worked out by hand. Division: a woman of 50 or more averaging 100 to 180 is a Senior Woman;
 * every fourth bowler (number 1, 5, 9, ...) is Handicap; the rest are Scratch.
 */
export function divisionFor(bowler: Bowler): string {
  if (bowler.gender === 'F' && bowler.age >= 50 && bowler.average >= 100 && bowler.average <= 180) {
    return 'Senior Women'
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
