import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { SessionNotFoundError, type SessionKind } from '../../shared/session'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type {
  AtLargeResults,
  FinalsKind,
  SeedingResults,
  LiveResults,
  RankMode,
  SquadResults,
  SuperSweeperResults,
  SweeperResults,
} from './types'

/** The results cannot be worked out as the session is set up, such as a ratio of 0 (422, D-83). */
export class ResultsUnavailableError extends Error {}

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isBoolean = (value: unknown) => typeof value === 'boolean'
/** A games count, or `null` when every game counts (live mode, D-239). */
const isCount = (value: unknown) => value === null || isNumber(value)
const isMode = (value: unknown) => value === 'full-game' || value === 'live'

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

/** The games of a row by game number: a score, or `null` for a game with none saved. */
const isGameScores = (value: unknown) =>
  isEvery(value, (score) => score === null || isNumber(score))

function isRankedRow(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'place')) &&
    isNumber(field(value, 'total')) &&
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
    isGameScores(field(value, 'scores')) &&
    isBoolean(field(value, 'advancedEarlier')) &&
    isBoolean(field(value, 'dnf'))
  )
}

function isUnplacedRow(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'total')) &&
    isNumber(field(value, 'games')) &&
    isNumber(field(value, 'handicap')) &&
    isGameScores(field(value, 'scores'))
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
    isCount(field(value, 'throughGame')) &&
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
    isMode(field(value, 'mode')) &&
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
    isNumber(field(value, 'bonusPins')) &&
    isGameScores(field(value, 'scores')) &&
    isBoolean(field(value, 'dnf'))
  )
}

function isSweeperResults(value: unknown): value is SweeperResults {
  const cutScore = field(value, 'cutScore')
  return (
    isSession(field(value, 'session'), 'sweeper') &&
    isMode(field(value, 'mode')) &&
    isCount(field(value, 'throughGame')) &&
    isNumber(field(value, 'cashRatio')) &&
    isNumber(field(value, 'entries')) &&
    isNumber(field(value, 'cashers')) &&
    (cutScore === null || isNumber(cutScore)) &&
    isEvery(field(value, 'rows'), isSweeperRow)
  )
}

/** The 422 and failure handling every results route shares (D-83), after the caller's 404 check. */
async function readResultsBody(response: Response): Promise<unknown> {
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load results'), 'message')
    throw new ResultsUnavailableError(
      isText(message) ? String(message) : 'The results cannot be worked out',
    )
  }
  if (!response.ok) throw new Error(`Failed to load results (${response.status})`)
  return readJson(response, 'Failed to load results')
}

