import { z } from 'zod'
import { sessionFields } from '../../shared/sessions.ts'

/**
 * One bowler on the lane page (LAN-11). `pins` is the handicap on a squad (SCR-07) and the bonus
 * pins on a sweeper (SCR-09). `position` is `''` when the bowler has no lane (LAN-01, D-58).
 * `web/src/features/lanes/types.ts` expects this shape. Change both together. Not vendor-visible,
 * and never the SSN, gender, birth date, address, email, or phone (BWL-17).
 */
export const laneBowlerSchema = z.object({
  registrationId: z.uuid(),
  name: z.string().min(1),
  divisionId: z.uuid(),
  divisionName: z.string(),
  average: z.number().int().nullable(),
  position: z.string(),
  pins: z.number().int(),
  superSweeper: z.boolean(),
})

export type LaneBowler = z.infer<typeof laneBowlerSchema>

/** One lane pair, the drop zone on the page (LAN-03, D-58). */
export const lanePairSchema = z.object({
  firstLane: z.number().int(),
  lanes: z.array(z.number().int()),
  /** Seats on the pair: the session's `maxPerPair` (D-56). The pair is full at this many bowlers. */
  capacity: z.number().int(),
  bowlers: z.array(laneBowlerSchema),
})

export type LanePair = z.infer<typeof lanePairSchema>

/** Bowlers entered, for one division (LAN-10). */
const divisionEntriesSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  name: z.string(),
  entries: z.number().int().nonnegative(),
})

export const lanePageSchema = z.object({
  session: z.object({
    ...sessionFields,
    kind: z.enum(['squad', 'sweeper']),
  }),
  pairs: z.array(lanePairSchema),
  /** Bowlers with no position, sorted by name. */
  unassigned: z.array(laneBowlerSchema),
  /** Bowlers whose position fits no pair of this session (D-61). */
  other: z.array(laneBowlerSchema),
  divisions: z.array(divisionEntriesSchema),
})

export type LanePage = z.infer<typeof lanePageSchema>

/**
 * A bowler's entry in one squad or sweeper as stored (`SquadRegistration` with its registration and
 * bowler), before the division and pins are worked out. `position` is the stored text; `''` when
 * the column is empty or NULL.
 */
export interface LaneEntry {
  registrationId: string
  name: string
  firstName: string
  lastName: string
  divisionId: string
  average: number | null
  superSweeper: boolean
  position: string
}
