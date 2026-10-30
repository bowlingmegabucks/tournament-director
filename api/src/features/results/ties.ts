import type { ResultEntry } from './entries.ts'
import { compareEntries, decidedBy, rankEntries, type Decider } from './ranking.ts'
import type { DivisionOutcome } from './squadResults.ts'

/**
 * D-14, D-16: a bowler on either side of a line who shares the total of the last bowler above it.
 * `won` is above the line and `lost` below it, with the tie-breaker that decided it. `full` means
 * every tie-breaker was equal and the director picks (`decidedBy` is then `null`).
 */
export interface Tie {
  line: 'cut' | 'cash'
  outcome: 'won' | 'lost' | 'full'
  decidedBy: Decider | null
}

function add(marks: Map<string, Tie[]>, entry: ResultEntry, tie: Tie) {
  marks.set(entry.registrationId, [...(marks.get(entry.registrationId) ?? []), tie])
}

/**
 * Mark one line. `above` and `below` are the bowlers on each side in rank order. The ties are the
 * bowlers on both sides whose total equals the last bowler above the line. When the best of them
 * below the line outranks the last bowler above it, the line was set by the earlier-advancer rule
 * (D-81), not by a tie-breaker, so nothing is marked.
 */
function markLine(
  marks: Map<string, Tie[]>,
  line: Tie['line'],
  above: readonly ResultEntry[],
  below: readonly ResultEntry[],
) {
  const last = above.at(-1)
  if (!last) return
  const tiedBelow = below.filter((entry) => entry.total === last.total)
  const first = tiedBelow[0]
  if (!first || compareEntries(last, first) > 0) return

  for (const entry of above.filter((item) => item.total === last.total)) {
    const decider = decidedBy(entry, first)
    add(marks, entry, { line, outcome: decider ? 'won' : 'full', decidedBy: decider ?? null })
  }
  for (const entry of tiedBelow) {
    const decider = decidedBy(last, entry)
    add(marks, entry, { line, outcome: decider ? 'lost' : 'full', decidedBy: decider ?? null })
  }
}

/**
 * D-14, D-16: the tie marks of one division, by registration id. The number of advancers or
 * cashers never grows because of a tie. At the cut line an earlier advancer is not a competitor:
 * they cash by RES-08 whatever the tie-breakers say. Bowlers listed apart (D-75) are never marked.
 */
export function markTies(
  outcome: DivisionOutcome,
  advancedBefore: ReadonlySet<string>,
): Map<string, Tie[]> {
  const marks = new Map<string, Tie[]>()
  const competitors = rankEntries(
    [...outcome.cashers, ...outcome.others].filter((entry) => !advancedBefore.has(entry.bowlerId)),
  )
  markLine(marks, 'cut', outcome.advancers, competitors)
  markLine(marks, 'cash', outcome.cashers, outcome.others)
  return marks
}
