/**
 * The squads and sweepers of the run (stage 3). Dates sit inside the tournament (12 to 14 March 2099),
 * and the lane counts leave room for the entries of stage 4: 364 squad seats for 300 entries.
 */
export interface SquadData {
  /** `YYYY-MM-DDTHH:mm` for the date box. */
  date: string
  /** The card's date text, as the list shows it: `Thu 03/12/2099 9:00 AM`. */
  label: string
  startingLane: number
  lanes: number
  perPair: number
  /** A squad's own fee or ratio; blank uses the tournament's. */
  entryFee?: string
  cashRatio?: string
}

export interface SweeperData extends SquadData {
  entryFee: string
  games: string
  cashRatio: string
  /** Bonus pins per game by division name. A division left out gets none. */
  bonusPins: Record<string, string>
}

// A is made with 38 lanes and edited to 40 in stage 3.
export const squadA: SquadData = {
  date: '2099-03-12T09:00',
  label: 'Thu 03/12/2099 9:00 AM',
  startingLane: 1,
  lanes: 38,
  perPair: 4,
}
export const squadAEdited = { lanes: 40, rangeText: '1 to 40 (40 lanes)' }

export const squadB: SquadData = {
  date: '2099-03-12T13:00',
  label: 'Thu 03/12/2099 1:00 PM',
  startingLane: 1,
  lanes: 48,
  perPair: 5,
  entryFee: '75',
}

export const squadC: SquadData = {
  date: '2099-03-13T09:00',
  label: 'Fri 03/13/2099 9:00 AM',
  startingLane: 11,
  lanes: 32,
  perPair: 4,
  cashRatio: '5',
}

export const squadD: SquadData = {
  date: '2099-03-13T13:00',
  label: 'Fri 03/13/2099 1:00 PM',
  startingLane: 1,
  lanes: 40,
  perPair: 5,
}

export const squads = [squadA, squadB, squadC, squadD]

// Sweeper 1 has bonus pins (for the seniors); sweeper 2 has none. Sweeper 2 is made with a $25 fee
// and edited to $30.
export const sweeperOne: SweeperData = {
  date: '2099-03-13T18:00',
  label: 'Fri 03/13/2099 6:00 PM',
  startingLane: 1,
  lanes: 60,
  perPair: 5,
  entryFee: '35',
  games: '3',
  cashRatio: '6.5',
  bonusPins: { 'Senior Women': '15' },
}

export const sweeperTwo: SweeperData = {
  date: '2099-03-14T11:00',
  label: 'Sat 03/14/2099 11:00 AM',
  startingLane: 1,
  lanes: 40,
  perPair: 4,
  entryFee: '25',
  games: '3',
  cashRatio: '5',
  bonusPins: {},
}
export const sweeperTwoEdited = { entryFee: '30', feeText: '$30.00' }

export const sweepers = [sweeperOne, sweeperTwo]

/** The spare session of each kind: made, then deleted (SQD-14). */
export const spareSquad: SquadData = {
  date: '2099-03-14T15:00',
  label: 'Sat 03/14/2099 3:00 PM',
  startingLane: 1,
  lanes: 10,
  perPair: 4,
}
export const spareSweeper: SweeperData = {
  date: '2099-03-14T16:00',
  label: 'Sat 03/14/2099 4:00 PM',
  startingLane: 1,
  lanes: 10,
  perPair: 4,
  entryFee: '20',
  games: '2',
  cashRatio: '5',
  bonusPins: {},
}

/** A date after the tournament ends: the API refuses it with a 409 (scripted failure). */
export const outsideDate = '2099-03-20T09:00'
