import { apiFetch } from './apiFetch'
import { apiUrl } from './apiUrl'
import { field } from './field'
import { readJson } from './readJson'
import type { SessionEditInfo, SessionWarning } from './sessionEdit'
import { TournamentNotFoundError } from './tournamentQuery'

export type SessionKind = 'squads' | 'sweepers'

export const word = (kind: SessionKind) => (kind === 'squads' ? 'squad' : 'sweeper')

/**
 * The API refused the edit (400 or 409). `errors` holds one message per key (a field name, or
 * `bonusPins.<divisionId>`). `tournament` and `session` hold a reason that is not about a field:
 * the tournament or the session is complete (D-181).
 */
export class SessionRejectedError extends Error {
  readonly errors: Record<string, string>
  readonly tournament: string | undefined
  readonly session: string | undefined

  constructor(
    message: string,
    errors: Record<string, string>,
    tournament?: string,
    session?: string,
  ) {
    super(message)
    this.errors = errors
    this.tournament = tournament
    this.session = session
  }
}

/** The API allows the edit but wants it confirmed first; nothing was saved (D-129, D-180). */
export class SessionWarningsError extends Error {
  readonly warnings: SessionWarning[]

  constructor(message: string, warnings: SessionWarning[]) {
    super(message)
    this.warnings = warnings
  }
}

function warningsOf(value: unknown): SessionWarning[] | undefined {
  if (!Array.isArray(value)) return undefined
  const warnings: SessionWarning[] = []
  for (const item of value as unknown[]) {
    const name = field(item, 'field')
    const message = field(item, 'message')
    if (typeof name !== 'string' || typeof message !== 'string') return undefined
    warnings.push({ field: name, message })
  }
  return warnings
}

function stringsOf(value: unknown): Record<string, string> {
  const errors: Record<string, string> = {}
  if (typeof value !== 'object' || value === null) return errors
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === 'string') errors[key] = message
  }
  return errors
}

async function rejection(response: Response, kind: SessionKind): Promise<Error> {
  const body = await readJson(response, `Failed to save the ${word(kind)}`)
  const message = field(body, 'message')
  const text = typeof message === 'string' ? message : `The ${word(kind)} was not accepted.`
  const warnings = warningsOf(field(body, 'warnings'))
  if (warnings !== undefined && warnings.length > 0) return new SessionWarningsError(text, warnings)
  const errors = field(body, 'errors')
  const tournament = field(errors, 'tournament')
  const session = field(errors, 'session')
  return new SessionRejectedError(
    text,
    stringsOf(errors),
    typeof tournament === 'string' ? tournament : undefined,
    typeof session === 'string' ? session : undefined,
  )
}

export const sessionUrl = (kind: SessionKind, tournamentId: string, sessionId: string) =>
  apiUrl(
    `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}/${encodeURIComponent(sessionId)}`,
  )

/**
 * Change a squad or sweeper (SQD-23, D-184): send only the fields that changed. Returns the saved
 * session, as the API sent it, for the caller to check. Throws `SessionRejectedError` for a bad
 * field or a refusal (400, 409 with `errors`) and `SessionWarningsError` when the director must
 * confirm (409 with `warnings`).
 */
export async function patchSession(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  changes: object,
  confirmWarnings = false,
): Promise<unknown> {
  const response = await apiFetch(sessionUrl(kind, tournamentId, sessionId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(confirmWarnings ? { ...changes, confirmWarnings: true } : changes),
  })
  if (response.status === 400 || response.status === 409) throw await rejection(response, kind)
  if (response.status === 404) {
    throw new Error(`This ${word(kind)} was not found. It may have been removed.`)
  }
  if (response.status === 401) throw new Error(`Sign in to edit a ${word(kind)}.`)
  if (response.status === 403) {
    throw new Error(`You do not have permission to edit a ${word(kind)}.`)
  }
  if (!response.ok) throw new Error(`Failed to save the ${word(kind)} (${response.status})`)
  return field(await readJson(response, `Failed to save the ${word(kind)}`), word(kind))
}

const countOrNull = (value: unknown) =>
  value === null || typeof value === 'number' ? (value as number | null) : undefined

/** What depends on one squad or sweeper, for the edit page (SQD-26, D-185). */
export async function fetchSessionEditInfo(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<SessionEditInfo> {
  const response = await apiFetch(`${sessionUrl(kind, tournamentId, sessionId)}/edit-info`)
  // The API answers 404 for an unknown tournament and for an unknown session alike.
  if (response.status === 404) {
    throw new TournamentNotFoundError()
  }
  if (!response.ok) throw new Error(`Failed to load the ${word(kind)} (${response.status})`)
  const info = field(await readJson(response, `Failed to load the ${word(kind)}`), 'editInfo')
  const entryCount = field(info, 'entryCount')
  const assignmentCount = field(info, 'assignmentCount')
  const hasScores = field(info, 'hasScores')
  const lowestAssignedLane = countOrNull(field(info, 'lowestAssignedLane'))
  const highestAssignedLane = countOrNull(field(info, 'highestAssignedLane'))
  const fullestPair = countOrNull(field(info, 'fullestPair'))
  if (
    typeof entryCount !== 'number' ||
    typeof assignmentCount !== 'number' ||
    typeof hasScores !== 'boolean' ||
    lowestAssignedLane === undefined ||
    highestAssignedLane === undefined ||
    fullestPair === undefined
  ) {
    throw new TypeError(`Failed to load the ${word(kind)} (unexpected response)`)
  }
  return {
    entryCount,
    assignmentCount,
    hasScores,
    lowestAssignedLane,
    highestAssignedLane,
    fullestPair,
  }
}
