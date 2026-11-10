import {
  buildPairs,
  MAX_SEATS,
  MIN_SEATS,
  pairOf,
  parsePosition,
  SEAT_ORDER,
  type Pair,
} from './positions.ts'

/** What the move reads, inside its transaction (D-216). */
export interface MoveFacts {
  kind: 'squad' | 'sweeper'
  tournamentComplete: boolean
  sessionComplete: boolean
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  /** Every entry of the session with its stored position (`''` when none). */
  entries: readonly { registrationId: string; position: string }[]
}

/** How a move ends. Only `move` writes; `unchanged` answers with the stored position. */
export type MoveOutcome =
  /** A complete tournament or session: 409 (D-10, SQD-17, LAN-13). */
  | { type: 'refused'; message: string }
  /** The registration is not on this session: 404 (LAN-05). */
  | { type: 'notOnSession' }
  /** The session cannot seat bowlers as set up: 422 (LAN-02, D-56). */
  | { type: 'badSeats'; message: string }
  /** The lane is not the first lane of a pair of this session: 400. */
  | { type: 'badLane'; message: string }
  /** The pair has no room: 409, with the pair named (Q-28, D-57). */
  | { type: 'full'; message: string }
  /** Nothing to write (LAN-06). */
  | { type: 'unchanged'; position: string }
  | { type: 'move'; position: string }

const label = (kind: 'squad' | 'sweeper') => (kind === 'squad' ? 'squad' : 'sweeper')

function pairText(pair: Pair): string {
  const [first, last] = [pair.lanes[0], pair.lanes.at(-1)]
  return pair.lanes.length === 1 ? `Lane ${first}` : `Lanes ${first}-${last}`
}

/** The lane a seat is on: A and B on the pair's first lane, C to E on its second (D-56). */
function seatLane(pair: Pair, letter: string): number {
  const onFirst = letter === 'A' || letter === 'B'
  // A one-lane pair has no second lane; every seat is on its first (as the page does).
  return (onFirst ? pair.lanes[0] : (pair.lanes[1] ?? pair.lanes[0])) ?? 0
}

/**
 * The move of one bowler to a pair, or off the lanes (LAN-05, LAN-06, LAN-09, LAN-13, D-10, D-56,
 * D-57, D-61, D-216). `lane` is the first lane of the target pair, or `null` to unassign. The
 * server picks the seat: the first free letter in fill order. A letter another bowler holds counts
 * as taken, even a legacy one (D-61), and a bowler in the pair keeps their own seat.
 */
export function planLaneMove(
  facts: MoveFacts,
  registrationId: string,
  lane: number | null,
): MoveOutcome {
  const noun = label(facts.kind)
  if (facts.tournamentComplete) {
    return { type: 'refused', message: 'This tournament is complete. Lanes cannot change.' }
  }
  if (facts.sessionComplete) {
    return { type: 'refused', message: `This ${noun} is complete. Lanes cannot change.` }
  }
  const mine = facts.entries.find((entry) => entry.registrationId === registrationId)
  if (!mine) return { type: 'notOnSession' }

  if (lane === null) {
    return mine.position === ''
      ? { type: 'unchanged', position: '' }
      : { type: 'move', position: '' }
  }

  if (facts.maxPerPair < MIN_SEATS || facts.maxPerPair > MAX_SEATS) {
    return {
      type: 'badSeats',
      message: `Bowlers per pair must be ${MIN_SEATS} to ${MAX_SEATS} to assign lanes`,
    }
  }
  const pair = buildPairs(facts.startingLane, facts.numberOfLanes).find(
    (candidate) => candidate.firstLane === lane,
  )
  if (!pair) {
    return {
      type: 'badLane',
      message: `Lane ${lane} is not the first lane of a pair in this ${noun}`,
    }
  }

  const stored = parsePosition(mine.position)
  if (stored && pairOf(stored.lane, [pair])) return { type: 'unchanged', position: mine.position }

  const others = facts.entries.filter((entry) => {
    // Stryker disable next-line ConditionalExpression: a bowler already in the pair returned above, so a stored position of their own never reaches the count.
    if (entry.registrationId === registrationId) return false
    const position = parsePosition(entry.position)
    return position !== undefined && pairOf(position.lane, [pair]) !== undefined
  })
  if (others.length >= facts.maxPerPair) {
    const verb = pair.lanes.length === 1 ? 'is' : 'are'
    return {
      type: 'full',
      message: `${pairText(pair)} ${verb} full (${others.length} of ${facts.maxPerPair}). Pick another pair.`,
    }
  }

  const taken = new Set(others.map((entry) => parsePosition(entry.position)?.letter))
  // `others` is below `maxPerPair`, which is at most the seat count, so a free letter exists.
  const letter = SEAT_ORDER.find((seat) => !taken.has(seat)) ?? SEAT_ORDER[0]
  return { type: 'move', position: `${seatLane(pair, letter)}${letter}` }
}
