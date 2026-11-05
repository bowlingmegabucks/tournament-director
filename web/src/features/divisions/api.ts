import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  divisionFields,
  type Division,
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
  if (response.status === 400 || response.status === 409) {
    const body = await readJson(response, 'Failed to save the division')
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : 'The division was not accepted.'
    const warnings = warningsOf(field(body, 'warnings'))
    if (warnings !== undefined && warnings.length > 0)
      throw new DivisionWarningsError(text, warnings)
    const errors = field(body, 'errors')
    const tournament = field(errors, 'tournament')
    throw new DivisionRejectedError(
      text,
      fieldErrors(errors),
      typeof tournament === 'string' ? tournament : undefined,
    )
  }
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to add a division.')
  if (response.status === 403) throw new Error('You do not have permission to add a division.')
  if (!response.ok) throw new Error(`Failed to save the division (${response.status})`)
  const division = field(await readJson(response, 'Failed to save the division'), 'division')
  if (!isDivision(division)) throw new Error('Failed to save the division (unexpected response)')
  return division
}
