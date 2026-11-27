import { pairText } from './movePlan.ts'
import { buildPairs, pairOf, parsePosition } from './positions.ts'

/** What taking a pair out of play, or bringing it back, reads inside its transaction. */
export interface PairFacts {
  kind: 'squad' | 'sweeper'
  tournamentComplete: boolean
  sessionComplete: boolean
  startingLane: number
  numberOfLanes: number
  outOfPlay: readonly number[]
  /** Every entry of the session with its stored position (`''` when none). */
  entries: readonly { registrationId: string; position: string }[]
}

export interface PairRequest {
  /** The first lane of the pair. */
  lane: number
  inPlay: boolean
  /** The caller has agreed that the pair's bowlers go to unassigned (OOP-04). */
  confirmWarnings: boolean
  /** The registrations the caller was shown. Anyone else on the pair means ask again (OOP-04). */
  seen?: readonly string[] | undefined
}

export type PairOutcome =
  /** A complete tournament or session: 409 (OOP-06). */
  | { type: 'refused'; message: string }
  /** The lane is not the first lane of a pair of this session: 400. */
  | { type: 'badLane'; message: string }
  /** Bowlers are on the pair and the caller has not agreed yet: 409 with `warnings` (OOP-04). */
  | { type: 'confirm'; message: string }
  /** The pair is already as asked: nothing to write. */
  | { type: 'unchanged' }
  /** Write the pair's new state, and take these bowlers off their lanes (OOP-03). */
  | { type: 'save'; unassign: string[] }

/**
 * Takes one lane pair out of play, or brings it back (OOP-03 to OOP-06). Bringing it back moves no
 * one: the bowlers who left stay unassigned (OOP-05). A seat count the page cannot show does not
 * matter here, as nobody takes a seat.
 */
export function planPairChange(facts: PairFacts, request: PairRequest): PairOutcome {
  const noun = facts.kind
  if (facts.tournamentComplete) {
    return { type: 'refused', message: 'This tournament is complete. Lanes cannot change.' }
  }
  if (facts.sessionComplete) {
    return { type: 'refused', message: `This ${noun} is complete. Lanes cannot change.` }
  }
  const pair = buildPairs(facts.startingLane, facts.numberOfLanes).find(
    (candidate) => candidate.firstLane === request.lane,
  )
  if (!pair) {
    return {
      type: 'badLane',
      message: `Lane ${request.lane} is not the first lane of a pair in this ${noun}`,
    }
  }
  if (facts.outOfPlay.includes(pair.firstLane) !== request.inPlay) return { type: 'unchanged' }
  if (request.inPlay) return { type: 'save', unassign: [] }

  const unassign = facts.entries
    .filter((entry) => {
      const position = parsePosition(entry.position)
      return position !== undefined && pairOf(position.lane, [pair]) !== undefined
    })
    .map((entry) => entry.registrationId)
  const { seen } = request
  const unseen = seen !== undefined && unassign.some((id) => !seen.includes(id))
  if (unassign.length > 0 && (!request.confirmWarnings || unseen)) {
    const who = unassign.length === 1 ? '1 bowler' : `${unassign.length} bowlers`
    return {
      type: 'confirm',
      message: `${who} on ${pairText(pair).toLowerCase()} will move to unassigned.`,
    }
  }
  return { type: 'save', unassign }
}
