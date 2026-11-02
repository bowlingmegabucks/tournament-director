import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type {
  FieldErrors,
  NewTournament,
  Tournament,
  TournamentField,
  TournamentSettings,
} from './types'

function isTournament(value: unknown): value is Tournament {
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'name') === 'string' &&
    typeof field(value, 'startDate') === 'string' &&
    typeof field(value, 'endDate') === 'string' &&
    typeof field(value, 'entryFee') === 'number' &&
    typeof field(value, 'bowlingCenter') === 'string'
  )
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await apiFetch(apiUrl('/v1/tournaments'))
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  const tournaments = field(await readJson(response, 'Failed to load tournaments'), 'tournaments')
  if (!Array.isArray(tournaments) || !tournaments.every(isTournament)) {
    throw new Error('Failed to load tournaments (unexpected response)')
  }
  return tournaments
}

export async function fetchTournament(id: string): Promise<Tournament> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load tournament (${response.status})`)
  }
  const tournament = field(await readJson(response, 'Failed to load tournament'), 'tournament')
  if (!isTournament(tournament)) {
    throw new Error('Failed to load tournament (unexpected response)')
  }
  return tournament
}

function isSettings(value: unknown): value is TournamentSettings {
  return (
    typeof field(value, 'games') === 'number' &&
    typeof field(value, 'finalsRatio') === 'number' &&
    typeof field(value, 'cashRatio') === 'number' &&
    typeof field(value, 'superSweeperCashRatio') === 'number'
  )
}

export async function fetchTournamentSettings(id: string): Promise<TournamentSettings> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}/settings`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load the tournament format (${response.status})`)
  }
  const settings = field(
    await readJson(response, 'Failed to load the tournament format'),
    'settings',
  )
  if (!isSettings(settings)) {
    throw new Error('Failed to load the tournament format (unexpected response)')
  }
  return settings
}

const formFields: readonly TournamentField[] = [
  'name',
  'startDate',
  'endDate',
  'bowlingCenter',
  'entryFee',
  'games',
  'finalsRatio',
  'cashRatio',
  'superSweeperCashRatio',
]

/** The API refused the tournament (400 or 409). `errors` holds one message per form field (D-121). */
export class TournamentRejectedError extends Error {
  readonly errors: FieldErrors

  constructor(message: string, errors: FieldErrors) {
    super(message)
    this.errors = errors
  }
}

function fieldErrors(value: unknown): FieldErrors {
  const errors: FieldErrors = {}
  for (const name of formFields) {
    const message = field(value, name)
    if (typeof message === 'string') errors[name] = message
  }
  return errors
}

/** Create a tournament (TRN-19). Returns the stored tournament. */
export async function createTournament(input: NewTournament): Promise<Tournament> {
  const response = await apiFetch(apiUrl('/v1/tournaments'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 400 || response.status === 409) {
    const body = await readJson(response, 'Failed to save the tournament')
    const message = field(body, 'message')
    throw new TournamentRejectedError(
      typeof message === 'string' ? message : 'The tournament was not accepted.',
      fieldErrors(field(body, 'errors')),
    )
  }
  if (response.status === 401) throw new Error('Sign in to create a tournament.')
  if (response.status === 403) throw new Error('You do not have permission to create a tournament.')
  if (!response.ok) throw new Error(`Failed to save the tournament (${response.status})`)
  const tournament = field(await readJson(response, 'Failed to save the tournament'), 'tournament')
  if (!isTournament(tournament)) {
    throw new Error('Failed to save the tournament (unexpected response)')
  }
  return tournament
}
