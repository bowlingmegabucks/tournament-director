import { formatPair } from './format'
import { planMove, type Move } from './tempMoves'
import type { LaneBowler, LanePair } from './types'

/**
 * What a bowler dropped on a pair would do (D-56, D-58): `same` when they already sit in it,
 * `full` when it holds `capacity` bowlers (a legacy pair over its limit counts as full), else `room`.
 * The cue colors, the drop, and the Assign dialog all ask this one question.
 */
export type DropOutcome = 'same' | 'full' | 'room'

export function dropOutcome(pair: LanePair, registrationId: string): DropOutcome {
  if (pair.bowlers.some((bowler) => bowler.registrationId === registrationId)) return 'same'
  return pair.bowlers.length >= pair.capacity ? 'full' : 'room'
}

/** Seats left on a pair. Never below 0, even for a legacy pair over its limit. */
export function seatsLeft(pair: LanePair): number {
  return Math.max(0, pair.capacity - pair.bowlers.length)
}

/** The drop zone id of a pair. The page reads it back to find the pair (D-58). */
export const pairDropId = (pair: Pick<LanePair, 'firstLane'>) => `pair-${pair.firstLane}`

/** The drop zone id of the unassigned list: dropping a placed bowler here clears their lane (D-57). */
export const unassignedDropId = 'unassigned'

/** Where a bowler can go: a pair, or back to unassigned (D-57). */
export type DropTarget = LanePair | 'unassigned'

/**
 * The notice that goes with every move until the move command exists (D-55). The move shows on
 * this screen only.
 */
export const NOT_SAVED =
  'No save is configured yet. This move shows on this screen only and is lost on refresh.'

/** What a drop, or a pick in the Assign dialog, does (D-55, D-58). */
export type DropDecision =
  { type: 'none' } | { type: 'refuse'; message: string } | { type: 'move'; move: Move }

/**
 * A full pair refuses (D-56). A pair with room, or the unassigned list for a bowler who has a
 * lane, moves the bowler on screen (the seat is worked out in `tempMoves`). A drop that changes
 * nothing does nothing.
 */
export function decideDrop(bowler: LaneBowler, target: DropTarget): DropDecision {
  if (target === 'unassigned') {
    return bowler.position === ''
      ? { type: 'none' }
      : { type: 'move', move: planMove(bowler, target) }
  }
  const outcome = dropOutcome(target, bowler.registrationId)
  if (outcome === 'full') {
    return {
      type: 'refuse',
      message: `${formatPair(target)} are full (${target.bowlers.length} of ${target.capacity}). Pick another pair.`,
    }
  }
  return outcome === 'room' ? { type: 'move', move: planMove(bowler, target) } : { type: 'none' }
}
