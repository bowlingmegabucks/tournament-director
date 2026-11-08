import {
  resultsNote,
  sharedNotes,
  type FieldNote,
  type SessionEditInfo,
} from '../../shared/sessionEdit'
import type { SquadField } from './types'

/**
 * What the edit page tells the director before they type (D-180, D-185): which boxes carry a limit
 * or ask for a confirmation, and why. The API works the same out again on every save and stays the
 * authority (D-129); keep these words in step with `api/src/features/squads/updatePlan.ts`.
 * Nothing on a squad locks a box: a squad refuses an edit only when it or its tournament is
 * complete, which the page shows instead of the form.
 */
export function squadEditNotes(info: SessionEditInfo): Partial<Record<SquadField, FieldNote>> {
  const notes: Partial<Record<SquadField, FieldNote>> = sharedNotes(info)
  if (info.hasScores) {
    notes.finalsRatio = { confirm: resultsNote }
    notes.cashRatio = { confirm: resultsNote }
  }
  return notes
}
