import type { LanePage } from '../lanes/types.ts'
import { parsePosition } from '../lanes/positions.ts'
import { crossLanes, lanesInUse, type SkipPattern } from './cross.ts'
import type { RecapSheets } from './types.ts'

/**
 * RPT-05, RPT-05c, D-65: one sheet for each bowler with a saved lane, from the lane page the API
 * already builds. The pairs come in lane order and each pair sorts by letter (LAN-04), so the
 * sheets do too. Every cross works from the lanes in use across the whole session, whichever
 * sheets the desk later prints (D-64).
 */
export function buildRecapSheets(page: LanePage, games: number): RecapSheets {
  const lanes = lanesInUse(page.pairs)

  const sheets = page.pairs.flatMap((pair) =>
    pair.bowlers.flatMap((bowler) => {
      const position = parsePosition(bowler.position)
      // A bowler in a pair always has a position that parses; this only narrows the type.
      if (!position) return []
      const cross = (pattern: SkipPattern) =>
        crossLanes(position.lane, lanes, games, pattern).map((lane) => `${lane}${position.letter}`)
      return [
        {
          registrationId: bowler.registrationId,
          name: bowler.name,
          divisionName: bowler.divisionName,
          position: bowler.position,
          handicap: bowler.pins,
          cross: { staggered: cross('staggered'), same: cross('same') },
        },
      ]
    }),
  )

  return {
    session: {
      id: page.session.id,
      kind: page.session.kind,
      date: page.session.date,
      games,
      complete: page.session.complete,
    },
    sheets,
    withoutLane: page.unassigned.length + page.other.length,
  }
}
