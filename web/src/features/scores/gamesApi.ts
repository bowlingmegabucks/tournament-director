import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { LaneSetupError, SessionNotFoundError, type SessionKind } from '../../shared/session'
import { isSkipPattern } from '../skip/api'
import type { Game, GameBowler, GamePair, GamesView, ScoreSaveResult } from './gamesTypes'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isScore = (value: unknown) => value === null || isNumber(value)

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

const isBowler = (value: unknown): value is GameBowler =>
  isText(field(value, 'registrationId')) &&
  isText(field(value, 'name')) &&
  isText(field(value, 'divisionName')) &&
  isText(field(value, 'lane')) &&
  isScore(field(value, 'score')) &&
  isEvery(field(value, 'scores'), isScore) &&
  isNumber(field(value, 'total'))

const isPair = (value: unknown): value is GamePair =>
  isNumber(field(value, 'firstLane')) &&
  isEvery(field(value, 'lanes'), isNumber) &&
  isEvery(field(value, 'bowlers'), isBowler)

const isGame = (value: unknown): value is Game =>
  isNumber(field(value, 'game')) &&
  isNumber(field(value, 'entered')) &&
  isNumber(field(value, 'total')) &&
  isEvery(field(value, 'pairs'), isPair)

function isSession(value: unknown): boolean {
  const kind = field(value, 'kind')
  return (
    isText(field(value, 'id')) &&
    (kind === 'squad' || kind === 'sweeper') &&
    isSessionDate(field(value, 'date')) &&
    typeof field(value, 'complete') === 'boolean' &&
    isNumber(field(value, 'games'))
  )
}

function isGamesView(value: unknown): value is GamesView {
  const skip = field(value, 'skip')
  return (
    isSession(field(value, 'session')) &&
    isSkipPattern(skip) &&
    isEvery(field(value, 'games'), isGame) &&
    isNumber(field(value, 'withoutLane'))
  )
}

/** The bowlers of one squad or sweeper by the lane they bowl each game, for score entry (SCR-22, D-234). */
export async function fetchGames(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<GamesView> {
  const response = await apiFetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/scores/games`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load the games'), 'message')
    throw new LaneSetupError(
      isText(message) ? String(message) : 'This session cannot take lane assignments',
    )
  }
  if (response.status === 403) throw new Error('You are not allowed to enter scores.')
  if (!response.ok) throw new Error(`Failed to load the games (${response.status})`)
  const body = await readJson(response, 'Failed to load the games')
  if (!isGamesView(body)) throw new Error('Failed to load the games (unexpected response)')
  return body
}

/** A score that could not be saved or cleared. `message` says why, in words the sheet can show (SCR-15). */
export class ScoreSaveError extends Error {
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
 * Saves one score, or clears it when `score` is `null` (SCR-19, D-228). The API answers the
 * bowler's scores after the write, with any earlier games it filled with 0 (D-229). `400`, `404`,
 * and `409` keep the API's message; a lost connection says so.
 */
export async function saveScore(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  registrationId: string,
  game: number,
  score: number | null,
): Promise<ScoreSaveResult> {
  const url = apiUrl(
    `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/scores/${encodeURIComponent(registrationId)}/${game}`,
  )
  const response = await apiFetch(
    url,
    score === null
      ? { method: 'DELETE' }
      : {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ score }),
        },
  ).catch(() => {
    throw new ScoreSaveError('Could not save. Check the connection.')
  })
  if (response.status === 401 || response.status === 403) {
    throw new ScoreSaveError('You are not allowed to enter scores.', response.status)
  }
  if (response.status === 404) {
    throw new ScoreSaveError(await messageOf(response, 'That score is no longer there.'), 404)
  }
  if (response.status === 409 || response.status === 400) {
    throw new ScoreSaveError(await messageOf(response, 'The score was refused.'), response.status)
  }
  if (!response.ok) throw new ScoreSaveError('Could not save. Try again.', response.status)
  const body: unknown = await response.json().catch(() => undefined)
  const scores = field(body, 'scores')
  const total = field(body, 'total')
  if (!isEvery(scores, isScore) || !isNumber(total)) {
    throw new ScoreSaveError('Could not save (unexpected response).', response.status)
  }
  return { scores: scores as (number | null)[], total: total as number }
}
