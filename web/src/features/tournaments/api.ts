import { apiUrl } from '../../shared/apiUrl'
import { readJson } from '../../shared/readJson'
import type { Tournament } from './types'

/** The API has no tournament with this id (404), or the id is not valid (400). */
export class TournamentNotFoundError extends Error {
  constructor() {
    super('Tournament not found')
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

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
  const response = await fetch(apiUrl('/v1/tournaments'))
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
  const response = await fetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}`))
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
