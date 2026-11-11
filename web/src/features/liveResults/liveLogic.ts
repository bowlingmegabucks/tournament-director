import { formatSessionDate } from '../../shared/sessionFormat'
import type {
  DivisionResult,
  LiveEvent,
  LiveResults,
  SquadResults,
  SuperSweeperResults,
  SweeperResults,
} from '../results/types'

/** What the overlay draws for a message (D-255): a lower third, the flash for a last game, or the official mark. */
export interface Announcement {
  variant: 'game' | 'last' | 'official'
  /** "Game 2 complete", "Final game complete", or "Results are official". */
  kicker: string
  /** "Open Division", "Sweeper", or "Squad · Sat 9:00 am" for an official one. */
  title: string
  /** The game that filled. An official announcement has none: it draws a check mark. */
  game?: number
}

/** One screen of the TV page: a squad division, a sweeper, or the super sweeper (D-242). */
export type LiveScreen =
  | { key: string; kind: 'squad'; results: SquadResults; division: DivisionResult }
  | { key: string; kind: 'sweeper'; results: SweeperResults }
  | { key: string; kind: 'super-sweeper'; results: SuperSweeperResults }

/**
 * The screens in the order the TV shows them (D-242): each squad division in turn, each sweeper,
 * then the super sweeper. A squad's divisions are already in name order.
 */
export function screensOf(feed: LiveResults): LiveScreen[] {
  const screens: LiveScreen[] = feed.sessions.flatMap((session): LiveScreen[] =>
    session.kind === 'squad'
      ? session.results.divisions.map((division) => ({
          key: `${session.results.session.id}/${division.id}`,
          kind: 'squad' as const,
          results: session.results,
          division,
        }))
      : [{ key: session.results.session.id, kind: 'sweeper' as const, results: session.results }],
  )
  if (feed.superSweeper) {
    screens.push({ key: 'super-sweeper', kind: 'super-sweeper', results: feed.superSweeper })
  }
  return screens
}

/** The heading over a screen: "Squad · Sat 9:00 am · Open", "Sweeper · Sat 6:00 pm". */
export function screenHeading(screen: LiveScreen): string {
  switch (screen.kind) {
    case 'squad':
      return `Squad · ${formatSessionDate(screen.results.session.date)} · ${screen.division.name}`
    case 'sweeper':
      return `Sweeper · ${formatSessionDate(screen.results.session.date)}`
    case 'super-sweeper':
      return 'Super sweeper'
  }
}

/** Whether the screen's results are still open: they say "Unofficial" (D-84, D-88, D-242). */
export function isUnofficial(screen: LiveScreen): boolean {
  return screen.kind === 'super-sweeper'
    ? !screen.results.complete
    : !screen.results.session.complete
}

