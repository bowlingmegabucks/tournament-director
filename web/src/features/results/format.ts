import type { Decider, DivisionResult, SquadRow, SweeperRow, Tie } from './types'

/** 1st, 2nd, 3rd, 4th, ..., 11th, 12th, 13th, 21st. */
export function ordinal(value: number): string {
  const lastTwo = value % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th'
  return `${value}${suffix}`
}

/** What settled a tie, in words (D-14): "games bowled", "high game", "2nd-highest game". */
export function formatDecider(decider: Decider): string {
  if (decider.kind === 'games') return 'games bowled'
  return decider.rank === 1 ? 'high game' : `${ordinal(decider.rank)}-highest game`
}

/** The note under a bowler who ties across a line (D-14, D-16). */
export function formatTie(tie: Tie): string {
  const line = tie.line === 'cut' ? 'cut line' : 'cash line'
  if (tie.outcome === 'full' || !tie.decidedBy) {
    return `Full tie at the ${line}. The director decides.`
  }
  const result = tie.outcome === 'won' ? 'Won' : 'Lost'
  return `Tied on total at the ${line}. ${result} the spot on ${formatDecider(tie.decidedBy)}.`
}

/** A line between groups of rows (RES-11): the label is the text the legacy report prints. */
export type LineLabel = 'Cut Line' | 'Cash Line' | 'No Advancers'

export type Item<Row> = { kind: 'row'; row: Row } | { kind: 'line'; label: LineLabel }

/**
 * RES-11: "No Advancers" first when no one advances, "Cut Line" after the last advancer, and
 * "Cash Line" after the last casher. Rows arrive in display order with their group.
 */
export function squadItems(rows: readonly SquadRow[]): Item<SquadRow>[] {
  const items: Item<SquadRow>[] = []
  if (rows.length > 0 && !rows.some((row) => row.group === 'advancer')) {
    items.push({ kind: 'line', label: 'No Advancers' })
  }
  rows.forEach((row, index) => {
    items.push({ kind: 'row', row })
    const next = rows[index + 1]
    if (row.group === 'advancer' && next?.group !== 'advancer') {
      items.push({ kind: 'line', label: 'Cut Line' })
    }
    if (row.group === 'casher' && next?.group !== 'casher') {
      items.push({ kind: 'line', label: 'Cash Line' })
    }
  })
  return items
}

/** RES-25a: "Cash Line" after the last casher. */
export function sweeperItems(rows: readonly SweeperRow[]): Item<SweeperRow>[] {
  const items: Item<SweeperRow>[] = []
  rows.forEach((row, index) => {
    items.push({ kind: 'row', row })
    if (row.group === 'casher' && rows[index + 1]?.group !== 'casher') {
      items.push({ kind: 'line', label: 'Cash Line' })
    }
  })
  return items
}

/** "16 entries · Advancing 2 · Cashing 1". */
export function formatSummary(division: DivisionResult): string {
  const count = (group: SquadRow['group']) => division.rows.filter((r) => r.group === group).length
  const entries = division.entries === 1 ? '1 entry' : `${division.entries} entries`
  return `${entries} · Advancing ${count('advancer')} · Cashing ${count('casher')}`
}

/** "1 in 8" for a ratio of 8 or 7.5. */
export function formatRatio(ratio: number): string {
  return `1 in ${ratio}`
}

/** "2 of 3" for a bowler who bowled 2 of the squad's 3 games. */
export function formatGamesOf(games: number, sessionGames: number): string {
  return `${games} of ${sessionGames}`
}
