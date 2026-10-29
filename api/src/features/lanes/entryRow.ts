import { z } from 'zod'
import { displayName } from '../registrations/registrationRow.ts'
import type { LaneEntry } from './types.ts'

/**
 * The columns of `SquadRegistration` the lane page reads, with the registration and bowler joined
 * in. Prisma's model fits this; naming it here keeps the mapping testable without Prisma. There is
 * no SSN, gender, or birth date here on purpose (BWL-17).
 */
export interface LaneEntryRow {
  /** NOT NULL in the legacy table, but NULL reads the same as `''` (D-58). */
  laneAssignment: string | null
  registration: {
    id: string
    average: number | null
    superSweeper: boolean
    divisionId: string
    bowler: { firstName: string; lastName: string; suffix: string }
  }
}

// The read shape needs a UUID registration, a whole-number or empty average, and a bowler with a
// first and last name (D-51). BWL-01 to BWL-12 run on save, not on read.
const entrySchema = z.object({
  registrationId: z.uuid(),
  divisionId: z.uuid(),
  average: z.number().int().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

/**
 * Turn a stored entry into a `LaneEntry`. The result says whether the row fits; the repository
 * skips and logs a row that does not (D-51).
 */
export function toLaneEntry(row: LaneEntryRow) {
  const { registration } = row
  const checked = entrySchema.safeParse({
    registrationId: registration.id,
    divisionId: registration.divisionId,
    average: registration.average,
    firstName: registration.bowler.firstName,
    lastName: registration.bowler.lastName,
  })
  if (!checked.success) return checked
  const entry: LaneEntry = {
    ...checked.data,
    name: displayName(registration.bowler),
    superSweeper: registration.superSweeper,
    position: row.laneAssignment ?? '',
  }
  return { success: true as const, data: entry }
}
