import { z } from 'zod'

/** A decimal column. Prisma gives a `Decimal`; naming only `toNumber` keeps mappers testable without Prisma. */
export interface StoredDecimal {
  toNumber(): number
}

/**
 * The columns of the legacy `Squads` table. Squads and sweepers share it, told apart by
 * `SquadType` (0 and 1). Columns that do not apply to a row's type are NULL.
 */
export interface SessionRow {
  id: string
  date: Date
  maxPerPair: number
  startingLane: number
  numberOfLanes: number
  complete: boolean
  /** Squad: optional override. Sweeper: its own required cash ratio. */
  cashRatio: StoredDecimal | null
  finalsRatio: StoredDecimal | null
  squadEntryFee: StoredDecimal | null
  sweeperEntryFee: StoredDecimal | null
  games: number | null
}

/** `2026-10-10T09:00:00`: the center's local time with no zone, as `API-04` shows. */
export const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)

// Legacy stores the center's local time in a `datetime(6)`. Prisma reads it as UTC, so the
// wall-clock digits are the stored ones. An unreadable value (`Invalid Date`) becomes
// undefined, which the schema then rejects.
export function localDateTime(value: Date): string | undefined {
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 19)
}

/** Fields shared by squads and sweepers on the web lists. */
export const sessionFields = {
  id: z.uuid(),
  date: localDateTimeSchema,
  complete: z.boolean(),
  startingLane: z.number().int(),
  numberOfLanes: z.number().int(),
  maxPerPair: z.number().int(),
}

/** SQD-20, D-45: by date, then starting lane, then id, so two sessions at one time keep a stable order. */
export function compareSessions(
  a: { date: string; startingLane: number; id: string },
  b: { date: string; startingLane: number; id: string },
): number {
  return a.date.localeCompare(b.date) || a.startingLane - b.startingLane || a.id.localeCompare(b.id)
}

export function toNumber(value: StoredDecimal | null): number | null {
  return value === null ? null : value.toNumber()
}
