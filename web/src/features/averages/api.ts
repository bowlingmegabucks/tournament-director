import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type { AverageList, AverageRow, AverageStatus, CheckAction } from './types'

/** The registration is not there (404). */
export class AverageNotFoundError extends Error {}

/** The API refused the change (409): the tournament is complete. Nothing changed (D-294). */
export class AverageRefusedError extends Error {}

/** A field is wrong (400). `errors` is keyed `average` and `note` (D-291). */
export class AverageFieldErrorsError extends Error {
  readonly errors: Record<string, string>

  constructor(message: string, errors: Record<string, string>) {
    super(message)
    this.errors = errors
  }
}

/** The change would alter results of a bowler with scores; the director must confirm (409 with warnings, D-294). */
export class AverageConfirmError extends Error {}

const isText = (value: unknown): value is string => typeof value === 'string'
const isNullableText = (value: unknown): value is string | null => value === null || isText(value)
const isNullableNumber = (value: unknown): value is number | null =>
  value === null || typeof value === 'number'

function isStatus(value: unknown): value is AverageStatus {
  return value === 'unverified' || value === 'verified' || value === 'adjusted'
}

function isRow(value: unknown): value is AverageRow {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'bowlerName')) &&
    isText(field(value, 'divisionName')) &&
    isText(field(value, 'usbcId')) &&
    isNullableNumber(field(value, 'providedAverage')) &&
    isStatus(field(value, 'status')) &&
    isNullableNumber(field(value, 'averageInUse')) &&
    isNullableText(field(value, 'note')) &&
    isNullableText(field(value, 'verifiedBy')) &&
    isNullableText(field(value, 'verifiedAt'))
  )
}

const base = (tournamentId: string) => `/v1/tournaments/${encodeURIComponent(tournamentId)}`
const checkUrl = (tournamentId: string, registrationId: string) =>
  apiUrl(`${base(tournamentId)}/registrations/${encodeURIComponent(registrationId)}/average-check`)

/** The failures every call shares. Returns when the response is fine. */
async function checkCommon(response: Response, failure: string): Promise<void> {
  if (response.status === 401) throw new Error('Sign in to check averages.')
  if (response.status === 403) throw new Error('You do not have permission to check averages.')
  if (response.status === 404) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined)
    const message = field(body, 'message')
    if (message === 'Tournament not found') throw new TournamentNotFoundError()
    throw new AverageNotFoundError(isText(message) ? message : failure)
  }
}

export async function fetchAverages(tournamentId: string): Promise<AverageList> {
  const failure = 'Failed to load the averages'
  const response = await apiFetch(apiUrl(`${base(tournamentId)}/averages`))
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  const body = await readJson(response, failure)
  const rows = field(body, 'rows')
  const complete = field(body, 'tournamentComplete')
  if (!Array.isArray(rows) || !rows.every(isRow) || typeof complete !== 'boolean') {
    throw new TypeError(`${failure} (unexpected response)`)
  }
  return { rows, tournamentComplete: complete }
}

/** The 400 and 409 of a save or a removal. */
async function checkChange(response: Response, failure: string): Promise<void> {
  if (response.status === 400) {
    const body = await readJson(response, failure)
    const errors = field(body, 'errors')
    const message = field(body, 'message')
    const entries =
      typeof errors === 'object' && errors !== null
        ? Object.entries(errors).filter((entry): entry is [string, string] => isText(entry[1]))
        : []
    throw new AverageFieldErrorsError(
      isText(message) ? message : failure,
      Object.fromEntries(entries),
    )
  }
  if (response.status === 409) {
    const body = await readJson(response, failure)
    const message = field(body, 'message')
    const text = isText(message) ? message : failure
    throw field(body, 'warnings') === undefined
      ? new AverageRefusedError(text)
      : new AverageConfirmError(text)
  }
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
}

/**
 * Verify or adjust (AVG-03, AVG-04). Throws `AverageFieldErrorsError` (400), `AverageConfirmError`
 * (409, send again with `confirm`), `AverageRefusedError` (409), and `AverageNotFoundError` (404).
 */
export async function saveCheck(
  tournamentId: string,
  registrationId: string,
  change: CheckAction,
  confirm: boolean,
): Promise<void> {
  const response = await apiFetch(checkUrl(tournamentId, registrationId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(confirm ? { ...change, confirmWarnings: true } : change),
  })
  await checkChange(response, 'Failed to save the average')
}

/** Take the check away (AVG-07). Same failures as `saveCheck`. */
export async function removeCheck(
  tournamentId: string,
  registrationId: string,
  confirm: boolean,
): Promise<void> {
  const response = await apiFetch(
    `${checkUrl(tournamentId, registrationId)}${confirm ? '?confirmWarnings=true' : ''}`,
    { method: 'DELETE' },
  )
  await checkChange(response, 'Failed to remove the check')
}
