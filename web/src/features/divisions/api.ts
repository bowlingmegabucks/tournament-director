import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  divisionFields,
  type Division,
  type DivisionChanges,
  type DivisionEditInfo,
  type DivisionFieldErrors,
  type DivisionWarning,
  type NewDivision,
} from './types'

const numberOrNull = ['minimumAge', 'maximumAge', 'minimumAverage', 'maximumAverage'] as const
const handicapNumberOrNull = [
  'handicapPercentage',
  'handicapBase',
  'maximumHandicapPerGame',
] as const

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number'
}

function isDivision(value: unknown): value is Division {
  const gender = field(value, 'gender')
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'number') === 'number' &&
    typeof field(value, 'name') === 'string' &&
    (gender === null || gender === 'Male' || gender === 'Female') &&
    [...numberOrNull, ...handicapNumberOrNull].every((key) => isNumberOrNull(field(value, key)))
  )
}

/** The divisions of one tournament, in the order the API sends them (DIV-13). */
export async function fetchDivisions(tournamentId: string): Promise<Division[]> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/divisions`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load divisions (${response.status})`)
  }
  const divisions = field(await readJson(response, 'Failed to load divisions'), 'divisions')
  if (!Array.isArray(divisions) || !divisions.every(isDivision)) {
    throw new Error('Failed to load divisions (unexpected response)')
  }
  return divisions
}

/**
 * The API refused the division (400 or 409). `errors` holds one message per form field, and
 * `tournament` holds a reason that is not about a field, such as a complete tournament (D-143).
 */
export class DivisionRejectedError extends Error {
  readonly errors: DivisionFieldErrors
  readonly tournament: string | undefined

  constructor(message: string, errors: DivisionFieldErrors, tournament?: string) {
    super(message)
    this.errors = errors
    this.tournament = tournament
  }
}

/** The API allows the division but wants it confirmed first; nothing was saved (D-142). */
export class DivisionWarningsError extends Error {
  readonly warnings: DivisionWarning[]

  constructor(message: string, warnings: DivisionWarning[]) {
    super(message)
    this.warnings = warnings
  }
}

function fieldErrors(value: unknown): DivisionFieldErrors {
  const errors: DivisionFieldErrors = {}
  for (const name of divisionFields) {
    const message = field(value, name)
    if (typeof message === 'string') errors[name] = message
  }
  return errors
}

function warningsOf(value: unknown): DivisionWarning[] | undefined {
  if (!Array.isArray(value)) return undefined
  const warnings: DivisionWarning[] = []
  for (const item of value as unknown[]) {
    const name = field(item, 'field')
    const message = field(item, 'message')
    if (typeof name !== 'string' || typeof message !== 'string') return undefined
    warnings.push({ field: name, message })
  }
  return warnings
}

/** The error for a 400 or 409: a warning to confirm, or the API's messages per field. */
async function rejection(response: Response): Promise<Error> {
  const body = await readJson(response, 'Failed to save the division')
  const message = field(body, 'message')
  const text = typeof message === 'string' ? message : 'The division was not accepted.'
  const warnings = warningsOf(field(body, 'warnings'))
  if (warnings !== undefined && warnings.length > 0)
    return new DivisionWarningsError(text, warnings)
  const errors = field(body, 'errors')
  const tournament = field(errors, 'tournament')
  return new DivisionRejectedError(
    text,
    fieldErrors(errors),
    typeof tournament === 'string' ? tournament : undefined,
  )
}

/**
 * Add a division (DIV-12). Throws `DivisionRejectedError` for a bad field or a refusal (400, 409
 * with `errors`) and `DivisionWarningsError` when the director must confirm (409 with `warnings`).
 */
export async function createDivision(
  tournamentId: string,
  input: NewDivision,
  confirmWarnings = false,
): Promise<Division> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/divisions`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(confirmWarnings ? { ...input, confirmWarnings: true } : input),
    },
  )
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to add a division.')
  if (response.status === 403) throw new Error('You do not have permission to add a division.')
  if (!response.ok) throw new Error(`Failed to save the division (${response.status})`)
  const division = field(await readJson(response, 'Failed to save the division'), 'division')
  if (!isDivision(division)) throw new Error('Failed to save the division (unexpected response)')
  return division
}

const divisionUrl = (tournamentId: string, divisionId: string) =>
  apiUrl(
    `/v1/tournaments/${encodeURIComponent(tournamentId)}/divisions/${encodeURIComponent(divisionId)}`,
  )

/**
 * Change a division (DIV-12, D-147): send only the fields that changed. Throws `DivisionRejectedError`
 * for a bad field or a refusal (400, 409 with `errors`) and `DivisionWarningsError` when the director
 * must confirm (409 with `warnings`).
 */
export async function updateDivision(
  tournamentId: string,
  divisionId: string,
  changes: DivisionChanges,
  confirmWarnings = false,
): Promise<Division> {
  const response = await apiFetch(divisionUrl(tournamentId, divisionId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(confirmWarnings ? { ...changes, confirmWarnings: true } : changes),
  })
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404)
    throw new Error('This division was not found. It may have been removed.')
  if (response.status === 401) throw new Error('Sign in to edit a division.')
  if (response.status === 403) throw new Error('You do not have permission to edit a division.')
  if (!response.ok) throw new Error(`Failed to save the division (${response.status})`)
  const division = field(await readJson(response, 'Failed to save the division'), 'division')
  if (!isDivision(division)) throw new Error('Failed to save the division (unexpected response)')
  return division
}

/** What depends on one division's settings, for the edit page (D-147, D-148). */
export async function fetchDivisionEditInfo(
  tournamentId: string,
  divisionId: string,
): Promise<DivisionEditInfo> {
  const response = await apiFetch(`${divisionUrl(tournamentId, divisionId)}/edit-info`)
  // The API answers 404 for an unknown tournament and for an unknown division alike.
  if (response.status === 404)
    throw new Error('This division was not found. It may have been removed.')
  if (!response.ok) throw new Error(`Failed to load the division (${response.status})`)
  const info = field(await readJson(response, 'Failed to load the division'), 'editInfo')
  const count = field(info, 'registrationCount')
  const scores = field(info, 'hasScores')
  if (typeof count !== 'number' || typeof scores !== 'boolean') {
    throw new TypeError('Failed to load the division (unexpected response)')
  }
  return { registrationCount: count, hasScores: scores }
}
