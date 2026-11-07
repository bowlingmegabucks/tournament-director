import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { squadFields, type NewSquad, type Squad, type SquadFieldErrors } from './types'

const numbers = [
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'finalsRatio',
  'cashRatio',
  'games',
] as const
const flags = [
  'complete',
  'entryFeeOverridden',
  'finalsRatioOverridden',
  'cashRatioOverridden',
] as const

function isSquad(value: unknown): value is Squad {
  return (
    typeof field(value, 'id') === 'string' &&
    isSessionDate(field(value, 'date')) &&
    numbers.every((key) => typeof field(value, key) === 'number') &&
    flags.every((key) => typeof field(value, key) === 'boolean')
  )
}

/** The squads of one tournament, in the order the API sends them (SQD-20, SQD-21). */
export async function fetchSquads(tournamentId: string): Promise<Squad[]> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/squads`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load squads (${response.status})`)
  }
  const squads = field(await readJson(response, 'Failed to load squads'), 'squads')
  if (!Array.isArray(squads) || !squads.every(isSquad)) {
    throw new Error('Failed to load squads (unexpected response)')
  }
  return squads
}

/**
 * The API refused the squad (400 or 409). `errors` holds one message per form field, and
 * `tournament` holds a reason that is not about a field, such as a complete tournament (D-171).
 */
export class SquadRejectedError extends Error {
  readonly errors: SquadFieldErrors
  readonly tournament: string | undefined

  constructor(message: string, errors: SquadFieldErrors, tournament?: string) {
    super(message)
    this.errors = errors
    this.tournament = tournament
  }
}

function fieldErrors(value: unknown): SquadFieldErrors {
  const errors: SquadFieldErrors = {}
  for (const name of squadFields) {
    const message = field(value, name)
    if (typeof message === 'string') errors[name] = message
  }
  return errors
}

/** The error for a 400 or 409: the API's messages per field. */
async function rejection(response: Response): Promise<SquadRejectedError> {
  const body = await readJson(response, 'Failed to save the squad')
  const message = field(body, 'message')
  const errors = field(body, 'errors')
  const tournament = field(errors, 'tournament')
  return new SquadRejectedError(
    typeof message === 'string' ? message : 'The squad was not accepted.',
    fieldErrors(errors),
    typeof tournament === 'string' ? tournament : undefined,
  )
}

/**
 * Add a squad (SQD-01 to SQD-08). Throws `SquadRejectedError` for a bad field or a refusal (400,
 * 409 with `errors`).
 */
export async function createSquad(tournamentId: string, input: NewSquad): Promise<Squad> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/squads`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to add a squad.')
  if (response.status === 403) throw new Error('You do not have permission to add a squad.')
  if (!response.ok) throw new Error(`Failed to save the squad (${response.status})`)
  const squad = field(await readJson(response, 'Failed to save the squad'), 'squad')
  if (!isSquad(squad)) throw new Error('Failed to save the squad (unexpected response)')
  return squad
}
