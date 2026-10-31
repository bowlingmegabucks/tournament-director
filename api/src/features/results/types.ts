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

/**
 * The tournament-wide results (D-85): at-large, finals seeding, and the super sweeper. `complete` is
 * true only when the tournament has squads (or sweepers) and every one is complete; until then the
 * page says "Unofficial results" (D-84, D-88). Web only, never vendor-visible (D-09).
 */

/** RES-17: a bowler who took an at-large spot. */
export const atLargeRowSchema = z.object({
  registrationId: z.uuid(),
  name: z.string().min(1),
  place: z.number().int().min(1),
  /** The squad of the bowler's best entry (RES-14). */
  squadDate: localDateTimeSchema,
  total: z.number().int(),
  highGame: z.number().int(),
  /** The bowler cashed in a squad (RES-16, D-07). */
  previousCasher: z.boolean(),
  ties: z.array(tieSchema),
})

export const atLargeDivisionSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  name: z.string(),
  /** `E`, `S`, `Q` and the open spots (RES-12, RES-13). */
  entries: z.number().int().nonnegative(),
  totalSpots: z.number().int().nonnegative(),
  squadAdvancers: z.number().int().nonnegative(),
  atLargeSpots: z.number().int().nonnegative(),
  rows: z.array(atLargeRowSchema),
})

export const atLargeResultsSchema = z.object({
  complete: z.boolean(),
  /** The tournament's finals ratio (RES-12, D-86). */
  finalsRatio: z.number(),
  /** By name. A division with no entries is left out. */
  divisions: z.array(atLargeDivisionSchema),
})

export type AtLargeResults = z.infer<typeof atLargeResultsSchema>

/** RES-20: a finalist or, after the cut line, any other bowler. */
export const seedingRowSchema = z.object({
  registrationId: z.uuid(),
  name: z.string().min(1),
  seed: z.number().int().min(1),
  group: z.enum(['finalist', 'other']),
  /** The squad of the bowler's best entry (RES-19, D-92). */
  squadDate: localDateTimeSchema,
  total: z.number().int(),
  highGame: z.number().int(),
  /** The handicap per game of that entry (D-92). */
  handicap: z.number().int(),
  previousCasher: z.boolean(),
  ties: z.array(tieSchema),
})

export const seedingDivisionSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  name: z.string(),
  entries: z.number().int().nonnegative(),
  finalists: z.number().int().nonnegative(),
  /** How many of the finalists took at-large spots. */
  atLarge: z.number().int().nonnegative(),
  /** RES-11a: someone in the division has a handicap above 0. */
  showHandicap: z.boolean(),
  rows: z.array(seedingRowSchema),
})

export const seedingResultsSchema = z.object({
  complete: z.boolean(),
  finalsRatio: z.number(),
  divisions: z.array(seedingDivisionSchema),
})

export type SeedingResults = z.infer<typeof seedingResultsSchema>

/** D-90: why a super sweeper row carries a tag. */
export const sweeperFlagSchema = z.object({
  kind: z.enum(['missed', 'unfinished']),
  sweeperId: z.uuid(),
  gamesBowled: z.number().int().nonnegative(),
})

export const superSweeperRowSchema = z.object({
  ...rowFields,
  group: z.enum(['casher', 'other']),
  divisionName: z.string(),
  /** One total per entry of `sweepers`, in that order. `null`: still open, no score yet (D-90). */
  sweeperTotals: z.array(z.number().int().nullable()),
  flags: z.array(sweeperFlagSchema),
})

export type SuperSweeperRow = z.infer<typeof superSweeperRowSchema>

export const superSweeperResultsSchema = z.object({
  complete: z.boolean(),
  cashRatio: z.number(),
  entries: z.number().int().nonnegative(),
  cashers: z.number().int().nonnegative(),
  cutScore: z.number().int().nullable(),
  /** In date order: one column each (D-90). */
  sweepers: z.array(
    z.object({
      id: z.uuid(),
      date: localDateTimeSchema,
      games: z.number().int(),
      complete: z.boolean(),
    }),
  ),
  rows: z.array(superSweeperRowSchema),
})

export type SuperSweeperResults = z.infer<typeof superSweeperResultsSchema>
