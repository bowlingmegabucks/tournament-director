import type { Division } from '../divisions/types.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { ScoreRow } from '../scores/types.ts'
import { isUnverified } from './inUse.ts'

/**
 * How many handicap bowlers of one squad or sweeper have a score and an average no director
 * checked (AVG-18, D-297). Completing the session freezes results built on those averages, so the
 * desk is told first. A bowler with no score has not bowled on the number yet.
 */
export function countUnverifiedBowlers(
  entries: readonly LaneEntry[],
  scores: readonly ScoreRow[],
  divisions: readonly Division[],
): number {
  const handicapDivisions = new Set(
    divisions
      .filter((division) => division.handicapPercentage !== null)
      .map((division) => division.id),
  )
  const scored = new Set(scores.map((score) => score.bowlerId))
  return entries.filter(
    (entry) =>
      scored.has(entry.bowlerId) &&
      isUnverified(entry.averageStatus, handicapDivisions.has(entry.divisionId)),
  ).length
}
