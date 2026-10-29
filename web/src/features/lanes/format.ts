import type { LaneBowler, LanePage, LanePair, SessionKind } from './types'

/** "Lanes 1-2", or "Lane 5" for a pair with one lane (an odd lane count, LAN-03). */
export function formatPair(pair: Pick<LanePair, 'lanes'>): string {
  const first = pair.lanes[0]
  const last = pair.lanes.at(-1)
  if (first === undefined || last === undefined || first === last) return `Lane ${first ?? ''}`
  return `Lanes ${first}-${last}`
}

/** "3 of 5", and ", full" once the pair holds `capacity` (D-58). */
export function formatFill(pair: Pick<LanePair, 'bowlers' | 'capacity'>): string {
  const text = `${pair.bowlers.length} of ${pair.capacity}`
  return pair.bowlers.length >= pair.capacity ? `${text}, full` : text
}

/**
 * The line under a bowler's name (LAN-11): division, average, and handicap on a squad; division,
 * average, bonus pins, and super sweeper on a sweeper. `compact` leaves out the average, for the
 * narrow rows inside a pair.
 */
export function formatBowler(bowler: LaneBowler, kind: SessionKind, compact: boolean): string {
  const parts = [bowler.divisionName]
  if (!compact) parts.push(bowler.average === null ? 'no average' : `avg ${bowler.average}`)
  if (kind === 'squad') {
    parts.push(`hdcp ${bowler.pins}`)
  } else {
    parts.push(`+${bowler.pins} pins`, `super sweeper: ${bowler.superSweeper ? 'Y' : 'N'}`)
  }
  return parts.join(' · ')
}

/** The bowlers on the page, assigned or not, as the API sent them (LAN-10). */
export function countBowlers(page: LanePage): number {
  return (
    page.pairs.reduce((total, pair) => total + pair.bowlers.length, 0) +
    page.unassigned.length +
    page.other.length
  )
}

/** "20 bowlers, 4 need a lane" (LAN-10). */
export function formatTotals(page: LanePage): string {
  const total = countBowlers(page)
  const waiting = page.unassigned.length
  return `${total} ${total === 1 ? 'bowler' : 'bowlers'}, ${waiting} ${waiting === 1 ? 'needs' : 'need'} a lane`
}
