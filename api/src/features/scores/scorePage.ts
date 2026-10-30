import type { LaneEntry, LanePage } from '../lanes/types.ts'
import type { ScoreBowler, ScorePage, ScoreRow } from './types.ts'

/**
 * SCR-10, SCR-13, D-69, D-71, D-73: lay a session's saved scores over its lane page.
 *
 * Pairs come from the lane page (so the order is `LAN-04`) and a pair with no bowler is left out.
 * A bowler with no lane is only counted. Columns run from game 1 to the larger of `games` and the
 * highest game stored for a bowler on the page, so no stored score is hidden. A score for a bowler
 * who is not entered in the session is ignored.
 */
export function buildScorePage(
  lanePage: LanePage,
  entries: readonly LaneEntry[],
  scores: readonly ScoreRow[],
  games: number,
): ScorePage {
  const bowlerOf = new Map(entries.map((entry) => [entry.registrationId, entry.bowlerId]))
  const gamesOf = new Map<string, Map<number, number>>()
  for (const { bowlerId, game, score } of scores) {
    const byGame = gamesOf.get(bowlerId) ?? new Map<number, number>()
    byGame.set(game, score)
    gamesOf.set(bowlerId, byGame)
  }

  // The scores saved for a registration's bowler, if any.
  const storedFor = (registrationId: string) => {
    const bowlerId = bowlerOf.get(registrationId)
    return bowlerId === undefined ? undefined : gamesOf.get(bowlerId)
  }

  const shown = [...lanePage.pairs.flatMap((pair) => pair.bowlers), ...lanePage.other]
  let columns = games
  for (const { registrationId } of shown) {
    const stored = storedFor(registrationId)
    if (stored) columns = Math.max(columns, ...stored.keys())
  }

  function toBowler(bowler: LanePage['other'][number]): ScoreBowler {
    const stored = storedFor(bowler.registrationId)
    const row = Array.from({ length: columns }, (_, index) => stored?.get(index + 1) ?? null)
    return {
      registrationId: bowler.registrationId,
      name: bowler.name,
      divisionName: bowler.divisionName,
      position: bowler.position,
      scores: row,
      total: row.reduce<number>((sum, score) => sum + (score ?? 0), 0),
    }
  }

  return {
    session: {
      id: lanePage.session.id,
      kind: lanePage.session.kind,
      date: lanePage.session.date,
      complete: lanePage.session.complete,
      games: columns,
    },
    pairs: lanePage.pairs
      .filter((pair) => pair.bowlers.length > 0)
      .map(({ firstLane, lanes, bowlers }) => ({
        firstLane,
        lanes,
        bowlers: bowlers.map(toBowler),
      })),
    noLane: lanePage.unassigned.length,
    other: lanePage.other.map(toBowler),
  }
}
