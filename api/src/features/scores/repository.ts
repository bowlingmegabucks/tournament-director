import type { ScoreRow } from './types.ts'

/**
 * What routes need from storage: every game score saved for one squad or sweeper (`SquadScores`).
 * Unsorted: `buildScorePage` matches them to bowlers. An unknown session gives an empty list, so
 * call this through a route that has checked the session.
 */
export interface ScoreRepository {
  listScores(sessionId: string): Promise<ScoreRow[]>
}

/** Scores stored with the session they belong to. */
export function createInMemoryScoreRepository(
  seed: { sessionId: string; score: ScoreRow }[],
): ScoreRepository {
  return {
    listScores: (sessionId) =>
      Promise.resolve(
        seed.filter((item) => item.sessionId === sessionId).map((item) => ({ ...item.score })),
      ),
  }
}
