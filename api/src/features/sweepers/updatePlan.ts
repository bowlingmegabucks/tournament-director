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
  type StoredSession,
} from '../../shared/sessionEdit.ts'
import { unknownDivisionMessage } from './createPlan.ts'
import type { FieldErrors } from './createRequest.ts'
import type { UpdateSweeper } from './updateRequest.ts'

/** The stored fields an edit can change. `bonusPins` holds the nonzero pins by division id. */
export interface StoredSweeper extends StoredSession {
  entryFee: number
  games: number
  cashRatio: number
  bonusPins: Record<string, number>
}

/** A division of the tournament, as the plan reads it. */
export interface DivisionInfo {
  id: string
  name: string
}

export interface SweeperEditContext extends SessionEditContext {
  stored: StoredSweeper
  /** Every division of the tournament: a pin for any other id is refused (D-177). */
  divisions: readonly DivisionInfo[]
}

/** The order the form lists its fields, so warnings read the same way every time. */
export const sweeperFieldOrder = [
  'date',
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'games',
  'cashRatio',
  'bonusPins',
] as const

export const gamesLockedMessage = 'Scores are saved, so the number of games cannot change.'

/** Warnings for the fields that change posted results once scores exist. */
function scoreWarnings(
  context: SweeperEditContext,
  changes: UpdateSweeper,
  pinChanges: Record<string, number>,
): EditWarning[] {
  const warnings: EditWarning[] = []
  if (changes.cashRatio !== undefined) {
    warnings.push({ field: 'cashRatio', message: resultsMessage })
  }
  for (const division of context.divisions) {
    if (pinChanges[division.id] === undefined) continue
    warnings.push({
      field: `bonusPins.${division.id}`,
      message: `${division.name}: scores are saved. Posted results change at once.`,
    })
  }
  return warnings
}

/**
 * Decide what a sweeper edit does (SQD-24, SQD-25, SQD-29, D-180 to D-182, D-184). Order: no
 * change, frozen (complete tournament or sweeper), lane block, refusals, warnings. A refusal never
 * gives way to `confirmWarnings`. A pin for a division that is not the tournament's is refused
 * even when its value would not change (D-177).
 */
export function planSweeperEdit(
  context: SweeperEditContext,
  input: UpdateSweeper,
  confirmWarnings: boolean,
): EditPlan<UpdateSweeper> {
  const { bonusPins: storedPins, ...storedFields } = context.stored
  const { bonusPins: sentPins = {}, ...sentFields } = input
  const changes: UpdateSweeper = changedFields(storedFields, sentFields)
  const pinChanges = Object.fromEntries(
    Object.entries(sentPins).filter(([id, pins]) => pins !== (storedPins[id] ?? 0)),
  )
  if (Object.keys(pinChanges).length > 0) changes.bonusPins = pinChanges
  const known = new Set(context.divisions.map((division) => division.id))
  const unknownDivision = Object.keys(sentPins).some((id) => !known.has(id))
  if (Object.keys(changes).length === 0 && !unknownDivision) return { kind: 'save', changes }

  const frozen = frozenRefusal(context, 'Sweeper')
  if (frozen) return { kind: 'refused', errors: frozen }

  const blocked = laneBlockProblem(context.stored, changes)
  if (blocked) return { kind: 'invalid', errors: blocked }

  const errors: FieldErrors = sessionRefusals(context, changes, 'Sweeper')
  if (changes.games !== undefined && context.facts.hasScores) errors['games'] = gamesLockedMessage
  if (unknownDivision) errors['bonusPins'] = unknownDivisionMessage
  if (Object.keys(errors).length > 0) return { kind: 'refused', errors }

  const warnings: EditWarning[] = sessionWarnings(context, changes)
  const fee = changes.entryFee !== undefined ? feeWarning(context) : undefined
  if (fee) warnings.push(fee)
  if (context.facts.hasScores) warnings.push(...scoreWarnings(context, changes, pinChanges))
  if (warnings.length > 0 && !confirmWarnings) {
    return { kind: 'warn', warnings: inFormOrder(warnings, sweeperFieldOrder) }
  }
  return { kind: 'save', changes }
}
