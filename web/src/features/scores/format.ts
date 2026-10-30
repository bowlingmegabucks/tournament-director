import type { ScorePage } from './types'

/** "3 bowlers have no lane." and "1 bowler has no lane." (D-71). */
export function formatNoLane(count: number): string {
  return count === 1 ? '1 bowler has no lane.' : `${count} bowlers have no lane.`
}

/** The bowlers listed on the page, with or without a lane position (D-71). */
export function countListed(page: ScorePage): number {
  return page.pairs.reduce((total, pair) => total + pair.bowlers.length, 0) + page.other.length
}
