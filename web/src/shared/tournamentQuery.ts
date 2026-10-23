// Tournament pages and the pages inside a tournament (divisions now, squads later) share these.

/** The API has no tournament with this id (404), or the id is not valid (400). */
export class TournamentNotFoundError extends Error {
  constructor() {
    super('Tournament not found')
  }
}

// Mutation hooks invalidate these keys, so keep them in one place. A page inside a tournament
// builds its key from `detail(id)`, so refreshing the tournament refreshes its pages too.
export const tournamentKeys = {
  all: ['tournaments'] as const,
  detail: (id: string) => ['tournaments', id] as const,
}

/** Retry a failed query once, but never a missing tournament: it will not appear on a second try. */
export function retryUnlessNotFound(failureCount: number, error: Error): boolean {
  return !(error instanceof TournamentNotFoundError) && failureCount < 1
}
