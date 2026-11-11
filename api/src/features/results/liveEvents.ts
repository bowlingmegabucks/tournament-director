import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { liveKey } from '../../shared/events/sseRoute.ts'
import type { Logger } from '../../shared/logger.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { DnfStore } from '../dnf/store.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { ScoreCache } from '../scores/scoreCache.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import { buildResultEntries } from './entries.ts'
import { limitToCountedGames } from './fullGame.ts'

type SessionKind = 'squad' | 'sweeper'

/** The games counted before a change: one number for each division of a squad, or one for a sweeper. */
export interface LiveSnapshot {
  tournamentId: string
  kind: SessionKind
  sessionId: string
  counted: ReadonlyMap<string, number>
}

/**
 * Tells the TV page when a change moved its board (RES-49, D-243). A score save, a clear, or a DNF
 * flag can lift a division's last full game (or lower it). The route takes a snapshot before the
 * write and calls `after` once it is done; the notifier then publishes on the tournament stream, one
 * message for each division that changed.
 */
export interface LiveNotifier {
  /** The counted games before a change. `undefined` when nobody watches the tournament, or the read failed. */
  before(
    tournamentId: string,
    kind: SessionKind,
    sessionId: string,
  ): Promise<LiveSnapshot | undefined>
  /** Compare with the snapshot and publish. Never throws: a failed read is logged, not raised. */
  after(snapshot: LiveSnapshot | undefined): Promise<void>
  /** A session completed (RES-49): the TV refetches it, now official. */
  completed(tournamentId: string, kind: SessionKind, sessionId: string): void
}

export interface LiveNotifierDeps {
  events: SessionEvents
  cache: ScoreCache
  lanes: LaneRepository
  scores: ScoreRepository
  divisions: DivisionRepository
  dnf: DnfStore
  logger: Logger
}

/** The key of a sweeper in a snapshot: a sweeper is one group. */
// Stryker disable next-line StringLiteral: any text works as the key, as long as it is not a division id.
const SWEEPER = ''

export function createLiveNotifier({
  events,
  cache,
  lanes,
  scores,
  divisions,
  dnf,
  logger,
}: LiveNotifierDeps): LiveNotifier {
  /** The counted games of each group of one session, as a result page counts them (RES-40, RES-55). */
  async function read(tournamentId: string, kind: SessionKind, sessionId: string) {
    const [entries, stored, all, flagged] = await Promise.all([
      lanes.listEntries(sessionId),
      scores.listScores(sessionId),
      divisions.listByTournament(tournamentId),
      dnf.listFlagged([sessionId]),
    ])
    const built = buildResultEntries(entries, stored, all, () => 0)
    const { through } = limitToCountedGames(
      built.entries,
      kind === 'squad' ? (entry) => entry.divisionId : () => SWEEPER,
      flagged.get(sessionId) ?? new Set(),
    )
    return { through, names: new Map(all.map((division) => [division.id, division.name])) }
  }

  // Two keepers can save at once, so each snapshot may be older than the last write that landed.
  // Each session keeps the counts it last compared (`seen`) and compares one `after` at a time, so
  // a rise is published once and a rise a late snapshot missed is still published.
  const seen = new Map<string, ReadonlyMap<string, number>>()
  const queue = new Map<string, Promise<void>>()

  return {
    async before(tournamentId, kind, sessionId) {
      // Nobody on the TV page: the diff would go nowhere, so skip two reads of the whole session.
      // What was seen goes stale while nobody listens, so forget it.
      if (!events.watching(liveKey(tournamentId))) {
        seen.delete(sessionId)
        return undefined
      }
      try {
        const { through: counted } = await read(tournamentId, kind, sessionId)
        // The first snapshot of a quiet session is what was last seen, however late the others come.
        if (!seen.has(sessionId)) seen.set(sessionId, counted)
        return { tournamentId, kind, sessionId, counted }
      } catch (err) {
        logger.warn({ err, tournamentId, sessionId }, 'Could not read the counted games')
        return undefined
      }
    },

    after(snapshot) {
      if (!snapshot) return Promise.resolve()
      const { sessionId } = snapshot
      const run = (queue.get(sessionId) ?? Promise.resolve()).then(() => compare(snapshot))
      queue.set(sessionId, run)
      return run.finally(() => {
        if (queue.get(sessionId) === run) queue.delete(sessionId)
      })
    },

    completed(tournamentId, kind, sessionId) {
      cache.dropTournament(tournamentId)
      events.publish(liveKey(tournamentId), 'complete', { sessionId, sessionKind: kind })
    },
  }

  async function compare(snapshot: LiveSnapshot): Promise<void> {
    const { tournamentId, kind, sessionId } = snapshot
    try {
      const { through: now, names } = await read(tournamentId, kind, sessionId)
      const counted = seen.get(sessionId) ?? snapshot.counted
      seen.set(sessionId, now)
      const groups = new Set([...counted.keys(), ...now.keys()])
      const changes = [...groups].flatMap((group) => {
        const was = counted.get(group) ?? 0
        const game = now.get(group) ?? 0
        if (game === was) return []
        // Stryker disable next-line EqualityOperator: equal counts left the loop above, so `>` and `>=` agree.
        return [{ group, game, up: game > was }]
      })
      if (changes.length === 0) return
      // The feed holds the old boards: drop it before the message that tells the TV to ask again.
      cache.dropTournament(tournamentId)
      for (const { group, game, up } of changes) {
        events.publish(liveKey(tournamentId), up ? 'game-full' : 'reopened', {
          sessionId,
          sessionKind: kind,
          ...(group === SWEEPER ? {} : { divisionId: group }),
          ...(names.has(group) ? { divisionName: names.get(group) } : {}),
          ...(up ? { game } : {}),
        })
      }
    } catch (err) {
      logger.warn({ err, tournamentId, sessionId }, 'Could not tell the live results of a change')
    }
  }
}
