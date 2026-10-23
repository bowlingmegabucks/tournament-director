import { apiUrl } from '../../shared/apiUrl'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../tournaments/api'
import type { Division } from './types'

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

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
  const response = await fetch(
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
