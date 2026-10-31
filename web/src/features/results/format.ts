import { formatShortDay } from '../../shared/sessionFormat'
import type {
  AtLargeDivision,
  Decider,
  DivisionResult,
  SeedingDivision,
  SeedingRow,
  SquadRow,
  SuperSweeperResults,
  SuperSweeperRow,
  SweeperRow,
  Tie,
} from './types'

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

/**
 * The note under a bowler who ties across a line (D-14, D-16). `cutName` is what the cut line is
 * called on this page: at-large calls it the last at-large spot (D-93).
 */
export function formatTie(tie: Tie, cutName = 'cut line'): string {
  const line = tie.line === 'cut' ? cutName : 'cash line'
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

/** RES-25a: "Cash Line" after the last casher. The sweeper and the super sweeper both use it. */
export function sweeperItems<Row extends { group: SweeperRow['group'] }>(
  rows: readonly Row[],
): Item<Row>[] {
  const items: Item<Row>[] = []
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

/** "2 of 3" for a bowler who bowled 2 of the squad's 3 games. */
export function formatGamesOf(games: number, sessionGames: number): string {
  return `${games} of ${sessionGames}`
}

/** "Cut Line" after the last finalist (RES-20). */
export function seedingItems(rows: readonly SeedingRow[]): Item<SeedingRow>[] {
  const items: Item<SeedingRow>[] = []
  rows.forEach((row, index) => {
    items.push({ kind: 'row', row })
    if (row.group === 'finalist' && rows[index + 1]?.group !== 'finalist') {
      items.push({ kind: 'line', label: 'Cut Line' })
    }
  })
  return items
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "80 entries · 10 finals spots (ratio 8) · 8 advanced from squads · 2 at-large spots" (RES-12, RES-13). */
export function formatAtLargeSummary(division: AtLargeDivision, finalsRatio: number): string {
  return [
    plural(division.entries, 'entry', 'entries'),
    `${plural(division.totalSpots, 'finals spot', 'finals spots')} (ratio ${finalsRatio})`,
    `${division.squadAdvancers} advanced from squads`,
    plural(division.atLargeSpots, 'at-large spot', 'at-large spots'),
  ].join(' · ')
}

/** "10 finalists (8 from squads, 2 at-large) · 70 others" (RES-18). */
export function formatSeedingSummary(division: SeedingDivision): string {
  const others = division.rows.length - division.finalists
  return `${plural(division.finalists, 'finalist', 'finalists')} (${division.finalists - division.atLarge} from squads, ${division.atLarge} at-large) · ${plural(others, 'other', 'others')}`
}

/** The column heading of a sweeper in the super sweeper (D-90): "Fri 10/9". */
export function formatSweeperColumn(sweeper: SuperSweeperResults['sweepers'][number]): string {
  return formatShortDay(sweeper.date)
}

/** The tag on a super sweeper row (D-90). */
export function formatFlagTag(flag: SuperSweeperRow['flags'][number]): string {
  return flag.kind === 'missed' ? 'Missed a sweeper' : 'Did not finish a sweeper'
}

/** The note that names the sweeper behind a tag (D-90). A sweeper not in the list gives no note. */
export function formatFlagNote(
  flag: SuperSweeperRow['flags'][number],
  sweepers: SuperSweeperResults['sweepers'],
): string {
  const sweeper = sweepers.find((item) => item.id === flag.sweeperId)
  if (!sweeper) return ''
  const day = formatShortDay(sweeper.date)
  return flag.kind === 'missed'
    ? `Missed the ${day} sweeper. Scored 0 for ${plural(sweeper.games, 'game', 'games')}.`
    : `${day} sweeper: ${flag.gamesBowled} of ${sweeper.games} games. Scored 0 for the rest.`
}

/** The cell of one sweeper column: the total, or a dash while that sweeper is open and the bowler has no score. */
export function formatSweeperTotal(total: number | null): string {
  return total === null ? '\u2013' : String(total)
}
