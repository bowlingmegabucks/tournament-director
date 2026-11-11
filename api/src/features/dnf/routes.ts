import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { FindSession } from '../lanes/loadLanePage.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { LiveNotifier } from '../results/liveEvents.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import type { DnfStore } from './store.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid(), registrationId: z.uuid() })

export interface DnfRouterDeps {
  live: LiveNotifier
  store: DnfStore
  findSession: FindSession
  tournaments: TournamentRepository
  lanes: LaneRepository
  scores: ScoreRepository
  events: SessionEvents
  logger: Logger
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/scores` and `/sweepers/:sessionId/scores` for
 * `PUT` and `DELETE /:registrationId/dnf`, behind `scores.write`; the API key cannot reach them
 * (SCR-24, D-248, D-249, D-96). Web only: the legacy API has no such route (D-09). Mount it before
 * the score routes, or `dnf` reads as a game number.
 *
 * A flag can be set or removed on an open session only (409 otherwise, as D-231), and set only for a
 * bowler with a saved score. Both answer 204, and a repeat changes nothing. A change tells every
 * screen of the session, which also drops the cached results (D-232).
 */
export function createDnfRouter(
  kind: 'squad' | 'sweeper',
  { live, store, findSession, tournaments, lanes, scores, events, logger }: DnfRouterDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'

  async function change(
    req: { params: unknown },
    res: Parameters<typeof requestLogger>[0],
    flag: boolean,
  ) {
    const { id, sessionId, registrationId } = params.parse(req.params)
    const tournament = await tournaments.getSettings(id)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    const session = await findSession(id, sessionId)
    if (!session) throw new HttpError(404, `${label} not found`)

    const ids = {
      actorId: callerOf(res).user?.id,
      tournamentId: id,
      [`${kind}Id`]: sessionId,
      registrationId,
    }
    const log = requestLogger(res, logger)
    if (tournament.completed || session.complete) {
      log.info(ids, `DNF change refused: ${kind} or tournament complete`)
      throw new HttpError(409, `This ${kind} is complete. Did not finish cannot change.`)
    }
    const entry = (await lanes.listEntries(sessionId)).find(
      (candidate) => candidate.registrationId === registrationId,
    )
    if (!entry) throw new HttpError(404, `Bowler is not registered for this ${kind}`)

    if (flag) {
      const stored = await scores.listScores(sessionId)
      if (!stored.some((row) => row.bowlerId === entry.bowlerId)) {
        log.info(ids, 'DNF change refused: no score')
        throw new HttpError(409, 'This bowler has no score yet, so there is nothing to finish.')
      }
    }
    const before = await live.before(id, kind, sessionId)
    let changed: boolean
    if (flag) {
      // The reads above give the messages; this write checks again inside one transaction, so a
      // Complete or a cleared score that landed since cannot leave a flag behind (D-249).
      const outcome = await store.setIfOpen({ tournamentId: id, kind, sessionId, registrationId })
      if (outcome === 'complete') {
        log.info(ids, `DNF change refused: ${kind} or tournament complete`)
        throw new HttpError(409, `This ${kind} is complete. Did not finish cannot change.`)
      }
      if (outcome === 'no-score') {
        log.info(ids, 'DNF change refused: no score')
        throw new HttpError(409, 'This bowler has no score yet, so there is nothing to finish.')
      }
      changed = outcome === 'set'
    } else {
      changed = await store.clear(sessionId, registrationId)
    }
    if (changed) {
      log.info(ids, flag ? 'Did not finish set' : 'Did not finish cleared')
      // The counted games may move, so every open entry and scores page asks again.
      events.publish(sessionId, 'scores')
      await live.after(before)
    }
  }

  router.put('/:registrationId/dnf', async (req, res) => {
    await change(req, res, true)
    res.status(204).end()
  })

  router.delete('/:registrationId/dnf', async (req, res) => {
    await change(req, res, false)
    res.status(204).end()
  })

  return router
}
