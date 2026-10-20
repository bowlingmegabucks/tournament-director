import { apiUrl } from '../../shared/apiUrl'
import type { Tournament } from './types'

function isTournament(value: unknown): value is Tournament {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'date' in value &&
    typeof value.date === 'string' &&
    'entrants' in value &&
    typeof value.entrants === 'number'
  )
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await fetch(apiUrl('/tournaments'))
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Failed to load tournaments (response is not JSON)')
  }
  if (!Array.isArray(body) || !body.every(isTournament)) {
    throw new Error('Failed to load tournaments (unexpected response)')
  }
  return body
}
