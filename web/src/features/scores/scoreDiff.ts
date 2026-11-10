import type { ScoreBowler, ScorePage } from './types'

/** What a refetch changed on the Scores tab: who, and which games (D-237). */
export interface ScoreChange {
  /** Registration ids of the bowlers whose scores changed, in page order. */
  ids: string[]
  names: string[]
  /** Game numbers (from 1) where any score changed, ascending. */
  games: number[]
}

const everyone = (page: ScorePage): ScoreBowler[] => [
  ...page.pairs.flatMap((pair) => pair.bowlers),
  ...page.other,
]

/**
 * Which bowlers and games changed between two pages (SCR-18, D-237). Works on the scores, not on
 * object identity, so a refetch of the same scores says nothing: it is our own save coming back.
 * A bowler new to the page counts when they hold a score.
 */
export function diffScores(before: ScorePage, after: ScorePage): ScoreChange {
  const old = new Map(everyone(before).map((bowler) => [bowler.registrationId, bowler]))
  const change: ScoreChange = { ids: [], names: [], games: [] }
  const games = new Set<number>()
  for (const bowler of everyone(after)) {
    const was = old.get(bowler.registrationId)?.scores ?? []
    const changed = bowler.scores.flatMap((score, index) =>
      score === (was[index] ?? null) ? [] : [index + 1],
    )
    if (changed.length === 0) continue
    change.ids.push(bowler.registrationId)
    change.names.push(bowler.name)
    for (const game of changed) games.add(game)
  }
  change.games = [...games].toSorted((a, b) => a - b)
  return change
}

/** How many names the status line spells out before it says "and 2 more". */
const NAMES_SHOWN = 3

/** "Updated: Dana Rivers, Lee Park, game 2" for the status line, or `undefined` for no change. */
export function describeScoreChange(change: ScoreChange): string | undefined {
  if (change.names.length === 0) return undefined
  const shown = change.names.slice(0, NAMES_SHOWN).join(', ')
  const more = change.names.length - NAMES_SHOWN
  const who = more > 0 ? `${shown} and ${more} more` : shown
  const games = `${change.games.length === 1 ? 'game' : 'games'} ${change.games.join(', ')}`
  return `Updated: ${who}, ${games}`
}
