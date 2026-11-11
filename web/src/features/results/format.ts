import { plural } from '../../shared/plural'
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

/** The score a bowler is measured against: 200 a game. */
export const PAR_PER_GAME = 200

/** "+192", "−12", or "EVEN": the total against 200 a game for the games bowled (the "+/−" column). */
export function formatPlusMinus(total: number, games: number): string {
  const difference = total - PAR_PER_GAME * games
  if (difference > 0) return `+${difference}`
  return difference === 0 ? 'EVEN' : `−${-difference}`
}

/** The sum of the games with a score. */
export function sum(scores: readonly (number | null)[]): number {
  return scores.reduce<number>((all, score) => all + (score ?? 0), 0)
}

/** How many game columns a table needs: the session's games, or more if a bowler has more scores. */
export function gameColumnCount(
  sessionGames: number,
  scoreLists: readonly (readonly (number | null)[])[],
) {
  return Math.max(sessionGames, ...scoreLists.map((scores) => scores.length))
}

/**
 * RES-46: the first game that is not full yet, when some bowler already has a score in it, with how
 * many bowlers do. `undefined` in live mode (`throughGame` is `null`) or when no one is ahead.
 */
export function pendingGame(
  scoreLists: readonly (readonly (number | null)[])[],
  throughGame: number | null,
): { game: number; have: number; of: number } | undefined {
  if (throughGame === null) return undefined
  const have = scoreLists.filter((scores) => (scores[throughGame] ?? null) !== null).length
  return have === 0 ? undefined : { game: throughGame + 1, have, of: scoreLists.length }
}

/** "Ranked through game 3. Game 4 has 2 of 8 scores." (RES-46). Empty when nothing is pending. */
export function formatThroughNote(
  throughGame: number | null,
  pending: ReturnType<typeof pendingGame>,
): string {
  if (throughGame === null || throughGame === 0) return ''
  const through = `Ranked through game ${throughGame}.`
  return pending
    ? `${through} Game ${pending.game} has ${pending.have} of ${plural(pending.of, 'score', 'scores')}.`
    : through
}

/** The label of the steady choice in the toggle: "Through game 3" (RES-45). */
export function formatThroughLabel(throughGame: number | null): string {
  return throughGame === null || throughGame === 0
    ? 'Through the last full game'
    : `Through game ${throughGame}`
}

/** A row's figure against 200 a game: its total and the games the total holds. */
interface Figure {
  total: number
  games: number
}

/** The row with the lowest total in a group: the one at the line (D-254). `null` for no one. */
function lowest<Row extends Figure & { group: string }>(
  rows: readonly Row[],
  group: Row['group'],
): Row | null {
  return rows
    .filter((row) => row.group === group)
    .reduce<Row | null>((low, row) => (low === null || row.total < low.total ? row : low), null)
}

/** The "+/−" figure of the row at a line, or `null` when no row is there (D-254). */
function lineFigure(row: Figure | null): string | null {
  return row === null ? null : formatPlusMinus(row.total, row.games)
}

/**
 * The cut and cash lines of a squad division as the "+/−" of the lowest row that advances and the
 * lowest that cashes (D-254), the figure the table shows after each name. The row holds the handicap
 * and only the games counted, so the figure does too.
 */
export function lineFigures(division: DivisionResult): { cut: string | null; cash: string | null } {
  return {
    cut: lineFigure(lowest(division.rows, 'advancer')),
    cash: lineFigure(lowest(division.rows, 'casher')),
  }
}

/** "Cut line +27 · Cash line +19" for the pinned heading of the TV page (D-254). */
export function formatLines(division: DivisionResult): string {
  const { cut, cash } = lineFigures(division)
  return [
    cut === null ? 'No cut line' : `Cut line ${cut}`,
    cash === null ? 'No cash line' : `Cash line ${cash}`,
  ].join(' · ')
}

/**
 * "Cash line +30" for a sweeper or the super sweeper: the "+/−" of its lowest casher (D-254). Empty
 * when no one cashes.
 */
export function formatCashLine(rows: readonly (Figure & { group: 'casher' | 'other' })[]): string {
  const figure = lineFigure(lowest(rows, 'casher'))
  return figure === null ? '' : `Cash line ${figure}`
}
