import { validation, type Failure } from './problem.ts'
import type { RegistrationWriter } from './writer.ts'

/** `notFound` is a 404 (API-12); `refused` is a 400. */
export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'notFound' }
  | { ok: false; reason: 'refused'; failures: Failure[] }

/**
 * API-08, REG-19: delete a registration with its squad links and payments. The bowler stays. Refused
 * once the bowler has any score in the tournament. A complete squad needs no check of its own:
 * completing writes a score for every entry, so a registration on one has scores (D-10).
 */
export async function deleteRegistration(
  writer: RegistrationWriter,
  registrationId: string,
): Promise<DeleteResult> {
  const stored = await writer.getDetail(registrationId)
  if (!stored) return { ok: false, reason: 'notFound' }

  const scoredIds = await writer.findScoredSessionIds(stored.bowlerId)
  const scored = await writer.findSessions(scoredIds)
  if (scored.some((session) => session.tournamentId === stored.tournamentId)) {
    return {
      ok: false,
      reason: 'refused',
      failures: [validation('Registration.HasScores', 'Cannot delete registration with scores.')],
    }
  }
  await writer.deleteRegistration(registrationId)
  return { ok: true }
}
