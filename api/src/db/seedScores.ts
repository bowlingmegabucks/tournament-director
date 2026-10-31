import type { PrismaClient } from '../shared/database.ts'
import { rowId } from './seedRegistrations.ts'
import { sessionId } from './seedSessions.ts'
import { samples as sampleTournaments } from './seedTournaments.ts'

// `bowler` is a registration sample number from `seedRegistrations`; `session` is `a1` (squad 1) or
// `b1` (sweeper 1), as in its `lanes`. Squad 1 is complete: everyone who bowled has every game, and
// bowler 2 is a no-show with the zeros Complete writes (SQD-15). Squad 2 is open, so its first pair
// is part scored: one bowler has two games, one has one, and one has none. Sweeper 1 is open with
// two of its three games in for one bowler. Sweeper 2 is complete (four games): the bowlers 1 and 3 are
// super sweeper bowlers, 1 with every game and 3 with two, and bowler 4 is a super sweeper bowler who
// missed it, so the super sweeper shows both tags (D-90). Scratch pins only (D-68).
const samples = [
  { session: 'a1', bowler: 1, games: [212, 198, 231] },
  { session: 'a1', bowler: 2, games: [0, 0, 0] },
  { session: 'a1', bowler: 3, games: [187, 204, 176] },
  { session: 'a1', bowler: 5, games: [245, 220, 199] },
  { session: 'a1', bowler: 7, games: [150, 162, 158] },
  { session: 'a2', bowler: 1, games: [210, 198] },
  { session: 'a2', bowler: 5, games: [245] },
  { session: 'b1', bowler: 1, games: [222, 201] },
  { session: 'b2', bowler: 1, games: [205, 198, 214, 220] },
  { session: 'b2', bowler: 3, games: [180, 175] },
]

/**
 * Put sample game scores on the sample squads and sweeper from `seedSessions`, for the bowlers from
 * `seedRegistrations` (run both first). Safe to run again: it sets the same scores. Local use only.
 */
export async function seedScores(client: PrismaClient): Promise<number> {
  const rows = sampleTournaments.flatMap(({ id }) =>
    samples.flatMap(({ session, bowler, games }) =>
      games.map((score, index) => ({
        bowlerId: rowId(id, 'e', bowler),
        squadId: sessionId(id, session.startsWith('a') ? 'a' : 'b', Number(session.slice(1))),
        game: index + 1,
        score,
      })),
    ),
  )
  await Promise.all(
    rows.map(
      ({ bowlerId, squadId, game, score }) =>
        client.$executeRaw`
      INSERT INTO SquadScores (BowlerId, SquadId, Game, Score)
      VALUES (${bowlerId}, ${squadId}, ${game}, ${score})
      ON DUPLICATE KEY UPDATE Score = VALUES(Score)`,
    ),
  )
  return rows.length
}
