import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { LaneSetupError, SessionNotFoundError, type SessionKind } from '../../shared/session'
import type { LanePage } from './types'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isFlag = (value: unknown) => typeof value === 'boolean'

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

function isBowler(value: unknown): boolean {
  const average = field(value, 'average')
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'firstName')) &&
    isText(field(value, 'lastName')) &&
    isText(field(value, 'divisionId')) &&
    isText(field(value, 'divisionName')) &&
    (average === null || isNumber(average)) &&
    isText(field(value, 'position')) &&
    isNumber(field(value, 'pins')) &&
    isFlag(field(value, 'superSweeper'))
  )
}

function isPair(value: unknown): boolean {
  return (
    isNumber(field(value, 'firstLane')) &&
    isEvery(field(value, 'lanes'), isNumber) &&
    isNumber(field(value, 'capacity')) &&
    isEvery(field(value, 'bowlers'), isBowler)
  )
}

function isDivisionCount(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isNumber(field(value, 'number')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'entries'))
  )
}

function isSession(value: unknown): boolean {
  const kind = field(value, 'kind')
  return (
    isText(field(value, 'id')) &&
    (kind === 'squad' || kind === 'sweeper') &&
    isSessionDate(field(value, 'date')) &&
    isFlag(field(value, 'complete')) &&
    isNumber(field(value, 'startingLane')) &&
    isNumber(field(value, 'numberOfLanes')) &&
    isNumber(field(value, 'maxPerPair'))
  )
}

function isLanePage(value: unknown): value is LanePage {
  return (
    isSession(field(value, 'session')) &&
    isEvery(field(value, 'pairs'), isPair) &&
    isEvery(field(value, 'unassigned'), isBowler) &&
    isEvery(field(value, 'other'), isBowler) &&
    isEvery(field(value, 'divisions'), isDivisionCount)
  )
}

/** The lane page of one squad or sweeper: pairs, unassigned bowlers, other positions, counts (LAN-10). */
export async function fetchLanes(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<LanePage> {
  const response = await apiFetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/lanes`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load lane assignments'), 'message')
    throw new LaneSetupError(
      isText(message) ? String(message) : 'This session cannot take lane assignments',
    )
  }
  if (!response.ok) {
    throw new Error(`Failed to load lane assignments (${response.status})`)
  }
  const body = await readJson(response, 'Failed to load lane assignments')
  if (!isLanePage(body)) {
    throw new Error('Failed to load lane assignments (unexpected response)')
  }
  return body
}

/**
 * A move the API refused or could not save. The message is ready to show: for a full pair it names
 * the pair, for a complete session it says so (LAN-13, Q-28, D-216).
 */
export class LaneMoveError extends Error {
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
 * Saves a move (LAN-20, D-216): the bowler to the pair whose first lane is `lane`, or off the lanes
 * when `lane` is `null`. The API picks the seat and returns it. `409` (pair full, session or
 * tournament complete) and `404` (the bowler left the session) keep the API's message.
 */
export async function moveBowler(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  registrationId: string,
  lane: number | null,
): Promise<string> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/lanes/${registrationId}`),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lane }),
    },
  ).catch(() => {
    throw new LaneMoveError('Could not save the move. Check your connection and try again.')
  })
  if (response.status === 403) {
    throw new LaneMoveError('You are not allowed to move bowlers.', 403)
  }
  if (response.status === 404) {
    throw new LaneMoveError(
      await messageOf(response, `That bowler is no longer in this ${kind}.`),
      404,
    )
  }
  if (response.status === 409 || response.status === 400 || response.status === 422) {
    throw new LaneMoveError(await messageOf(response, 'The move was refused.'), response.status)
  }
  if (!response.ok) {
    throw new LaneMoveError('Could not save the move. Try again.', response.status)
  }
  const position = field(await readJson(response, 'Failed to save the move'), 'position')
  if (typeof position !== 'string') {
    throw new LaneMoveError('Failed to save the move (unexpected response)')
  }
  return position
}
