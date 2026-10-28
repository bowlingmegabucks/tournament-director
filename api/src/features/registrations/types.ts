import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'

/**
 * A registration as the web app's Registrations page reads it (REG-23, REG-26, D-47). The bowler
 * carries only what the list shows or filters on: never the SSN, gender, birth date, address,
 * email, or phone (BWL-17). `web/src/features/registrations/types.ts` expects this shape. Change
 * both together. Not vendor-visible.
 */
export const registrationSchema = z.object({
  id: z.uuid(),
  bowler: z.object({
    id: z.uuid(),
    /** `First Last`, plus `, Suffix` (BWL-13). */
    name: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    /** `''` when the bowler has none. */
    usbcId: z.string(),
  }),
  divisionId: z.uuid(),
  divisionName: z.string(),
  /** The qualifying squads entered. The page shows their count and lists them in a popup (REG-28). */
  squadIds: z.array(z.uuid()),
  sweeperIds: z.array(z.uuid()),
  superSweeper: z.boolean(),
})

export type Registration = z.infer<typeof registrationSchema>

const entries = z.number().int().nonnegative()

/** A squad or sweeper, with its date and status for the popup (REG-28). */
const sessionEntries = z.object({
  id: z.uuid(),
  date: localDateTimeSchema,
  complete: z.boolean(),
  entries,
})

/** Counts for the whole tournament, not the filtered rows (REG-24, D-50). */
export const summarySchema = z.object({
  registrations: entries,
  superSweepers: entries,
  /** Entries per division: the squads its bowlers entered. Sweepers do not count (REG-24). */
  divisions: z.array(
    z.object({ id: z.uuid(), number: z.number().int(), name: z.string(), entries }),
  ),
  squads: z.array(sessionEntries),
  sweepers: z.array(sessionEntries),
})

export type Summary = z.infer<typeof summarySchema>

export const registrationListSchema = z.object({
  registrations: z.array(registrationSchema),
  summary: summarySchema,
})
