import { bowlers, fullName } from './bowlers'

const name = (index: number) => {
  const bowler = bowlers[index]
  if (!bowler) throw new Error(`No bowler ${index}`)
  return fullName(bowler)
}

/** A line between groups, a bowler's name, or the names one of which fills a row (a full tie). */
export type ExpectedItem = 'Cut Line' | 'Cash Line' | 'No Advancers' | string | string[]

export interface ExpectedList {
  order: ExpectedItem[]
  notes: Record<string, number>
}

export interface ExpectedDivision {
  squad: 'A' | 'B' | 'C' | 'D'
  division: string
  /** The rows down to the cash line, as the Results tab lists them. */
  order: ExpectedItem[]
  /** Tie notes the page must show, and how many times (a full tie shows on both bowlers). */
  notes: Record<string, number>
}

/**
 * Hand-written from the designed scores in `scores.ts` and the spot rule (RES-04, RES-05, RES-08):
 * `A = floor(N / 7.5)`, `C = floor(N / cash ratio) - A` (squad C's ratio is 5), `A = 0` gives one
 * casher. A full tie across a line orders by last name, so either of its two names may come first: the pair
 * shows as a list, and the tie splits across the line.
 */
export const expectedResults: ExpectedDivision[] = [
  {
    // N = 39: 5 advance, 3 cash. 34 and 48 tie on total at the cut line; 34 has the higher game.
    // 82 and 96 tie fully across the cash line.
    squad: 'A',
    division: 'Scratch',
    order: [
      name(76),
      name(6),
      name(20),
      name(103),
      name(34),
      'Cut Line',
      name(48),
      name(62),
      [name(82), name(96)],
      'Cash Line',
      [name(82), name(96)],
    ],
    notes: {
      'Tied on total at the cut line. Won the spot on high game.': 1,
      'Tied on total at the cut line. Lost the spot on high game.': 1,
      'Full tie at the cash line.': 2,
    },
  },
  {
    // N = 18: 2 advance, 2 cash. 10 and 24 tie fully across the cut line.
    squad: 'A',
    division: 'Women or Seniors',
    order: [name(0), [name(10), name(24)], 'Cut Line', [name(10), name(24)], name(66), 'Cash Line'],
    notes: { 'Full tie at the cut line.': 2 },
  },
  {
    // N = 3: nobody advances and one cashes. 97 has the lowest scratch and the best handicap total.
    squad: 'A',
    division: 'Handicap',
    order: ['No Advancers', name(97), 'Cash Line'],
    notes: {},
  },
  {
    // N = 33: 4 advance, 3 cash. 55 and 75 have the same games (a tie inside the advancers). 47 and
    // 19 tie on total across the cash line; 47 has the higher second game.
    squad: 'B',
    division: 'Scratch',
    order: [
      name(83),
      name(110),
      [name(55), name(75)],
      [name(55), name(75)],
      'Cut Line',
      name(96),
      name(27),
      name(47),
      'Cash Line',
      name(19),
    ],
    notes: {
      'Tied on total at the cash line. Won the spot on 2nd-highest game.': 1,
      'Tied on total at the cash line. Lost the spot on 2nd-highest game.': 1,
    },
  },
  {
    // N = 28: 3 advance, 3 cash. Bowler 77 averages 141 and has the lowest scratch of the top
    // three, but the handicap puts them third. Bowler 65 (1380) takes the third cash place.
    squad: 'B',
    division: 'Handicap',
    order: [name(69), name(73), name(77), 'Cut Line', name(41), name(61), name(65), 'Cash Line'],
    notes: {},
  },
]

/** Bowler 0 advanced in A, so squad C's Women or Seniors table tags them (RES-06, D-81). */
export const earlierAdvancer = { squad: 'C', division: 'Women or Seniors', name: name(0) } as const

const either = (a: number, b: number) => [name(a), name(b)]

/**
 * Sweeper one: N = 50, 7 cash. The formula gives some bowlers the same games, so those pairs list
 * in either order. 54 and 81 tie fully across the cash line. 24 (bonus pins) ranks above 12.
 */
export const sweeperOneResults: ExpectedList = {
  order: [
    name(138),
    name(69),
    name(48),
    name(144),
    name(75),
    name(6),
    either(54, 81),
    'Cash Line',
    either(54, 81),
    name(24),
    name(12),
  ],
  notes: { 'Full tie at the cash line.': 2 },
}

