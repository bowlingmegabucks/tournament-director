import { formatPair } from './format'
import type { LanePage } from './types'

/** What a refetch changed on the lane page: the pairs (by first lane) and the unassigned list. */
export interface PageChange {
  pairs: number[]
  unassigned: boolean
}

const key = (bowler: { registrationId: string; position: string }) =>
  `${bowler.registrationId}:${bowler.position}`

interface Seated {
  registrationId: string
  position: string
}

function sameBowlers(a: readonly Seated[], b: readonly Seated[]): boolean {
  return (
    a.length === b.length &&
    a.every((bowler, index) => {
      const other = b[index]
      // Stryker disable next-line ConditionalExpression: the lengths match, so `other` is there; the check only satisfies the type.
      return other !== undefined && key(bowler) === key(other)
    })
  )
}

/**
 * Which pairs and whether the unassigned list changed between two pages (LAN-21, D-218). Works on
 * who sits where, not on object identity. A pair counts when it gained, lost, or reseated a bowler.
 */
export function diffPages(before: LanePage, after: LanePage): PageChange {
  const old = new Map(before.pairs.map((pair) => [pair.firstLane, pair]))
  const pairs = after.pairs
    .filter((pair) => !sameBowlers(old.get(pair.firstLane)?.bowlers ?? [], pair.bowlers))
    .map((pair) => pair.firstLane)
  return { pairs, unassigned: !sameBowlers(before.unassigned, after.unassigned) }
}

/** "Updated: lanes 5-6, unassigned list" for the status line, or `undefined` for no change. */
export function describeChange(page: LanePage, change: PageChange): string | undefined {
  const parts = page.pairs
    .filter((pair) => change.pairs.includes(pair.firstLane))
    .map((pair) => formatPair(pair).toLowerCase())
  if (change.unassigned) parts.push('unassigned list')
  return parts.length > 0 ? `Updated: ${parts.join(', ')}` : undefined
}
