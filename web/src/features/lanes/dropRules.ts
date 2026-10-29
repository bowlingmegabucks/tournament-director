import { formatPair } from './format'
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

/** The stub for slice one (D-55). The move command replaces it after lock-down (D-52, D-57). */
export const NOT_BUILT = 'Lane assignment is not built yet. Nothing was saved.'

/**
 * What a drop, or a pick in the Assign dialog, tells the user (D-55, D-58). A full pair refuses.
 * A pair with room, or a placed bowler dropped on unassigned, would move them, which is not built:
 * the same error says so and nothing moves. A drop that changes nothing says nothing.
 */
export function dropMessage(bowler: LaneBowler, target: DropTarget): string | undefined {
  if (target === 'unassigned') return bowler.position === '' ? undefined : NOT_BUILT
  const outcome = dropOutcome(target, bowler.registrationId)
  if (outcome === 'full') {
    return `${formatPair(target)} are full (${target.bowlers.length} of ${target.capacity}). Pick another pair.`
  }
  return outcome === 'room' ? NOT_BUILT : undefined
}