/** The games a screen is ranked through, `null` when it names none. */
export function screenThrough(screen: LiveScreen): number | null {
  switch (screen.kind) {
    case 'squad':
      return screen.division.throughGame
    case 'sweeper':
      return screen.results.throughGame
    case 'super-sweeper':
      return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * A message of the tournament stream as the page uses it (RES-49, D-243), or `undefined` for a kind
 * the TV does not handle or a detail that is not what the API sends. A message with no readable
 * detail still means "something changed", so the caller refetches in that case.
 */
export function parseLiveEvent(kind: string, detail: unknown): LiveEvent | undefined {
  if (kind !== 'game-full' && kind !== 'reopened' && kind !== 'scored' && kind !== 'complete') {
    return undefined
  }
  if (!isRecord(detail)) return undefined
  const { sessionId, sessionKind, divisionId, divisionName, game } = detail
  if (typeof sessionId !== 'string') return undefined
  if (sessionKind !== 'squad' && sessionKind !== 'sweeper') return undefined
  return {
    kind,
    detail: {
      sessionId,
      sessionKind,
      ...(typeof divisionId === 'string' ? { divisionId } : {}),
      ...(typeof divisionName === 'string' ? { divisionName } : {}),
      ...(typeof game === 'number' ? { game } : {}),
    },
  }
}

/**
 * The words of the strip for one message (D-245): "Open Division – Game 3 complete", "Sweeper –
 * Game 2 complete", "Session complete – results are official". No squad name: one squad runs at a time.
 * A `reopened` message says nothing: a clear is usually corrected at once. A `scored` message (a
 * score that filled no game) says nothing either; it only refreshes its division.
 */
export function noticeText(event: LiveEvent, feed: LiveResults | undefined): string | undefined {
  const { sessionKind, game } = event.detail
  if (event.kind === 'complete') return 'Session complete – results are official'
  if (event.kind !== 'game-full' || game === undefined) return undefined
  if (sessionKind === 'sweeper') return `Sweeper – Game ${game} complete`
  return `${divisionLabel(event, feed)} – Game ${game} complete`
}

/** "Open Division" for a squad's division, from the API's name or else the feed. */
function divisionLabel(event: LiveEvent, feed: LiveResults | undefined): string {
  const { divisionId } = event.detail
  // The API names the division; the feed is the fallback for a message from an older server.
  const fromFeed = feed?.sessions
    .flatMap((session) => (session.kind === 'squad' ? session.results.divisions : []))
    .find((candidate) => candidate.id === divisionId)?.name
  const name = event.detail.divisionName ?? fromFeed
  // A division already called "... Division" does not get the word twice.
  return name ? (/division$/i.test(name) ? name : `${name} Division`) : 'Division'
}

/** "Results are official" for a squad or sweeper that completed, named by its time from the feed. */
function officialAnnouncement(
  event: LiveEvent,
  feed: LiveResults | undefined,
): Announcement | undefined {
  const { sessionId, sessionKind } = event.detail
  const date = feed?.sessions.find((session) => session.results.session.id === sessionId)?.results
    .session.date
  const label = sessionKind === 'sweeper' ? 'Sweeper' : 'Squad'
  return {
    variant: 'official',
    kicker: 'Results are official',
    title: date ? `${label} · ${formatSessionDate(date)}` : label,
  }
}

/**
 * What the overlay draws for a game that filled (D-255): a lower third, or the full-screen flash for
 * the last game of the squad or sweeper, and the official mark when a session completes. `undefined`
 * for any other message. The session's games come
 * from the feed; a session the feed does not hold yet gets the lower third.
 */
export function announcementOf(
  event: LiveEvent,
  feed: LiveResults | undefined,
): Announcement | undefined {
  const { sessionId, sessionKind, game } = event.detail
  if (event.kind === 'complete') return officialAnnouncement(event, feed)
  if (event.kind !== 'game-full' || game === undefined) return undefined
  const games = feed?.sessions.find((session) => session.results.session.id === sessionId)?.results
    .session.games
  const last = games !== undefined && game >= games
  return {
    variant: last ? 'last' : 'game',
    kicker: last ? 'Final game complete' : `Game ${game} complete`,
    title: sessionKind === 'sweeper' ? 'Sweeper' : divisionLabel(event, feed),
    game,
  }
}

/**
 * The feed with one division of one squad swapped for a newer one (D-244), or `undefined` when the
 * squad or the division is not in the feed, so the caller loads the whole feed instead.
 */
export function replaceDivision(
  feed: LiveResults,
  sessionId: string,
  replacement: DivisionResult,
): LiveResults | undefined {
  let found = false
  const sessions = feed.sessions.map((session) => {
    if (session.kind !== 'squad' || session.results.session.id !== sessionId) return session
    const divisions = session.results.divisions.map((division) => {
      if (division.id !== replacement.id) return division
      found = true
      return replacement
    })
    return { ...session, results: { ...session.results, divisions } }
  })
  return found ? { ...feed, sessions } : undefined
}

/** "3:41 pm" for an ISO time, in the viewer's own zone (the TV sits at the center). */
export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', ' am')
    .replace(' PM', ' pm')
}
