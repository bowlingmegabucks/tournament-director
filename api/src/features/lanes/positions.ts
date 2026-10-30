/**
 * Seats on a lane pair, in the order bowlers fill them (LAN-02, D-56): the odd lane's A, the even
 * lane's C, the odd lane's B, then the even lane's D and E. C is always on the even lane.
 */
export const SEAT_ORDER = ['A', 'C', 'B', 'D', 'E'] as const

/** No pair seats more than this (D-56). */
export const MAX_SEATS = SEAT_ORDER.length

/** The lowest `maxPerPair` the lane page supports (LAN-02). */
export const MIN_SEATS = 2

export interface Position {
  lane: number
  letter: string
}

// Stored text is at most 3 characters (LAN-01): a lane of 1 to 99, then a letter.
const POSITION = /^([1-9]\d?)([A-E])$/

/** LAN-01: `15A` is lane 15, letter A. Anything else (`''`, `1F`, `0A`, `a1`) is not a position. */
export function parsePosition(text: string): Position | undefined {
  const match = POSITION.exec(text)
  if (!match) return undefined
  const [, lane, letter] = match
  // Stryker disable next-line StringLiteral: both groups always exist once the pattern matches.
  return { lane: Number(lane), letter: letter ?? '' }
}

/** LAN-04: lane number, then letter. */
export function comparePositions(a: Position, b: Position): number {
  if (a.lane !== b.lane) return a.lane - b.lane
  if (a.letter < b.letter) return -1
  return a.letter > b.letter ? 1 : 0
}

export interface Pair {
  /** The first lane of the pair. */
  firstLane: number
  lanes: number[]
}

/**
 * LAN-03: pairs run from `startingLane` over `numberOfLanes`, two lanes at a time. An odd count
 * leaves the last pair with one lane, and a count of 0 or less leaves no pairs (SQD-05 and SQD-06
 * run on save, not on read, so old rows can hold either).
 */
export function buildPairs(startingLane: number, numberOfLanes: number): Pair[] {
  const pairs: Pair[] = []
  for (let offset = 0; offset < numberOfLanes; offset += 2) {
    const firstLane = startingLane + offset
    pairs.push({
      firstLane,
      lanes: offset + 1 < numberOfLanes ? [firstLane, firstLane + 1] : [firstLane],
    })
  }
  return pairs
}

/** The pair that holds a lane, or `undefined` when the lane is outside the session. */
export function pairOf<T extends Pair>(lane: number, pairs: readonly T[]): T | undefined {
  return pairs.find((pair) => pair.lanes.includes(lane))
}
