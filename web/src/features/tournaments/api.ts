import { apiUrl } from '../../shared/apiUrl'
import type { Tournament } from './types'

function isTournament(value: unknown): value is Tournament {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.date === 'string' &&
    typeof t.entrants === 'number'
  )
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await fetch(apiUrl('/api/tournaments'))
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body) || !body.every(isTournament)) {
    throw new Error('Failed to load tournaments (unexpected response)')
  }
  return body
}
