import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type { Squad } from './types'

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
