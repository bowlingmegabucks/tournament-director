import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import type { SessionKind } from '../../shared/session'

/** The step pattern of a squad or sweeper (LAN-19). The API's `features/skip/store.ts` has the same values. */
export type SkipPattern = 'staggered' | 'same'

/** A skip that could not be saved. `message` says why, in words the page can show (SCR-23). */
export class SkipError extends Error {
  /** The status that came back, or `undefined` when the request never got an answer. */
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined)
  const message = field(body, 'message')
  return typeof message === 'string' && message !== '' ? message : fallback
}

/**
 * Saves the skip of a squad or sweeper (SCR-23, D-235). Recap sheets and score entry share it, so a
 * printed sheet and the entry screen give the same lanes. `409` (complete) keeps the API's message.
 */
export async function saveSkip(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  skip: SkipPattern,
): Promise<SkipPattern> {
  const response = await apiFetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/skip`,
    ),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skip }),
    },
  ).catch(() => {
    throw new SkipError('Could not save the skip. Check your connection and try again.')
  })
  if (response.status === 403) throw new SkipError('You are not allowed to change the skip.', 403)
  if (response.status === 409) {
    throw new SkipError(await messageOf(response, 'The skip cannot change now.'), 409)
  }
  if (!response.ok) throw new SkipError('Could not save the skip. Try again.', response.status)
  const body: unknown = await response.json().catch(() => undefined)
  const saved = field(body, 'skip')
  if (saved !== 'staggered' && saved !== 'same') {
    throw new SkipError('Could not save the skip (unexpected response).', response.status)
  }
  return saved
}
