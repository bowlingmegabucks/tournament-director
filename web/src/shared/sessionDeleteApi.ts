import { reasonsFor } from './refusalReasons'
import { apiFetch } from './apiFetch'
import { field } from './field'
import { readJson } from './readJson'
import { sessionUrl, word, type SessionKind } from './sessionEditApi'

/** What the delete dialog says before the director presses Delete (SQD-14, D-188). */
export interface SessionDeleteInfo {
  entryCount: number
  scoreCount: number
}

/**
 * The API refused the delete (409): the tournament or the session is complete, bowlers are entered,
 * or scores are saved (D-186). `reasons` holds every reason, the tournament's first. Nothing was
 * deleted and confirming cannot change that.
 */
export class SessionDeleteRefusedError extends Error {
  readonly reasons: string[]

  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

/**
 * Delete a squad or sweeper (SQD-14, D-186). Throws `SessionDeleteRefusedError` for a 409.
 */
export async function deleteSession(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<void> {
  const response = await apiFetch(sessionUrl(kind, tournamentId, sessionId), { method: 'DELETE' })
  if (response.status === 409) {
    const body = await readJson(response, `Failed to delete the ${word(kind)}`)
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : `The ${word(kind)} cannot be deleted.`
    throw new SessionDeleteRefusedError(
      text,
      reasonsFor(field(body, 'errors'), ['tournament', 'session', 'entries', 'scores'], text),
    )
  }
  if (response.status === 404) {
    throw new Error(`This ${word(kind)} was not found. It may have been removed.`)
  }
  if (response.status === 401) throw new Error(`Sign in to delete a ${word(kind)}.`)
  if (response.status === 403) {
    throw new Error(`You do not have permission to delete a ${word(kind)}.`)
  }
  if (!response.ok) throw new Error(`Failed to delete the ${word(kind)} (${response.status})`)
}

/** What the delete dialog says before the director presses Delete (D-188). */
export async function fetchSessionDeleteInfo(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<SessionDeleteInfo> {
  const response = await apiFetch(`${sessionUrl(kind, tournamentId, sessionId)}/delete-info`)
  // The API answers 404 for an unknown tournament and for an unknown session alike.
  if (response.status === 404) {
    throw new Error(`This ${word(kind)} was not found. It may have been removed.`)
  }
  if (!response.ok) throw new Error(`Failed to load the ${word(kind)} (${response.status})`)
  const info = field(await readJson(response, `Failed to load the ${word(kind)}`), 'deleteInfo')
  const entryCount = field(info, 'entryCount')
  const scoreCount = field(info, 'scoreCount')
  if (typeof entryCount !== 'number' || typeof scoreCount !== 'number') {
    throw new TypeError(`Failed to load the ${word(kind)} (unexpected response)`)
  }
  return { entryCount, scoreCount }
}
