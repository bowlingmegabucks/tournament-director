import { randomUUID } from 'node:crypto'
import type { NewTournament } from './createRequest.ts'
import type { CreatedTournament } from './types.ts'

export type CreateTournamentOutcome =
  | { created: CreatedTournament }
  /** A tournament with this name and start date is already stored (D-123). */
  | { duplicate: true }

/** What the create route needs from storage. The Prisma version writes to the legacy table. */
export interface TournamentWriter {
  create(input: NewTournament): Promise<CreateTournamentOutcome>
}

// D-123: same name (trimmed, any case) and same start date.
export const sameTournament = (
  stored: { name: string; startDate: string },
  input: { name: string; startDate: string },
) =>
  stored.startDate === input.startDate &&
  stored.name.trim().toLowerCase() === input.name.trim().toLowerCase()

/** For route tests. Keeps what it was given in `stored`. */
export function createInMemoryTournamentWriter(seed: CreatedTournament[] = []) {
  const stored = [...seed]
  const writer: TournamentWriter = {
    create: (input) => {
      if (stored.some((existing) => sameTournament(existing, input))) {
        return Promise.resolve({ duplicate: true })
      }
      const created = { ...input, id: randomUUID() }
      stored.push(created)
      return Promise.resolve({ created: { ...created } })
    },
  }
  return { writer, stored }
}
