import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  pinKey,
  sweeperScalarFields,
  type BonusPins,
  type NewSweeper,
  type Sweeper,
  type SweeperFieldErrors,
} from './types'

const numbers = [
  'startingLane',
  'numberOfLanes',
  'maxPerPair',
  'entryFee',
  'games',
  'cashRatio',
] as const

function isBonusPins(value: unknown): value is BonusPins {
  return (
    typeof field(value, 'divisionId') === 'string' &&
    typeof field(value, 'divisionName') === 'string' &&
    typeof field(value, 'bonusPinsPerGame') === 'number' &&
    // The API leaves out divisions with no bonus (D-45), so a 0 means the contract broke.
    field(value, 'bonusPinsPerGame') !== 0
  )
}

function isSweeper(value: unknown): value is Sweeper {
  const bonusPins = field(value, 'bonusPins')
  return (
    typeof field(value, 'id') === 'string' &&
    isSessionDate(field(value, 'date')) &&
    typeof field(value, 'complete') === 'boolean' &&
    numbers.every((key) => typeof field(value, key) === 'number') &&
    Array.isArray(bonusPins) &&
    bonusPins.every(isBonusPins)
  )
}

/** The sweepers of one tournament, in the order the API sends them (SQD-20, SQD-22). */
export async function fetchSweepers(tournamentId: string): Promise<Sweeper[]> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/sweepers`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load sweepers (${response.status})`)
  }
  const sweepers = field(await readJson(response, 'Failed to load sweepers'), 'sweepers')
  if (!Array.isArray(sweepers) || !sweepers.every(isSweeper)) {
    throw new Error('Failed to load sweepers (unexpected response)')
  }
  return sweepers
}

/**
 * The API refused the sweeper (400 or 409). `errors` holds one message per form field (see
 * `SweeperFieldErrors`), and `tournament` holds a reason that is not about a field, such as a
 * complete tournament (D-171).
 */
export class SweeperRejectedError extends Error {
  readonly errors: SweeperFieldErrors
  readonly tournament: string | undefined

  constructor(message: string, errors: SweeperFieldErrors, tournament?: string) {
    super(message)
    this.errors = errors
    this.tournament = tournament
  }
}

/** The messages for the form's fields; a key the form has no box for is left out. */
function fieldErrors(value: unknown): SweeperFieldErrors {
  const errors: SweeperFieldErrors = {}
  if (typeof value !== 'object' || value === null) return errors
  const scalarNames: readonly string[] = sweeperScalarFields
  for (const [key, message] of Object.entries(value)) {
    if (typeof message !== 'string') continue
    if (key === 'bonusPins' || key.startsWith(pinKey('')) || scalarNames.includes(key)) {
      errors[key] = message
    }
  }
  return errors
}

/** The error for a 400 or 409: the API's messages per field. */
async function rejection(response: Response): Promise<SweeperRejectedError> {
  const body = await readJson(response, 'Failed to save the sweeper')
  const message = field(body, 'message')
  const errors = field(body, 'errors')
  const tournament = field(errors, 'tournament')
  return new SweeperRejectedError(
    typeof message === 'string' ? message : 'The sweeper was not accepted.',
    fieldErrors(errors),
    typeof tournament === 'string' ? tournament : undefined,
  )
}

/**
 * Add a sweeper (SQD-10 to SQD-13). Throws `SweeperRejectedError` for a bad field or a refusal
 * (400, 409 with `errors`).
 */
export async function createSweeper(tournamentId: string, input: NewSweeper): Promise<Sweeper> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/sweepers`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to add a sweeper.')
  if (response.status === 403) throw new Error('You do not have permission to add a sweeper.')
  if (!response.ok) throw new Error(`Failed to save the sweeper (${response.status})`)
  const sweeper = field(await readJson(response, 'Failed to save the sweeper'), 'sweeper')
  if (!isSweeper(sweeper)) throw new Error('Failed to save the sweeper (unexpected response)')
  return sweeper
}
