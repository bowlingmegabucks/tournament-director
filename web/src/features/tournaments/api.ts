import type { Tournament } from './types'

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await fetch('/api/tournaments')
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  return (await response.json()) as Tournament[]
}
