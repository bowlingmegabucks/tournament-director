import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'

/**
 * The squad and sweeper results the Results tab reads (RES-31). `web/src/features/results/types.ts`
 * expects these shapes. Change both together. Not vendor-visible, and never the SSN, gender, birth
 * date, address, email, phone, average, or payments (BWL-17).
 */

/** What separated two bowlers after the total: the games bowled, or the Nth best game (1 = high game). */
export const deciderSchema = z.union([
  z.object({ kind: z.literal('games') }),
  z.object({ kind: z.literal('game'), rank: z.number().int().min(1) }),
])

/** D-14, D-16: a tie across the cut or cash line. `decidedBy` is `null` for a full tie. */
export const tieSchema = z.object({
  line: z.enum(['cut', 'cash']),
  outcome: z.enum(['won', 'lost', 'full']),
  decidedBy: deciderSchema.nullable(),
})

/** Fields every ranked row carries. */
const rowFields = {
  registrationId: z.uuid(),
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: z.string().min(1),
  place: z.number().int().min(1),
  /** Total and high game include the handicap or bonus pins (SCR-08, SCR-09). */
  total: z.number().int(),
  highGame: z.number().int(),
  games: z.number().int().nonnegative(),
  ties: z.array(tieSchema),
}

/** A placed bowler of a squad division. The page draws the lines where `group` changes (RES-11). */
export const squadRowSchema = z.object({
  ...rowFields,
  group: z.enum(['advancer', 'casher', 'other']),
  /** The handicap per game (SCR-07). */
  handicap: z.number().int(),
  /** True only for an earlier advancer at or above the cut score (D-81). */
  advancedEarlier: z.boolean(),
})

/** A bowler listed apart on a complete squad: no place, no group, no ties (D-75). */
export const unplacedRowSchema = z.object({
  registrationId: z.uuid(),
  name: z.string().min(1),
  total: z.number().int(),
  highGame: z.number().int(),
  games: z.number().int().nonnegative(),
  handicap: z.number().int(),
})

export const divisionResultSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  name: z.string(),
  /** `N` (RES-02). Counts no-shows and bowlers who did not finish (D-06, D-75). */
  entries: z.number().int().nonnegative(),
  /** RES-11a: someone in the division has a handicap above 0. */
  showHandicap: z.boolean(),
  /** D-76: the placed bowlers have unequal game counts. */
  showGames: z.boolean(),
  rows: z.array(squadRowSchema),
  didNotFinish: z.array(unplacedRowSchema),
  noShows: z.array(z.object({ registrationId: z.uuid(), name: z.string().min(1) })),
})

export type DivisionResult = z.infer<typeof divisionResultSchema>
export type SquadRow = z.infer<typeof squadRowSchema>

const sessionFields = {
  id: z.uuid(),
  date: localDateTimeSchema,
  complete: z.boolean(),
  /** Games each bowler bowls in the session. */
  games: z.number().int().nonnegative(),
}

export const squadResultsSchema = z.object({
  session: z.object({ ...sessionFields, kind: z.literal('squad') }),
  /** The squad's effective ratios (RES-03, D-43). */
  finalsRatio: z.number(),
  cashRatio: z.number(),
  /** Sorted by name (RES-10). A division with no entries is left out (D-77). */
  divisions: z.array(divisionResultSchema),
})

export type SquadResults = z.infer<typeof squadResultsSchema>

/** A placed bowler of a sweeper: one list, with the division and its bonus pins (RES-22, D-82). */
export const sweeperRowSchema = z.object({
  ...rowFields,
  group: z.enum(['casher', 'other']),
  divisionName: z.string(),
  /** The bonus pins per game of the bowler's division (SCR-09). */
  bonusPins: z.number().int(),
})

export type SweeperRow = z.infer<typeof sweeperRowSchema>

export const sweeperResultsSchema = z.object({
  session: z.object({ ...sessionFields, kind: z.literal('sweeper') }),
  cashRatio: z.number(),
  /** `N` (RES-22). */
  entries: z.number().int().nonnegative(),
  /** How many cash (RES-24). */
  cashers: z.number().int().nonnegative(),
  /** The last casher's total, `null` with no entries (RES-24). */
  cutScore: z.number().int().nullable(),
  rows: z.array(sweeperRowSchema),
})

export type SweeperResults = z.infer<typeof sweeperResultsSchema>
