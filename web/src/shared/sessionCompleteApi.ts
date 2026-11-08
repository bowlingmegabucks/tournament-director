import { apiFetch } from './apiFetch'
import { field } from './field'
import { readJson } from './readJson'
import { sessionUrl, word, type SessionKind } from './sessionEditApi'

/**
 * What the complete dialog says before the director presses Complete (SQD-15, SQD-16, D-194). A
 * squad sends all four; a sweeper fills nothing in, so it sends `entryCount` only.
 */
export interface SessionCompleteInfo {
  entryCount: number
  /** Squad only: entered bowlers with no scores. Each gets 0 for every game. */
  noScoreCount?: number
  /** Squad only: entered bowlers with some games but fewer than `games`. They stay as entered. */
  partialCount?: number
  /** Squad only: games each bowler bowls. */
  games?: number
}

/**
 * The API refused the complete (409): the tournament is complete or the session already is
 * (D-192). `reasons` holds every reason, the tournament's first. Nothing changed and trying again
 * cannot help.
 */
export class SessionCompleteRefusedError extends Error {
  readonly reasons: string[]

  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

function reasonsOf(errors: unknown, fallback: string): string[] {
  const reasons = ['tournament', 'session']
    .map((key) => field(errors, key))
    .filter((reason): reason is string => typeof reason === 'string')
  return reasons.length > 0 ? reasons : [fallback]
}

/**
 * Complete a squad or sweeper (SQD-15, SQD-16). Resolves with how many bowlers got zeros (always 0
 * for a sweeper). Throws `SessionCompleteRefusedError` for a 409.
 */
export async function completeSession(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<{ noShowCount: number }> {
  const response = await apiFetch(`${sessionUrl(kind, tournamentId, sessionId)}/complete`, {
    method: 'POST',
  })
  if (response.status === 409) {
    const body = await readJson(response, `Failed to complete the ${word(kind)}`)
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : `The ${word(kind)} cannot be completed.`
    throw new SessionCompleteRefusedError(text, reasonsOf(field(body, 'errors'), text))
  }
  if (response.status === 404) {
    throw new Error(`This ${word(kind)} was not found. It may have been removed.`)
  }
  if (response.status === 401) throw new Error(`Sign in to complete a ${word(kind)}.`)
  if (response.status === 403) {
    throw new Error(`You do not have permission to complete a ${word(kind)}.`)
  }
  if (!response.ok) throw new Error(`Failed to complete the ${word(kind)} (${response.status})`)
  const body = await readJson(response, `Failed to complete the ${word(kind)}`)
  const noShowCount = field(body, 'noShowCount')
  return { noShowCount: typeof noShowCount === 'number' ? noShowCount : 0 }
}

/** What the complete dialog says before the director presses Complete (D-194). */
export async function fetchSessionCompleteInfo(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<SessionCompleteInfo> {
  const response = await apiFetch(`${sessionUrl(kind, tournamentId, sessionId)}/complete-info`)
  // The API answers 404 for an unknown tournament and for an unknown session alike.
  if (response.status === 404) {
    throw new Error(`This ${word(kind)} was not found. It may have been removed.`)
  }
  if (!response.ok) throw new Error(`Failed to load the ${word(kind)} (${response.status})`)
  const info = field(await readJson(response, `Failed to load the ${word(kind)}`), 'completeInfo')
  const entryCount = field(info, 'entryCount')
  if (typeof entryCount !== 'number') {
    throw new TypeError(`Failed to load the ${word(kind)} (unexpected response)`)
  }
  if (kind === 'sweepers') return { entryCount }
  const noScoreCount = field(info, 'noScoreCount')
  const partialCount = field(info, 'partialCount')
  const games = field(info, 'games')
  if (
    typeof noScoreCount !== 'number' ||
    typeof partialCount !== 'number' ||
    typeof games !== 'number'
  ) {
    throw new TypeError(`Failed to load the ${word(kind)} (unexpected response)`)
  }
  return { entryCount, noScoreCount, partialCount, games }
}
