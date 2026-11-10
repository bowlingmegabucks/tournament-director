import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'
import { skipSchema } from '../skip/store.ts'

/**
 * One bowler on a pair of lanes in one game (SCR-22, D-234). `lane` is the label for that game,
 * such as `13A` (LAN-19). `score` is that game's score, `null` for none; a stored 0 stays 0 (a
 * missed game, D-229). `scores` holds every game, so the sheet can show the earlier ones and warn
 * when a save would fill a gap. `web/src/features/scores/gamesTypes.ts` expects this shape. Change
 * both together. Not vendor-visible, and never the SSN, gender, birth date, address, email,
 * phone, average, or payments (BWL-17).
 */
export const gameBowlerSchema = z.object({
  registrationId: z.uuid(),
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: z.string().min(1),
  divisionName: z.string(),
  lane: z.string().min(1),
  score: z.number().int().nullable(),
  scores: z.array(z.number().int().nullable()),
  total: z.number().int(),
})

export type GameBowler = z.infer<typeof gameBowlerSchema>

/** A pair of lanes as bowled in one game. */
export const gamePairSchema = z.object({
  firstLane: z.number().int(),
  lanes: z.array(z.number().int()),
  bowlers: z.array(gameBowlerSchema),
})

export type GamePair = z.infer<typeof gamePairSchema>

export const gameSchema = z.object({
  game: z.number().int().positive(),
  /** Bowlers with a score in this game, and every bowler with a lane. */
  entered: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  pairs: z.array(gamePairSchema),
})

export type Game = z.infer<typeof gameSchema>

export const gamesViewSchema = z.object({
  session: z.object({
    id: z.uuid(),
    kind: z.enum(['squad', 'sweeper']),
    date: localDateTimeSchema,
    complete: z.boolean(),
    games: z.number().int().nonnegative(),
  }),
  skip: skipSchema,
  /** Exactly one per game 1 to `session.games` (D-238). */
  games: z.array(gameSchema),
  /** Bowlers with no lane, who cannot be entered (D-71). */
  withoutLane: z.number().int().nonnegative(),
})

export type GamesView = z.infer<typeof gamesViewSchema>
