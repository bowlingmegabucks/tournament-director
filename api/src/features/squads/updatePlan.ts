import {
  changedFields,
  feeWarning,
  frozenRefusal,
  inFormOrder,
  laneBlockProblem,
  resultsMessage,
  sessionRefusals,
  sessionWarnings,
  type EditPlan,
  type EditWarning,
  type SessionEditContext,
} from '../../shared/sessionEdit.ts'
import type { NewSquad } from './createRequest.ts'
import type { UpdateSquad } from './updateRequest.ts'

/** The stored fields an edit can change. A `null` fee or ratio means the squad uses the tournament's (D-183). */
export type StoredSquad = NewSquad

export interface SquadEditContext extends SessionEditContext {
  stored: StoredSquad
}

/** The order the form lists its fields, so warnings read the same way every time. */
export const squadFieldOrder = [
  'date',
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'finalsRatio',
  'cashRatio',
] as const

/**
 * Decide what a squad edit does (SQD-24, SQD-25, D-180 to D-182). Order: no change, lane block,
 * frozen (complete tournament or squad), refusals, warnings. A refusal never gives way to
 * `confirmWarnings`.
 */
export function planSquadEdit(
  context: SquadEditContext,
  input: UpdateSquad,
  confirmWarnings: boolean,
): EditPlan<UpdateSquad> {
  const changes = changedFields(context.stored, input)
  if (Object.keys(changes).length === 0) return { kind: 'save', changes }

  const frozen = frozenRefusal(context, 'Squad')
  if (frozen) return { kind: 'refused', errors: frozen }

  const blocked = laneBlockProblem(context.stored, changes)
  if (blocked) return { kind: 'invalid', errors: blocked }

  const errors = sessionRefusals(context, changes, 'Squad')
  if (Object.keys(errors).length > 0) return { kind: 'refused', errors }

  const warnings: EditWarning[] = sessionWarnings(context, changes)
  const fee = changes.entryFee !== undefined ? feeWarning(context) : undefined
  if (fee) warnings.push(fee)
  for (const field of ['finalsRatio', 'cashRatio'] as const) {
    if (changes[field] !== undefined && context.facts.hasScores) {
      warnings.push({ field, message: resultsMessage })
    }
  }
  if (warnings.length > 0 && !confirmWarnings) {
    return { kind: 'warn', warnings: inFormOrder(warnings, squadFieldOrder) }
  }
  return { kind: 'save', changes }
}
