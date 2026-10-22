import { tournamentSchema, type Tournament } from './types.ts'

/**
 * The columns of the legacy `Tournaments` table that the vendor shape needs.
 * Prisma's model fits this; naming only what we read keeps the mapping testable without Prisma.
 */
export interface TournamentRow {
  id: string
  name: string
  start: Date
  end: Date
  /** Prisma gives a `Decimal` for `decimal(5,2)`. */
  entryFee: { toNumber(): number }
  bowlingCenter: string
}

// Legacy stores a date as midnight in a `datetime(6)`. Prisma reads that as midnight UTC.
// An unreadable value (`Invalid Date`) becomes undefined, which the schema then rejects.
function isoDate(value: Date): string | undefined {
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10)
}

/**
 * Turn a stored row into the vendor shape (`API-03`, `API-04`). The result says whether the row
 * fits; the repository skips and logs a row that does not (D-31).
 */
export function toTournament(row: TournamentRow) {
  return tournamentSchema.safeParse({
    id: row.id,
    name: row.name,
    startDate: isoDate(row.start),
    endDate: isoDate(row.end),
    entryFee: row.entryFee.toNumber(),
    bowlingCenter: row.bowlingCenter,
  } satisfies Record<keyof Tournament, unknown>)
}
