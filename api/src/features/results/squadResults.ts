import type { ResultEntry } from './entries.ts'
import { rankEntries } from './ranking.ts'

export interface DivisionInput {
  /** Every entry of one division in one squad: bowlers with at least one stored score (RES-02). */
  entries: readonly ResultEntry[]
  /** Bowlers who advanced in an earlier squad of the tournament (RES-06). */
  advancedBefore: ReadonlySet<string>
  /** The squad's effective ratios (RES-03). Both must be above 0; the caller checks (D-83). */
  finalsRatio: number
  cashRatio: number
  /** Games each bowler bowls on the squad. */
  games: number
  complete: boolean
}

export interface DivisionOutcome {
  /** `N`: bowlers with a score. No-shows and bowlers who did not finish count (D-06, D-75). */
  entryCount: number
  /** `A` (RES-04). */
  advanceSpots: number
  /** `C`, the cash spots beyond the advancers (RES-05). The cashers can number more (RES-08). */
  cashSpots: number
  /** The last advancer's total. `undefined` when no one advances: there is no cut (D-81). */
  cutTotal: number | undefined
  /** Best first. These three lists hold every ranked bowler once. */
  advancers: ResultEntry[]
  cashers: ResultEntry[]
  others: ResultEntry[]
  /** D-75: on a complete squad, fewer games than the squad (and not a no-show). Not ranked. */
  didNotFinish: ResultEntry[]
  /** D-75: on a complete squad, every stored score is 0. Not ranked. */
  noShows: ResultEntry[]
}

const isNoShow = (entry: ResultEntry) => entry.games.every((score) => score === 0)

/**
 * RES-02 to RES-09, D-06, D-08, D-75, D-81: who advances, cashes, and misses out in one division of
 * one squad.
 *
 * `A = floor(N / finalsRatio)`. `C` is 1 when `A` is 0 (D-08), else `max(floor(N / cashRatio) - A, 0)`.
 * An earlier advancer ranks like anyone else but cannot take an advancing spot. The cashers are the
 * next `C` bowlers after the advancers, plus any earlier advancer at or above the cut (who would
 * have advanced), so there can be more than `C`. With fewer bowlers than spots, all of them take
 * one: no crash (the RES-08 defect).
 */
export function workOutDivision(input: DivisionInput): DivisionOutcome {
  const { entries, advancedBefore, finalsRatio, cashRatio, games, complete } = input
  const entryCount = entries.length

  // D-75: a complete squad lists these apart. An open squad ranks everyone (SCR-11).
  const noShows = complete ? entries.filter(isNoShow) : []
  const didNotFinish = complete
    ? entries.filter((entry) => !isNoShow(entry) && entry.games.length < games)
    : []
  const apart = new Set([...noShows, ...didNotFinish])
  const ranked = rankEntries(entries.filter((entry) => !apart.has(entry)))

  const advanceSpots = Math.floor(entryCount / finalsRatio)
  const cashSpots =
    advanceSpots === 0 ? 1 : Math.max(Math.floor(entryCount / cashRatio) - advanceSpots, 0)

  const advancers = ranked
    .filter((entry) => !advancedBefore.has(entry.bowlerId))
    .slice(0, advanceSpots)
  const cutTotal = advancers.at(-1)?.total

  const remaining = ranked.filter((entry) => !advancers.includes(entry))
  const cashing = new Set(remaining.slice(0, cashSpots))
  if (cutTotal !== undefined) {
    for (const entry of remaining) {
      if (advancedBefore.has(entry.bowlerId) && entry.total >= cutTotal) cashing.add(entry)
    }
  }

  return {
    entryCount,
    advanceSpots,
    cashSpots,
    cutTotal,
    advancers,
    cashers: remaining.filter((entry) => cashing.has(entry)),
    others: remaining.filter((entry) => !cashing.has(entry)),
    didNotFinish: rankEntries(didNotFinish),
    noShows: rankEntries(noShows),
  }
}
