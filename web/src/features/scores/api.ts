import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { SessionNotFoundError, type SessionKind } from '../../shared/session'
import type { ScoreBowler, ScorePage } from './types'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

function isBowler(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName')) &&
    isText(field(value, 'position')) &&
    isEvery(field(value, 'scores'), (score) => score === null || isNumber(score)) &&
    isNumber(field(value, 'total'))
  )
}

function isPair(value: unknown): boolean {
  return (
    isNumber(field(value, 'firstLane')) &&
    isEvery(field(value, 'lanes'), isNumber) &&
    isEvery(field(value, 'bowlers'), isBowler)
  )
}

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

/** Every bowler has a score slot for each game of the session, as the API builds them (D-69). */
function hasGameSlots(page: ScorePage): boolean {
  const hasSlots = (bowler: ScoreBowler) => bowler.scores.length >= page.session.games
  return page.other.every(hasSlots) && page.pairs.every((pair) => pair.bowlers.every(hasSlots))
}

function isScorePage(value: unknown): value is ScorePage {
  return (
    isSession(field(value, 'session')) &&
    isEvery(field(value, 'pairs'), isPair) &&
    isNumber(field(value, 'noLane')) &&
    isEvery(field(value, 'other'), isBowler)
  )
}

/** The scores of one squad or sweeper, grouped by lane pair (SCR-16). */
export async function fetchScores(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<ScorePage> {
  const response = await fetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/scores`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (!response.ok) throw new Error(`Failed to load scores (${response.status})`)
  const body = await readJson(response, 'Failed to load scores')
  if (!isScorePage(body) || !hasGameSlots(body)) {
    throw new Error('Failed to load scores (unexpected response)')
  }
  return body
}
