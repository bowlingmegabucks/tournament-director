import type { FieldNotes } from './TournamentForm'
import type { EditInfo, TournamentField, TournamentSettingsView } from './types'

export const completedLock = 'This tournament is complete. Nothing can change.'

const allFields: readonly TournamentField[] = [
  'name',
  'startDate',
  'endDate',
  'bowlingCenter',
  'entryFee',
  'games',
  'finalsRatio',
  'cashRatio',
  'superSweeperCashRatio',
]

const bowlers = (count: number) =>
  count === 1 ? '1 bowler is registered.' : `${count} bowlers are registered.`

/**
 * What the edit page tells the director before they type (TRN-29): which fields are locked and
 * why (D-128, D-130), and which ask for a confirmation. The API works the same out again on every
 * save and stays the authority (D-129); keep these words in step with `editPlan.ts` there.
 */
export function editNotes(
  settings: TournamentSettingsView,
  info: EditInfo,
): { locks: FieldNotes; confirms: FieldNotes } {
  if (settings.completed) {
    return {
      locks: Object.fromEntries(allFields.map((name) => [name, completedLock])),
      confirms: {},
    }
  }
  const locks: FieldNotes = {}
  const confirms: FieldNotes = {}
  if (info.hasScores) {
    locks.games = 'Scores are saved, so the number of games cannot change.'
    locks.startDate = 'Scores are saved, so the start date cannot change.'
    confirms.finalsRatio = 'Scores are saved. Posted results change at once.'
    confirms.cashRatio = 'Scores are saved. Posted results change at once.'
  }
  if (info.hasSweeperScores) {
    confirms.superSweeperCashRatio = 'Sweeper scores are saved. Posted results change at once.'
  }
  if (info.registrationCount > 0) {
    const registered = bowlers(info.registrationCount)
    if (locks.startDate === undefined) {
      confirms.startDate = `${registered} Ages are measured on this date; some may no longer fit their division.`
    }
    confirms.entryFee = `${registered} They keep what they paid. New entries pay the new fee.`
  }
  return { locks, confirms }
}
