import type { ResultEntry } from './entries.ts'

/**
 * What separated two entries after the total: the number of games, or the Nth best game.
 * Rank 1 is the high game with pins, rank 2 the 2nd-best scratch game, and so on (SCR-11).
 */
export type Decider = { kind: 'games' } | { kind: 'game'; rank: number }

interface Difference {
  criterion: 'total' | Decider
  /** The entry that ranks higher. */
  ahead: ResultEntry
}

/** The first of the SCR-11 steps on which two entries differ, or `undefined` for a full tie. */
function firstDifference(a: ResultEntry, b: ResultEntry): Difference | undefined {
  if (a.games.length !== b.games.length) {
    return { criterion: { kind: 'games' }, ahead: a.games.length > b.games.length ? a : b }
  }
  if (a.total !== b.total) return { criterion: 'total', ahead: a.total > b.total ? a : b }
  if (a.highGame !== b.highGame) {
    return { criterion: { kind: 'game', rank: 1 }, ahead: a.highGame > b.highGame ? a : b }
  }
  // Games are equal, so both lists have the same length. Step 4 compares scratch games from the 2nd best.
  for (let index = 1; index < a.best.length; index++) {
    const mine = a.best[index] ?? 0
    const theirs = b.best[index] ?? 0
    if (mine !== theirs) {
      return { criterion: { kind: 'game', rank: index + 1 }, ahead: mine > theirs ? a : b }
    }
  }
  return undefined
}

/**
 * SCR-11: negative when `a` ranks above `b`, positive when below, 0 for a full tie. More games
 * first, then the higher total, the higher high game, and the higher 2nd-best game and on.
 */
export function compareEntries(a: ResultEntry, b: ResultEntry): number {
  const difference = firstDifference(a, b)
  if (!difference) return 0
  return difference.ahead === a ? -1 : 1
}

/**
 * D-14: which tie-breaker separated two entries with the same total. `undefined` is a full tie
 * (D-16). Ask only about entries whose totals are equal.
 */
export function decidedBy(a: ResultEntry, b: ResultEntry): Decider | undefined {
  const difference = firstDifference(a, b)
  return difference && difference.criterion !== 'total' ? difference.criterion : undefined
}

// Ignores case and accents, as the database collation does (BWL-14).
function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/**
 * SCR-11, SCR-12: best first. A full tie has no defined order in legacy (D-16); the new app keeps
 * it stable by last name, first name, then registration id, so the page does not shuffle on a refresh.
 */
export function rankEntries(entries: readonly ResultEntry[]): ResultEntry[] {
  return entries.toSorted(
    (a, b) =>
      compareEntries(a, b) ||
      compareText(a.lastName, b.lastName) ||
      compareText(a.firstName, b.firstName) ||
      a.registrationId.localeCompare(b.registrationId),
  )
}
