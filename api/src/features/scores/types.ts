import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'

/**
 * One bowler on the Scores tab (SCR-13, D-69). `scores` has one entry per column; `null` is a game
 * with no score. `total` is the scratch sum of the scores present (D-68), 0 when there are none.
 * `position` is the stored text. `web/src/features/scores/types.ts` expects this shape. Change both
 * together. Not vendor-visible, and never the SSN, gender, birth date, average, or contact details
 * (BWL-17).
 */
export const scoreBowlerSchema = z.object({
  registrationId: z.uuid(),
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: z.string().min(1),
  divisionName: z.string(),
  position: z.string(),
  scores: z.array(z.number().int().nullable()),
  total: z.number().int(),
})

export type ScoreBowler = z.infer<typeof scoreBowlerSchema>

/** One lane pair that holds at least one bowler (D-73). */
export const scorePairSchema = z.object({
  firstLane: z.number().int(),
  lanes: z.array(z.number().int()),
  bowlers: z.array(scoreBowlerSchema),
})

export type ScorePair = z.infer<typeof scorePairSchema>

export const scorePageSchema = z.object({
  session: z.object({
    id: z.uuid(),
    kind: z.enum(['squad', 'sweeper']),
    date: localDateTimeSchema,
    complete: z.boolean(),
    /** Columns shown: the session's game count, or the highest stored game if that is more (D-69). */
    games: z.number().int().nonnegative(),
  }),
  pairs: z.array(scorePairSchema),
  /** Bowlers with no lane, who are not listed (D-71). */
  noLane: z.number().int().nonnegative(),
  /** Bowlers whose stored position fits no pair of this session (D-61, D-71). */
  other: z.array(scoreBowlerSchema),
})

export type ScorePage = z.infer<typeof scorePageSchema>

/** One stored game score (`SquadScores`), before it is matched to a bowler on the page. */
export interface ScoreRow {
  bowlerId: string
  game: number
  score: number
}
