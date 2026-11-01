import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type { BonusPins, Sweeper } from './types'

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
