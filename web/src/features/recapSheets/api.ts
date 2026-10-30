import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { LaneSetupError, SessionNotFoundError, type SessionKind } from '../../shared/session'
import type { RecapSheets } from './types'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'

function isLabels(value: unknown): boolean {
  return Array.isArray(value) && value.every(isText)
}

function isSheet(value: unknown): boolean {
  const cross = field(value, 'cross')
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName')) &&
    isText(field(value, 'position')) &&
    isNumber(field(value, 'handicap')) &&
    isLabels(field(cross, 'staggered')) &&
    isLabels(field(cross, 'same'))
  )
}

function isSession(value: unknown): boolean {
  const kind = field(value, 'kind')
  return (
    isText(field(value, 'id')) &&
    (kind === 'squad' || kind === 'sweeper') &&
    isSessionDate(field(value, 'date')) &&
    isNumber(field(value, 'games')) &&
    typeof field(value, 'complete') === 'boolean'
  )
}

function isRecapSheets(value: unknown): value is RecapSheets {
  const sheets = field(value, 'sheets')
  return (
    isSession(field(value, 'session')) &&
    Array.isArray(sheets) &&
    sheets.every(isSheet) &&
    isNumber(field(value, 'withoutLane')) &&
    isNumber(field(value, 'withoutDivision'))
  )
}

/** The recap sheets of one squad or sweeper, from its saved lane positions (RPT-08, D-65). */
export async function fetchRecapSheets(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<RecapSheets> {
  const response = await fetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/recap-sheets`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load recap sheets'), 'message')
    throw new LaneSetupError(
      isText(message) ? String(message) : 'This session cannot take lane assignments',
    )
  }
  if (!response.ok) throw new Error(`Failed to load recap sheets (${response.status})`)
  const body = await readJson(response, 'Failed to load recap sheets')
  if (!isRecapSheets(body)) throw new Error('Failed to load recap sheets (unexpected response)')
  return body
}
