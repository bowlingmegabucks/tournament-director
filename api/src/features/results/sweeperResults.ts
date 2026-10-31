import type { ResultEntry } from './entries.ts'
import { rankEntries } from './ranking.ts'

export interface SweeperOutcome {
  /** `N`: every bowler with a score in the sweeper (RES-22). */
  entryCount: number
  /** `max(floor(N / cashRatio), 1)`, and never more than `N` (RES-24). 0 with no entries. */
  cashCount: number
  /** Best first. */
  cashers: ResultEntry[]
  others: ResultEntry[]
  /** The last casher's total (RES-24). `null` with no entries. */
  cutScore: number | null
}

/**
 * RES-22 to RES-24, SCR-09, SCR-11: one list for the whole sweeper. Divisions only set the bonus
 * pins, which are already in each entry's total. The top `max(floor(N / cashRatio), 1)` cash. The
 * ratio must be above 0; the caller checks (D-83). A sweeper has no did-not-finish sections (D-75):
 * a bowler with fewer games ranks lower by SCR-11 and nothing more.
 */
export function workOutSweeper(entries: readonly ResultEntry[], cashRatio: number): SweeperOutcome {
  const ranked = rankEntries(entries)
  const entryCount = ranked.length
  // With no entries the cap makes it 0.
  const cashCount = Math.min(Math.max(Math.floor(entryCount / cashRatio), 1), entryCount)
  const cashers = ranked.slice(0, cashCount)
  return {
    entryCount,
    cashCount,
    cashers,
    others: ranked.slice(cashCount),
    cutScore: cashers.at(-1)?.total ?? null,
  }
}
