import { divisionSchema, type Division } from './types.ts'

/**
 * The columns of the legacy `Divisions` table. Prisma's model fits this; naming it here keeps
 * the mapping testable without Prisma.
 */
export interface DivisionRow {
  id: string
  name: string
  number: number
  minimumAge: number | null
  maximumAge: number | null
  minimumAverage: number | null
  maximumAverage: number | null
  /** Prisma gives a `Decimal` for `decimal(3,2)`: a fraction, `0.90` for 90%. */
  handicapPercentage: { toNumber(): number } | null
  handicapBase: number | null
  maximumHandicapPerGame: number | null
  /** 0 = Male, 1 = Female, NULL = any gender. */
  gender: number | null
}

const genders: Partial<Record<number, 'Male' | 'Female'>> = { 0: 'Male', 1: 'Female' }

// A value that is neither NULL nor 0 or 1 stays a number, and the schema rejects it.
function genderName(value: number | null): unknown {
  return value === null ? null : (genders[value] ?? value)
}

// The column holds two decimal places, so rounding only removes float noise (0.9 * 100).
function wholePercent(value: { toNumber(): number } | null): number | null {
  return value === null ? null : Math.round(value.toNumber() * 100)
}

/**
 * Turn a stored row into the shape the Divisions page reads. The result says whether the row
 * fits; the repository skips and logs a row that does not (D-39). `DIV-01` to `DIV-11` do not
 * run on read.
 */
export function toDivision(row: DivisionRow) {
  return divisionSchema.safeParse({
    id: row.id,
    number: row.number,
    name: row.name,
    gender: genderName(row.gender),
    minimumAge: row.minimumAge,
    maximumAge: row.maximumAge,
    minimumAverage: row.minimumAverage,
    maximumAverage: row.maximumAverage,
    handicapPercentage: wholePercent(row.handicapPercentage),
    handicapBase: row.handicapBase,
    maximumHandicapPerGame: row.maximumHandicapPerGame,
  } satisfies Record<keyof Division, unknown>)
}
