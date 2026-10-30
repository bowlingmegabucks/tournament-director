import { z } from 'zod'
import type { ScoreRow } from './types.ts'

// The read shape needs a bowler UUID, a game from 1, and a whole-number score (D-69). SCR-01 to
// SCR-04 run on save, not on read, so a stored 0 (a no-show) or a score past 300 still shows.
const rowSchema = z.object({
  bowlerId: z.uuid(),
  game: z.number().int().min(1),
  score: z.number().int(),
})

/** Check one stored score. The repository skips and logs a row that does not fit (D-69). */
export function toScoreRow(row: ScoreRow) {
  return rowSchema.safeParse(row)
}
