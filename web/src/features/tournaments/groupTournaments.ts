import type { Tournament } from './types'

export interface TournamentGroups {
  /** Ends today or later, soonest first (D-20). */
  current: Tournament[]
  /** Ended before today, newest first. */
  past: Tournament[]
}

export type TournamentStatus = 'in-progress' | 'upcoming' | 'past'

/** `today` is `YYYY-MM-DD`; ISO dates sort the same as strings. */
export function tournamentStatus(tournament: Tournament, today: string): TournamentStatus {
  if (tournament.endDate < today) return 'past'
  return tournament.startDate > today ? 'upcoming' : 'in-progress'
}

export function groupTournaments(tournaments: Tournament[], today: string): TournamentGroups {
  const current = tournaments
    .filter((tournament) => tournament.endDate >= today)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate))
  const past = tournaments
    .filter((tournament) => tournament.endDate < today)
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate))
  return { current, past }
}

/** The one Home shows: the first that is in progress or upcoming (D-18, D-20). */
export function currentTournament(
  tournaments: Tournament[],
  today: string,
): Tournament | undefined {
  return groupTournaments(tournaments, today).current[0]
}
