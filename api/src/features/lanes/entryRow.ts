import { z } from 'zod'
import { displayName } from '../registrations/registrationRow.ts'
import type { LaneEntry } from './types.ts'

/**
 * The columns of `SquadRegistration` the lane page reads, with the registration and bowler joined
 * in. Prisma's model fits this; naming it here keeps the mapping testable without Prisma. There is
 * no SSN, gender, or birth date here on purpose (BWL-17).
 */
export interface LaneEntryRow {
  /** The `SquadRegistration` key. Kept even when the registration is missing, for the log. */
  registrationId: string
  /** NOT NULL in the legacy table, but NULL reads the same as `''` (D-58). */
  laneAssignment: string | null
  /** NULL when the legacy row points at no registration or bowler (no foreign key in MyISAM). */
  registration: {
    id: string
    bowlerId: string
    average: number | null
    superSweeper: boolean
    divisionId: string
    bowler: { firstName: string; lastName: string; suffix: string } | null
  } | null
}

// The read shape needs a UUID registration, a whole-number or empty average, and a bowler with a
// first and last name (D-51). BWL-01 to BWL-12 run on save, not on read. A missing registration or
// bowler fails the same way: the field is missing, so the issue names it.
const entrySchema = z.object({
  registrationId: z.uuid(),
  bowlerId: z.uuid(),
  divisionId: z.uuid(),
  average: z.number().int().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  suffix: z.string(),
  superSweeper: z.boolean(),
})

/**
 * Turn a stored entry into a `LaneEntry`. The result says whether the row fits; the repository
 * skips and logs a row that does not (D-51).
 */
export function toLaneEntry(row: LaneEntryRow) {
  const { registration } = row
  const bowler = registration?.bowler
  const checked = entrySchema.safeParse({
    registrationId: registration?.id,
    bowlerId: registration?.bowlerId,
    divisionId: registration?.divisionId,
    average: registration?.average,
    firstName: bowler?.firstName,
    lastName: bowler?.lastName,
    suffix: bowler?.suffix,
    superSweeper: registration?.superSweeper,
  })
  if (!checked.success) return checked
  const { suffix, superSweeper, ...fields } = checked.data
  const entry: LaneEntry = {
    ...fields,
    name: displayName({ firstName: fields.firstName, lastName: fields.lastName, suffix }),
    superSweeper,
    position: row.laneAssignment ?? '',
  }
  return { success: true as const, data: entry }
}
