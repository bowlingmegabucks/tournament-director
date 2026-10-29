// TEMPORARY (D-55, D-57): until the move command exists, a drop changes only what this screen
// shows. The seat letter is worked out here. Slice two moves this to the API, which picks the seat
// and sends back the position; delete this file then.
import type { LaneBowler, LanePage, LanePair } from './types'

/** The order seats fill (D-56). The API's `SEAT_ORDER` is the real one. */
const SEAT_ORDER = ['A', 'C', 'B', 'D', 'E'] as const

/** Where a bowler now sits on this screen: a pair (by its first lane) with a position, or unassigned. */
export interface Move {
  /** `null` for the unassigned list. */
  firstLane: number | null
  /** `''` for unassigned, else `<lane><letter>`. */
  position: string
}

const letterOf = (position: string) => position.slice(-1)

/** Seats A and B are on the pair's first lane; C, D, and E on its second (D-56). */
function seatLane(pair: Pick<LanePair, 'lanes'>, letter: string): number {
  const onFirst = letter === 'A' || letter === 'B'
  return (onFirst ? pair.lanes[0] : (pair.lanes[1] ?? pair.lanes[0])) ?? 0
}

/**
 * The move for a bowler dropped on a pair with room, or on the unassigned list (D-57). The seat is
 * the first free letter in fill order; a legacy letter in the pair counts as taken. A bowler who is
 * already in the pair does not take a seat from themselves.
 */
export function planMove(bowler: LaneBowler, target: LanePair | 'unassigned'): Move {
  if (target === 'unassigned') return { firstLane: null, position: '' }
  const taken = new Set(
    target.bowlers
      .filter((other) => other.registrationId !== bowler.registrationId)
      .map((other) => letterOf(other.position)),
  )
  const letter = SEAT_ORDER.find((seat) => !taken.has(seat)) ?? SEAT_ORDER[0]
  return { firstLane: target.firstLane, position: `${seatLane(target, letter)}${letter}` }
}

// Lane, then letter (LAN-04). Positions here are `<lane><letter>`; anything else sorts by its text.
function comparePositions(a: LaneBowler, b: LaneBowler): number {
  const lane = (bowler: LaneBowler) => Number.parseInt(bowler.position, 10)
  return lane(a) - lane(b) || letterOf(a.position).localeCompare(letterOf(b.position))
}

/**
 * The page with the moves made on this screen applied: each moved bowler leaves where they were
 * and lands in their new pair, or at the end of the unassigned list. Computed during render from
 * the API's page, never copied into state.
 */
export function applyMoves(page: LanePage, moves: ReadonlyMap<string, Move>): LanePage {
  if (moves.size === 0) return page
  const moved = (bowler: LaneBowler) => moves.has(bowler.registrationId)
  const placed = (bowler: LaneBowler): LaneBowler => {
    const move = moves.get(bowler.registrationId)
    return move ? { ...bowler, position: move.position } : bowler
  }
  const everyone = [
    ...page.pairs.flatMap((pair) => pair.bowlers),
    ...page.unassigned,
    ...page.other,
  ]
  const arrivals = everyone.filter(moved).map(placed)

  const pairs = page.pairs.map((pair) => ({
    ...pair,
    bowlers: [
      ...pair.bowlers.filter((bowler) => !moved(bowler)),
      ...arrivals.filter(
        (bowler) => moves.get(bowler.registrationId)?.firstLane === pair.firstLane,
      ),
    ].sort(comparePositions),
  }))
  return {
    ...page,
    pairs,
    unassigned: [
      ...page.unassigned.filter((bowler) => !moved(bowler)),
      ...arrivals.filter((bowler) => moves.get(bowler.registrationId)?.firstLane === null),
    ],
    other: page.other.filter((bowler) => !moved(bowler)),
  }
}
