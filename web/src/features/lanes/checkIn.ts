import type { LaneBowler, LanePage } from './types'

export type CheckInOrder = 'lane' | 'name'

/** One printed row. `lane` is the seat (`5A`), or `''` when the bowler has none. */
export interface CheckInRow {
  registrationId: string
  /** `Last, First`, plus `, Suffix` (BWL-13): "Fontaine, Joe, Jr". */
  name: string
  lane: string
  divisionName: string
  average: number | null
  pins: number
  superSweeper: boolean
}

/** A run of rows under one heading. Lane order has a heading per pair; name order has one group. */
export interface CheckInGroup {
  key: string
  heading: string | undefined
  rows: CheckInRow[]
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/** Last name, first name, then suffix, so "Joe Fontaine" sorts before "Joe Fontaine, Jr". */
function compareNames(a: LaneBowler, b: LaneBowler): number {
  return (
    compareText(a.lastName, b.lastName) ||
    compareText(a.firstName, b.firstName) ||
    compareText(a.suffix, b.suffix) ||
    a.registrationId.localeCompare(b.registrationId)
  )
}

export function checkInName(bowler: Pick<LaneBowler, 'firstName' | 'lastName' | 'suffix'>): string {
  const name = `${bowler.lastName}, ${bowler.firstName}`
  return bowler.suffix === '' ? name : `${name}, ${bowler.suffix}`
}

function toRow(bowler: LaneBowler): CheckInRow {
  return {
    registrationId: bowler.registrationId,
    name: checkInName(bowler),
    lane: bowler.position,
    divisionName: bowler.divisionName,
    average: bowler.average,
    pins: bowler.pins,
    superSweeper: bowler.superSweeper,
  }
}

/** "Lanes 1-2", or "Lane 5" for a one-lane pair, as the lane page names it. */
function pairHeading(lanes: readonly number[]): string {
  const first = lanes[0]
  const last = lanes.at(-1)
  return first === undefined || first === last ? `Lane ${first ?? ''}` : `Lanes ${first}-${last}`
}

/**
 * The bowlers of a session for a check-in sheet. Lane order follows the pairs as the lane page
 * shows them (the API already sorts each pair by seat), then bowlers with no lane, then those
 * whose position fits no pair (D-61). Name order puts everyone in one list by last name, first
 * name, and suffix; a bowler with no lane shows a blank lane.
 */
export function buildCheckIn(page: LanePage, order: CheckInOrder): CheckInGroup[] {
  if (order === 'name') {
    const everyone = [
      ...page.pairs.flatMap((pair) => pair.bowlers),
      ...page.unassigned,
      ...page.other,
    ].toSorted(compareNames)
    return [{ key: 'all', heading: undefined, rows: everyone.map(toRow) }]
  }
  const groups: CheckInGroup[] = page.pairs
    .filter((pair) => pair.bowlers.length > 0)
    .map((pair) => ({
      key: `pair-${pair.firstLane}`,
      heading: pairHeading(pair.lanes),
      rows: pair.bowlers.map(toRow),
    }))
  if (page.other.length > 0) {
    groups.push({
      key: 'other',
      heading: 'Other positions',
      rows: page.other.toSorted(compareNames).map(toRow),
    })
  }
  if (page.unassigned.length > 0) {
    groups.push({
      key: 'none',
      heading: 'No lane',
      rows: page.unassigned.toSorted(compareNames).map(toRow),
    })
  }
  return groups
}
