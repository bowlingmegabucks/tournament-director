/** One score to write: a bowler's game and its pins. */
export interface ScoreWrite {
  game: number
  score: number
}

/** What the plan needs to know, read inside the writer's transaction (D-228). */
export interface ScoreFacts {
  kind: 'squad' | 'sweeper'
  tournamentComplete: boolean
  sessionComplete: boolean
  /** The session's games: a squad's are the tournament's, a sweeper's its own (D-238). */
  games: number
  /** The bowler's stored scores in this session, in any order. */
  stored: readonly ScoreWrite[]
}

/** The bowler's scores after the plan: one entry per game, `null` for none. */
export type ScoreColumns = (number | null)[]

export type ScorePlan =
  /** 400: the score or the game is not allowed. */
  | { type: 'invalid'; message: string }
  /** 409: a complete session or tournament, or a clear that would leave a gap. */
  | { type: 'refused'; message: string }
  /** 404: a clear of a game with no score. */
  | { type: 'missing'; message: string }
  /** 200, nothing to write: the same score is already stored. */
  | { type: 'unchanged'; scores: ScoreColumns }
  /** Write `writes` (the score, and a 0 for each empty game before it, D-229); `filled` lists those games. */
  | { type: 'save'; writes: ScoreWrite[]; filled: number[]; scores: ScoreColumns }
  /** Delete the score of `game`. */
  | { type: 'clear'; game: number; scores: ScoreColumns }

export const MIN_SCORE = 1
export const MAX_SCORE = 300

const sessionName = (kind: ScoreFacts['kind']) => (kind === 'squad' ? 'squad' : 'sweeper')

function columns(facts: ScoreFacts): ScoreColumns {
  const byGame = new Map(facts.stored.map(({ game, score }) => [game, score]))
  return Array.from({ length: facts.games }, (_, index) => byGame.get(index + 1) ?? null)
}

/** D-231, D-10: a complete tournament, or a complete squad or sweeper, takes no change. */
function lockedMessage(facts: ScoreFacts): string | undefined {
  if (facts.tournamentComplete) return 'This tournament is complete. Scores cannot change.'
  if (facts.sessionComplete) {
    const name = sessionName(facts.kind)
    return `This ${name} is complete. Scores cannot change.`
  }
  return undefined
}

function gameProblem(facts: ScoreFacts, game: number): string | undefined {
  if (!Number.isInteger(game) || game < 1 || game > facts.games) {
    return `Game must be from 1 to ${facts.games}.`
  }
  return undefined
}

/**
 * SCR-01, SCR-02, SCR-03, SCR-04, SCR-14, D-228, D-229, D-231, D-238: what saving one score does.
 * The score is a whole number from 1 to 300 (0 is only written as a fill, below, or by Complete).
 * The game is 1 to the session's games. Games before it that hold no score are saved as 0 in the
 * same save, so a late bowler or a missed game leaves no gap. A real score may replace a filled 0.
 * The same score again changes nothing. Nothing else of the session is touched: a bad entry cannot
 * delete another score (the SCR-05 and SCR-06 defect).
 */
export function planSave(facts: ScoreFacts, game: number, score: number): ScorePlan {
  const locked = lockedMessage(facts)
  if (locked) return { type: 'refused', message: locked }
  const badGame = gameProblem(facts, game)
  if (badGame) return { type: 'invalid', message: badGame }
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    return { type: 'invalid', message: `Enter a score from ${MIN_SCORE} to ${MAX_SCORE}.` }
  }

  const before = columns(facts)
  if (before[game - 1] === score) return { type: 'unchanged', scores: before }

  const filled: number[] = []
  for (let earlier = 1; earlier < game; earlier++) {
    if (before[earlier - 1] === null) filled.push(earlier)
  }
  const writes: ScoreWrite[] = [
    ...filled.map((earlier) => ({ game: earlier, score: 0 })),
    { game, score },
  ]
  const scores = before.map((current, index) => {
    const write = writes.find((candidate) => candidate.game === index + 1)
    return write ? write.score : current
  })
  return { type: 'save', writes, filled, scores }
}

/**
 * SCR-06, D-228, D-229, D-231: what clearing one score does. Only the score of that game goes. A
 * clear that would leave a gap before a later game is refused, so the keeper clears from the last
 * game back; a game with no score is not found.
 */
export function planClear(facts: ScoreFacts, game: number): ScorePlan {
  const locked = lockedMessage(facts)
  if (locked) return { type: 'refused', message: locked }
  const badGame = gameProblem(facts, game)
  if (badGame) return { type: 'invalid', message: badGame }

  const before = columns(facts)
  if (before[game - 1] === null) return { type: 'missing', message: 'No score to clear.' }
  const later = before.findLastIndex((score) => score !== null) + 1
  if (later > game) return { type: 'refused', message: `Clear game ${later} first.` }

  const scores = before.map((current, index) => (index + 1 === game ? null : current))
  return { type: 'clear', game, scores }
}

/** The plan a change asks for: a save when it holds a score, a clear when it does not (D-228). */
export function planChange(facts: ScoreFacts, input: { game: number; score?: number }): ScorePlan {
  return input.score === undefined
    ? planClear(facts, input.game)
    : planSave(facts, input.game, input.score)
}

/** The scratch sum of the scores present (D-68), 0 when there are none. */
export function totalOf(scores: ScoreColumns): number {
  return scores.reduce<number>((sum, score) => sum + (score ?? 0), 0)
}
