import { comparePositions, parsePosition } from '../lanes/positions.ts'
import type { LaneEntry, LanePage } from '../lanes/types.ts'
import { crossLanes, lanesInUse } from '../recapSheets/cross.ts'
import type { Skip } from '../skip/store.ts'
import type { Game, GameBowler, GamesView } from './gamesTypes.ts'
import type { ScoreRow } from './types.ts'

/**
 * SCR-22, D-234: the session's bowlers grouped by the lane they bowl each game. A bowler's lane
 * for a game is the cross (`LAN-19`) from the saved start lane, the lanes in use (`LAN-18`), and
 * the session's skip, so a pair of lanes in game 2 holds bowlers who started on other pairs. Every
 * game lists every pair that has a bowler in it, in lane order, and bowlers in lane then letter
 * order (`LAN-04`). There are exactly `games` games and `games` columns of scores: a stored game
 * above the count is ignored (D-238). A score for a bowler who is not entered is ignored.
 */
export function buildGamesView(
  lanePage: LanePage,
  entries: readonly LaneEntry[],
  scores: readonly ScoreRow[],
  games: number,
  skip: Skip,
  flagged: ReadonlySet<string> = new Set(),
): GamesView {
  const bowlerOf = new Map(entries.map((entry) => [entry.registrationId, entry.bowlerId]))
  const storedOf = new Map<string, Map<number, number>>()
  for (const { bowlerId, game, score } of scores) {
    const byGame = storedOf.get(bowlerId) ?? new Map<number, number>()
    byGame.set(game, score)
    storedOf.set(bowlerId, byGame)
  }

  // `lanesInUse` skips a pair with no bowler, so a lane no bowler can reach is never looked up.
  const lanes = lanesInUse(lanePage.pairs)
  const pairOfLane = new Map(
    lanePage.pairs.flatMap((pair) => pair.lanes.map((lane) => [lane, pair])),
  )

  // One row per bowler with a lane: where they bowl each game, and their scores.
  const rows = lanePage.pairs.flatMap((pair) =>
    pair.bowlers.flatMap((bowler) => {
      const position = parsePosition(bowler.position)
      // A bowler in a pair always has a position that parses; this only narrows the type.
      if (!position) return []
      const bowlerId = bowlerOf.get(bowler.registrationId)
      const stored = bowlerId === undefined ? undefined : storedOf.get(bowlerId)
      const row = Array.from({ length: games }, (_, index) => stored?.get(index + 1) ?? null)
      return [
        {
          bowler,
          letter: position.letter,
          laneByGame: crossLanes(position.lane, lanes, games, skip),
          scores: row,
          total: row.reduce<number>((sum, score) => sum + (score ?? 0), 0),
        },
      ]
    }),
  )

  const byGame: Game[] = Array.from({ length: games }, (_, index) => {
    const game = index + 1
    const inPair = new Map<number, { lanes: number[]; firstLane: number; bowlers: Placed[] }>()
    for (const row of rows) {
      const lane = row.laneByGame[index]
      const pair = lane === undefined ? undefined : pairOfLane.get(lane)
      if (lane === undefined || !pair) continue
      const placed = inPair.get(pair.firstLane) ?? {
        firstLane: pair.firstLane,
        lanes: [...pair.lanes],
        bowlers: [],
      }
      placed.bowlers.push({ lane, row })
      inPair.set(pair.firstLane, placed)
    }
    const pairs = [...inPair.values()]
      .toSorted((a, b) => a.firstLane - b.firstLane)
      .map(({ firstLane, lanes: pairLanes, bowlers }) => ({
        firstLane,
        lanes: pairLanes,
        bowlers: bowlers
          .toSorted((a, b) =>
            comparePositions(
              { lane: a.lane, letter: a.row.letter },
              { lane: b.lane, letter: b.row.letter },
            ),
          )
          .map(({ lane, row }): GameBowler => ({
            registrationId: row.bowler.registrationId,
            name: row.bowler.name,
            divisionName: row.bowler.divisionName,
            lane: `${lane}${row.letter}`,
            score: row.scores[index] ?? null,
            scores: row.scores,
            total: row.total,
            dnf: flagged.has(row.bowler.registrationId),
          })),
      }))
    const everyone = pairs.flatMap((pair) => pair.bowlers)
    return {
      game,
      entered: everyone.filter((bowler) => bowler.score !== null).length,
      total: everyone.length,
      pairs,
    }
  })

  return {
    session: {
      id: lanePage.session.id,
      kind: lanePage.session.kind,
      date: lanePage.session.date,
      complete: lanePage.session.complete,
      games,
    },
    skip,
    games: byGame,
    withoutLane: lanePage.unassigned.length + lanePage.other.length,
  }
}

interface Placed {
  lane: number
  row: {
    bowler: LanePage['other'][number]
    letter: string
    scores: (number | null)[]
    total: number
  }
}