/** Sweeper two: N = 75, 15 cash. 130 and 40 tie fully across the cash line. */
export const sweeperTwoResults: ExpectedList = {
  order: [
    name(138),
    name(12),
    name(20),
    name(48),
    name(76),
    either(124, 144),
    either(124, 144),
    either(6, 26),
    either(6, 26),
    either(34, 54),
    either(34, 54),
    either(62, 82),
    either(62, 82),
    name(110),
    either(130, 40),
    'Cash Line',
    either(130, 40),
  ],
  notes: { 'Full tie at the cash line.': 2 },
}

/** Super sweeper: 5 bowlers, 1 cashes. 12 and 6 tie on total; 12 has the higher game. */
export const superSweeperResults: ExpectedList = {
  order: [name(12), 'Cash Line', name(6), name(0), name(96), name(90)],
  notes: {
    'Tied on total at the cash line. Won the spot on high game.': 1,
    'Tied on total at the cash line. Lost the spot on high game.': 1,
  },
}

export interface ExpectedFinals extends Partial<ExpectedList> {
  division: string
  /** The summary line under the heading. */
  summary: string
  /** At-large only: the message that replaces the table when the division has no spot. */
  empty?: string
  /** Names whose row says "Cashed on a squad". */
  cashers?: string[]
  /** Rows whose Squad column must show this date (`MM/dd`), by name. */
  squadDates?: Record<string, string>
}

/**
 * At-large, worked out by hand. The finals ratio is the tournament's 7.5 for every squad (D-86), so
 * Scratch has `floor(163 / 7.5) = 21` spots and 21 squad advancers (4 squads: 5 + 4 + 7 + 5), none
 * left. Handicap: `floor(72 / 7.5) = 9`, 8 advancers, one spot. Women or Seniors: `floor(50 / 7.5)
 * = 6`, 5 advancers, one spot. The pool is everyone who advanced nowhere, best entry each.
 */
export const atLargeResults: ExpectedFinals[] = [
  {
    division: 'Scratch',
    summary:
      '163 entries · 21 finals spots (ratio 7.5) · 21 advanced from squads · 0 at-large spots',
    empty: 'No at-large spots in this division.',
  },
  {
    // 65 (squad B) and 97 (squad A) both total 1380 with handicap; 65 has the higher game. 65 cashed
    // in squad B, 97 in squad A.
    division: 'Handicap',
    summary: '72 entries · 9 finals spots (ratio 7.5) · 8 advanced from squads · 1 at-large spot',
    order: [name(65)],
    notes: { 'Tied on total at the last at-large spot. Won the spot on high game.': 1 },
    cashers: [name(65)],
  },
  {
    division: 'Women or Seniors',
    summary: '50 entries · 6 finals spots (ratio 7.5) · 5 advanced from squads · 1 at-large spot',
    order: [name(114)],
    notes: {},
    cashers: [name(114)],
  },
]

/**
 * Seeding: finalists (squad advancers and at-large) in order of their best entry, a Cut Line, then
 * the others. A bowler's best entry may be in a later squad than the one they advanced from: 34
 * advanced in A with 1322 and bowled 1326 in D (RES-19).
 */
export const seedingResults: ExpectedFinals[] = [
  {
    division: 'Scratch',
    summary: '21 finalists (21 from squads, 0 at-large)',
    order: [
      name(138),
      name(83),
      name(76),
      name(110),
      name(124),
      either(55, 75),
      either(55, 75),
      name(6),
      name(20),
      name(103),
      name(34),
      name(48),
      name(131),
      either(62, 82),
      either(62, 82),
      either(27, 47),
      either(27, 47),
      name(130),
      name(144),
      name(12),
      name(26),
      'Cut Line',
      name(96),
      name(19),
      name(40),
    ],
    notes: {},
    squadDates: { [name(34)]: '03/13' },
  },
  {
    division: 'Handicap',
    summary: '9 finalists (8 from squads, 1 at-large)',
    order: [
      name(69),
      name(73),
      name(77),
      name(41),
      name(61),
      name(65),
      name(45),
      name(81),
      name(105),
      'Cut Line',
      name(97),
      name(101),
      name(137),
    ],
    notes: {},
    cashers: [name(65)],
  },
  {
    division: 'Women or Seniors',
    summary: '6 finalists (5 from squads, 1 at-large)',
    order: [
      name(0),
      name(142),
      either(10, 24),
      either(10, 24),
      name(66),
      name(114),
      'Cut Line',
      name(16),
      name(44),
      name(72),
    ],
    notes: {},
    cashers: [name(114)],
  },
]
