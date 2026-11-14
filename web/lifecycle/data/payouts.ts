import { bowlerAt, fullName } from './bowlers'

const name = (index: number) => fullName(bowlerAt(index))

/**
 * Payouts (PAY-01 to PAY-21, D-267 to D-285), worked out by hand from the designed scores, never
 * from the app (rule 5). The inferred payees are the cashers of `expectedResults.ts`: squad A has
 * three in Scratch (48, 62, and 82 or 96, who tie fully across the line), two in Women or Seniors
 * (10 or 24, and 66, who tie fully across the cut line), and one in Handicap (97).
 */

/** Squad A: every inferred casher gets the same amount; bowler 76 advanced, so a payout for 76 is by hand. */
export const squadPayout = {
  same: '100',
  /** The cashers named for certain (a full tie leaves one of two names open). */
  named: [name(48), name(62), name(66), name(97)],
  /** How many bowlers the Same amount dialog names. */
  inferredCount: 6,
  /** An advancer paid by hand, with the reason a note must give (D-269). */
  byHand: { name: name(76), amount: '25', note: 'Won the side pot' },
  /** The advancers: the results never show a payout for them (D-284). */
  advancers: [name(76), name(6), name(20)],
}

/** Sweeper one: N = 50, 7 cash, every casher the same amount. The tied pair (54, 81) has one casher. */
export const sweeperPayout = {
  same: '50',
  named: [name(138), name(69), name(48), name(144), name(75), name(6)],
  inferredCount: 7,
}

/** Super sweeper: 5 bowlers, 1 cashes (12, who won the tie on high game). */
export const superSweeperPayout = { same: '200', casher: name(12), inferredCount: 1 }

/** Finals, Scratch: the winner of the shootout, and two bowlers who tie for fifth (D-277). */
export const finalsPayout = {
  winner: { name: name(138), amount: '1500', note: '1st overall' },
  tied: { names: [name(83), name(76)], amount: '400', note: 'tied 5th' },
}

/** Money worked out by hand: 6 x 100 + 25, 7 x 50, 200, and 1500 + 2 x 400. */
export const payoutTotals = {
  count: 6 + 1 + 7 + 1 + 3,
  total: '$3,475.00',
  /** One bowler's total across events: 138 got 50 (sweeper one) and 1500 (finals). */
  topBowler: { name: name(138), total: '$1,550.00', payouts: 2 },
  /** 48 cashed in squad A (100) and sweeper one (50). */
  second: { name: name(48), total: '$150.00', payouts: 2 },
  /** 76 got the by-hand 25 and 400 in the finals. */
  byHand: { name: name(76), total: '$425.00', payouts: 2 },
  /** Only 138 earned $1,000 or more. */
  atLeast1000: [name(138)],
}
