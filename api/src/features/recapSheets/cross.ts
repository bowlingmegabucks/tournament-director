/** The step pattern the desk picks: the same step every game, or one that varies (LAN-19). */
export type SkipPattern = 'same' | 'staggered'

/** Lanes per skip step: 16 lanes or fewer skip nothing, then one more for every 8 lanes (LAN-18). */
const LANES_PER_SKIP = 8
const MAX_SKIP = 6

/**
 * LAN-18: every lane of every pair that holds at least one bowler, both lanes of the pair, in lane
 * order. The cross reads every saved assignment, so what the desk checks or unchecks for printing
 * never changes it (D-64).
 */
export function lanesInUse(
  pairs: readonly { lanes: readonly number[]; bowlers: readonly unknown[] }[],
) {
  return pairs
    .filter((pair) => pair.bowlers.length > 0)
    .flatMap((pair) => pair.lanes)
    .toSorted((a, b) => a - b)
}

/**
 * LAN-18: the skip for a number of lanes in use: up to 16 is 0, 17 to 24 is 1, and so on up to 6
 * for more than 56.
 */
export function skipFor(laneCount: number): number {
  return Math.min(MAX_SKIP, Math.max(0, Math.ceil(laneCount / LANES_PER_SKIP) - 2))
}

/** LAN-19: how far a bowler moves through the lanes in use to reach game `game` (2 or later). */
function stepTo(game: number, skip: number, pattern: SkipPattern): number {
  const regular = (skip + 1) * 2
  if (pattern === 'same') return regular
  switch ((game - 1) % 4) {
    case 2:
      return (skip + 2) * 2
    case 3:
      return Math.max(skip * 2, 2)
    default:
      return regular
  }
}

/** The other lane of the pair: an odd lane takes the one above, an even lane the one below. */
function otherLane(lane: number): number {
  return lane % 2 === 1 ? lane + 1 : lane - 1
}

/**
 * LAN-19: the lane for each game, as numbers. Game 1 is the start lane. Each later game moves
 * forward through `lanes` (the lanes in use) by the step, wrapping at the end. After the walk, the
 * even games switch to the other lane of the pair; the odd games keep the lane. A switch to a lane
 * that is not in use (the last pair of an odd lane count) keeps the lane.
 */
export function crossLanes(
  startLane: number,
  lanes: readonly number[],
  games: number,
  pattern: SkipPattern,
): number[] {
  const start = lanes.indexOf(startLane)
  if (start < 0) throw new RangeError(`Lane ${startLane} is not one of the lanes in use`)
  const skip = skipFor(lanes.length)
  const walked: number[] = []
  let index = start
  for (let game = 1; game <= games; game++) {
    if (game > 1) index = (index + stepTo(game, skip, pattern)) % lanes.length
    walked.push(lanes[index] ?? startLane)
  }
  return walked.map((lane, offset) => {
    // `offset` counts from 0, so the even games (2, 4, ...) are the odd offsets.
    const isEvenGame = offset % 2 === 1
    const other = otherLane(lane)
    return isEvenGame && lanes.includes(other) ? other : lane
  })
}
