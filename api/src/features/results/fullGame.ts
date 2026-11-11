import { toResultEntry, type ResultEntry } from './entries.ts'

/**
 * How results rank while games come in (D-239): `full-game` counts only the games every bowler of a
 * division (or of a sweeper) has, `live` counts every saved score, as `SCR-11` always did.
 */
export type RankMode = 'full-game' | 'live'

/** The games a bowler has in one run from game 1: a game with no stored score ends it. */
function run(entry: ResultEntry): number {
  const gap = entry.gameScores.indexOf(null)
  return gap === -1 ? entry.gameScores.length : gap
}

/**
 * RES-40, RES-55: the last full game of a group of entries, the fewest games any of them has. A DNF
 * bowler (D-248) is left out, so a bowler who walked off does not hold the group back; when every
 * entry is flagged none is left out. `undefined` for no entries.
 */
export function countedGames(
  entries: readonly ResultEntry[],
  flagged: ReadonlySet<string>,
  waiting: readonly { registrationId: string }[] = [],
): number | undefined {
  return fewestGames(
    [
      ...entries.map((entry) => ({ registrationId: entry.registrationId, games: run(entry) })),
      // An entered bowler with no score has bowled no game, so no game is full yet.
      ...waiting.map(({ registrationId }) => ({ registrationId, games: 0 })),
    ],
    flagged,
  )
}

/** The same rule over bare game counts, for a list that is not made of result entries. */
export function fewestGames(
  bowlers: readonly { registrationId: string; games: number }[],
  flagged: ReadonlySet<string>,
): number | undefined {
  const counting = bowlers.filter((bowler) => !flagged.has(bowler.registrationId))
  const from = counting.length > 0 ? counting : bowlers
  if (from.length === 0) return undefined
  return Math.min(...from.map((bowler) => bowler.games))
}

export interface Limited {
  entries: ResultEntry[]
  /** The counted games of each group, by group key. A group with no entries has none. */
  through: Map<string, number>
}

/**
 * RES-40 to RES-42: cut every entry to the counted games of its group, so the total, high game, and
 * tie-breakers use only those games. `gameScores` keeps every saved game, so the page can show
 * a game that is not counted yet. A sweeper is one group, a squad has one group for each division.
 * `waiting` are entered bowlers with no score: they hold their group back (a game is not full
 * until they bowl it), and are not in the answer. `waitingGroupOf` gives their group.
 */
export function limitToCountedGames(
  entries: readonly ResultEntry[],
  groupOf: (entry: ResultEntry) => string,
  flagged: ReadonlySet<string>,
  waiting: readonly { registrationId: string; divisionId: string }[] = [],
  waitingGroupOf: (waiter: { registrationId: string; divisionId: string }) => string = (waiter) =>
    waiter.divisionId,
): Limited {
  const groups = new Map<string, ResultEntry[]>()
  for (const entry of entries) {
    const key = groupOf(entry)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const waitingIn = new Map<string, { registrationId: string }[]>()
  for (const waiter of waiting) {
    const key = waitingGroupOf(waiter)
    waitingIn.set(key, [...(waitingIn.get(key) ?? []), waiter])
  }
  const through = new Map<string, number>()
  const limited = new Map<ResultEntry, ResultEntry>()
  for (const [key, members] of groups) {
    const counted = countedGames(members, flagged, waitingIn.get(key)) ?? 0
    through.set(key, counted)
    for (const entry of members) {
      const games = entry.gameScores
        .slice(0, counted)
        .filter((score): score is number => score !== null)
      limited.set(entry, toResultEntry({ ...entry, games }))
    }
  }
  return { entries: entries.map((entry) => limited.get(entry) ?? entry), through }
}
