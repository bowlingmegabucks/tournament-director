import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { SessionNotFoundError, type SessionKind } from '../../shared/session'
import type { SquadResults, SweeperResults } from './types'

/** The results cannot be worked out as the session is set up, such as a ratio of 0 (422, D-83). */
export class ResultsUnavailableError extends Error {}

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isBoolean = (value: unknown) => typeof value === 'boolean'

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

function isDecider(value: unknown): boolean {
  const kind = field(value, 'kind')
  return kind === 'games' || (kind === 'game' && isNumber(field(value, 'rank')))
}

function isTie(value: unknown): boolean {
  const line = field(value, 'line')
  const outcome = field(value, 'outcome')
  const decidedBy = field(value, 'decidedBy')
  return (
    (line === 'cut' || line === 'cash') &&
    (outcome === 'won' || outcome === 'lost' || outcome === 'full') &&
    (decidedBy === null || isDecider(decidedBy))
  )
}

function isRankedRow(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'place')) &&
    isNumber(field(value, 'total')) &&
    isNumber(field(value, 'highGame')) &&
    isNumber(field(value, 'games')) &&
    isEvery(field(value, 'ties'), isTie)
  )
}

function isSquadRow(value: unknown): boolean {
  const group = field(value, 'group')
  return (
    isRankedRow(value) &&
    (group === 'advancer' || group === 'casher' || group === 'other') &&
    isNumber(field(value, 'handicap')) &&
    isBoolean(field(value, 'advancedEarlier'))
  )
}

function isUnplacedRow(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'total')) &&
    isNumber(field(value, 'highGame')) &&
    isNumber(field(value, 'games')) &&
    isNumber(field(value, 'handicap'))
  )
}

function isNoShow(value: unknown): boolean {
  return isText(field(value, 'registrationId')) && isText(field(value, 'name'))
}

function isDivision(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isNumber(field(value, 'number')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'entries')) &&
    isBoolean(field(value, 'showHandicap')) &&
    isBoolean(field(value, 'showGames')) &&
    isEvery(field(value, 'rows'), isSquadRow) &&
    isEvery(field(value, 'didNotFinish'), isUnplacedRow) &&
    isEvery(field(value, 'noShows'), isNoShow)
  )
}

function isSession(value: unknown, kind: SessionKind): boolean {
  return (
    isText(field(value, 'id')) &&
    field(value, 'kind') === kind &&
    isSessionDate(field(value, 'date')) &&
    isBoolean(field(value, 'complete')) &&
    isNumber(field(value, 'games'))
  )
}

function isSquadResults(value: unknown): value is SquadResults {
  return (
    isSession(field(value, 'session'), 'squad') &&
    isNumber(field(value, 'finalsRatio')) &&
    isNumber(field(value, 'cashRatio')) &&
    isEvery(field(value, 'divisions'), isDivision)
  )
}

function isSweeperRow(value: unknown): boolean {
  const group = field(value, 'group')
  return (
    isRankedRow(value) &&
    (group === 'casher' || group === 'other') &&
    isText(field(value, 'divisionName')) &&
    isNumber(field(value, 'bonusPins'))
  )
}

function isSweeperResults(value: unknown): value is SweeperResults {
  const cutScore = field(value, 'cutScore')
  return (
    isSession(field(value, 'session'), 'sweeper') &&
    isNumber(field(value, 'cashRatio')) &&
    isNumber(field(value, 'entries')) &&
    isNumber(field(value, 'cashers')) &&
    (cutScore === null || isNumber(cutScore)) &&
    isEvery(field(value, 'rows'), isSweeperRow)
  )
}

async function fetchResultsBody(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<unknown> {
  const response = await fetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/results`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load results'), 'message')
    throw new ResultsUnavailableError(
      isText(message) ? String(message) : 'The results cannot be worked out',
    )
  }
  if (!response.ok) throw new Error(`Failed to load results (${response.status})`)
  return readJson(response, 'Failed to load results')
}

/** The results of one squad, by division (RES-31). */
export async function fetchSquadResults(
  tournamentId: string,
  sessionId: string,
): Promise<SquadResults> {
  const body = await fetchResultsBody('squad', tournamentId, sessionId)
  if (!isSquadResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

/** The results of one sweeper, one list (RES-31). */
export async function fetchSweeperResults(
  tournamentId: string,
  sessionId: string,
): Promise<SweeperResults> {
  const body = await fetchResultsBody('sweeper', tournamentId, sessionId)
  if (!isSweeperResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}
