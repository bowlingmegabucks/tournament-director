import {
  resultsNote,
  sharedNotes,
  type FieldNote,
  type SessionEditInfo,
} from '../../shared/sessionEdit'
import { pinKey } from './types'

/** The reason the games box is locked once a score is saved (D-180). Same words as the API's refusal. */
export const gamesLocked = 'Scores are saved, so the number of games cannot change.'

/**
 * What the edit page tells the director before they type (D-180, D-185): which boxes lock, carry a
 * limit, or ask for a confirmation, and why. Keys are the box names, and `bonusPins.<divisionId>`
 * for a pin box. The API works the same out again on every save and stays the authority (D-129);
 * keep these words in step with `api/src/features/sweepers/updatePlan.ts`.
 */
export function sweeperEditNotes(
  info: SessionEditInfo,
  divisionIds: readonly string[],
): Record<string, FieldNote> {
  const notes = sharedNotes(info)
  if (info.hasScores) {
    notes['games'] = { lock: gamesLocked }
    notes['cashRatio'] = { confirm: resultsNote }
    for (const id of divisionIds) notes[pinKey(id)] = { confirm: resultsNote }
  }
  return notes
}
