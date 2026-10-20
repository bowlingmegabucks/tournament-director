import { apiUrl } from '../../shared/apiUrl'
import { readJson } from '../../shared/readJson'
import type { Tournament } from './types'

function isTournament(value: unknown): value is Tournament {
  if (typeof value !== 'object' || value === null) return false
  const get = (key: string): unknown => Reflect.get(value, key)
  return (
    typeof get('id') === 'string' &&
    typeof get('name') === 'string' &&
    typeof get('date') === 'string' &&
    typeof get('entrants') === 'number'
  )
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await fetch(apiUrl('/tournaments'))
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  const body = await readJson(response, 'Failed to load tournaments')
  if (!Array.isArray(body) || !body.every(isTournament)) {
    throw new Error('Failed to load tournaments (unexpected response)')
  }
  return body
}