async function fetchResultsBody(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  query: URLSearchParams,
): Promise<unknown> {
  const response = await apiFetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/results?${query}`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  return readResultsBody(response)
}

/**
 * The results of one squad, by division (RES-31), ranked as `mode` says (RES-45). With a
 * `divisionId` only that division comes back (RES-48): the TV asks for the one that changed.
 */
export async function fetchSquadResults(
  tournamentId: string,
  sessionId: string,
  mode: RankMode,
  divisionId?: string,
): Promise<SquadResults> {
  const query = new URLSearchParams({ mode })
  if (divisionId) query.set('division', divisionId)
  const body = await fetchResultsBody('squad', tournamentId, sessionId, query)
  if (!isSquadResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

/** The results of one sweeper, one list (RES-31), ranked as `mode` says (RES-45). */
export async function fetchSweeperResults(
  tournamentId: string,
  sessionId: string,
  mode: RankMode,
): Promise<SweeperResults> {
  const body = await fetchResultsBody(
    'sweeper',
    tournamentId,
    sessionId,
    new URLSearchParams({ mode }),
  )
  if (!isSweeperResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

function isAtLargeRow(value: unknown): boolean {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'place')) &&
    isSessionDate(field(value, 'squadDate')) &&
    isNumber(field(value, 'total')) &&
    isNumber(field(value, 'highGame')) &&
    isBoolean(field(value, 'previousCasher')) &&
    isEvery(field(value, 'ties'), isTie)
  )
}

function isAtLargeDivision(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isNumber(field(value, 'number')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'entries')) &&
    isNumber(field(value, 'totalSpots')) &&
    isNumber(field(value, 'squadAdvancers')) &&
    isNumber(field(value, 'atLargeSpots')) &&
    isEvery(field(value, 'rows'), isAtLargeRow)
  )
}

function isAtLargeResults(value: unknown): value is AtLargeResults {
  return (
    isBoolean(field(value, 'complete')) &&
    isNumber(field(value, 'finalsRatio')) &&
    isEvery(field(value, 'divisions'), isAtLargeDivision)
  )
}

function isSeedingRow(value: unknown): boolean {
  const group = field(value, 'group')
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'seed')) &&
    (group === 'finalist' || group === 'other') &&
    isSessionDate(field(value, 'squadDate')) &&
    isNumber(field(value, 'total')) &&
    isNumber(field(value, 'highGame')) &&
    isNumber(field(value, 'handicap')) &&
    isBoolean(field(value, 'previousCasher')) &&
    isEvery(field(value, 'ties'), isTie)
  )
}

function isSeedingDivision(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isNumber(field(value, 'number')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'entries')) &&
    isNumber(field(value, 'finalists')) &&
    isNumber(field(value, 'atLarge')) &&
    isBoolean(field(value, 'showHandicap')) &&
    isEvery(field(value, 'rows'), isSeedingRow)
  )
}

function isSeedingResults(value: unknown): value is SeedingResults {
  return (
    isBoolean(field(value, 'complete')) &&
    isNumber(field(value, 'finalsRatio')) &&
    isEvery(field(value, 'divisions'), isSeedingDivision)
  )
}

function isFlag(value: unknown): boolean {
  const kind = field(value, 'kind')
  return (
    (kind === 'missed' || kind === 'unfinished') &&
    isText(field(value, 'sweeperId')) &&
    isNumber(field(value, 'gamesBowled'))
  )
}

function isSweeperColumn(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isSessionDate(field(value, 'date')) &&
    isNumber(field(value, 'games')) &&
    isBoolean(field(value, 'complete')) &&
    isCount(field(value, 'throughGame'))
  )
}

function isSuperSweeperRow(value: unknown): boolean {
  const group = field(value, 'group')
  return (
    isRankedRow(value) &&
    (group === 'casher' || group === 'other') &&
    isText(field(value, 'divisionName')) &&
    isEvery(field(value, 'sweeperTotals'), (total) => total === null || isNumber(total)) &&
    isEvery(
      field(value, 'sweeperScores'),
      (scores) => scores === null || isEvery(scores, isNumber),
    ) &&
    isEvery(field(value, 'sweeperPins'), isNumber) &&
    isEvery(field(value, 'flags'), isFlag) &&
    isBoolean(field(value, 'dnf'))
  )
}

function isSuperSweeperResults(value: unknown): value is SuperSweeperResults {
  const cutScore = field(value, 'cutScore')
  return (
    isMode(field(value, 'mode')) &&
    isBoolean(field(value, 'complete')) &&
    isNumber(field(value, 'cashRatio')) &&
    isNumber(field(value, 'entries')) &&
    isNumber(field(value, 'cashers')) &&
    (cutScore === null || isNumber(cutScore)) &&
    isEvery(field(value, 'sweepers'), isSweeperColumn) &&
    isEvery(field(value, 'rows'), isSuperSweeperRow)
  )
}

async function fetchFinalsBody(
  kind: FinalsKind,
  tournamentId: string,
  query = '',
): Promise<unknown> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}${query}`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  return readResultsBody(response)
}

/** The at-large advancers of every division (RES-37). */
export async function fetchAtLarge(tournamentId: string): Promise<AtLargeResults> {
  const body = await fetchFinalsBody('at-large', tournamentId)
  if (!isAtLargeResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

/** The finals seeding of every division (RES-37). */
export async function fetchSeeding(tournamentId: string): Promise<SeedingResults> {
  const body = await fetchFinalsBody('seeding', tournamentId)
  if (!isSeedingResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

/** The super sweeper results (RES-37), ranked as `mode` says (RES-45, D-252). */
export async function fetchSuperSweeper(
  tournamentId: string,
  mode: RankMode,
): Promise<SuperSweeperResults> {
  const body = await fetchFinalsBody('super-sweeper', tournamentId, `?mode=${mode}`)
  if (!isSuperSweeperResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}

function isLiveSession(value: unknown): boolean {
  const kind = field(value, 'kind')
  const results = field(value, 'results')
  if (kind === 'squad') return isSquadResults(results)
  return kind === 'sweeper' && isSweeperResults(results)
}

function isLiveResults(value: unknown): value is LiveResults {
  const superSweeper = field(value, 'superSweeper')
  const tournament = field(value, 'tournament')
  return (
    isText(field(tournament, 'id')) &&
    isText(field(tournament, 'name')) &&
    isText(field(value, 'generatedAt')) &&
    isEvery(field(value, 'sessions'), isLiveSession) &&
    (superSweeper === null || isSuperSweeperResults(superSweeper))
  )
}

/** What the TV page loads once: every session with scores, through the last full game (RES-47). */
export async function fetchLiveResults(tournamentId: string): Promise<LiveResults> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/live-results`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  const body = await readResultsBody(response)
  if (!isLiveResults(body)) throw new Error('Failed to load results (unexpected response)')
  return body
}
