import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { ConflictError, FieldErrorsError, HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { jsonBodyUpTo } from '../../shared/jsonBody.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { planNoShow, type NoShowDeps, type Request as PlanRequest } from './loadPreview.ts'
import type { NoShowStore } from './store.ts'
import { applyRequestSchema, previewRequestSchema } from './types.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid(), registrationId: z.uuid() })

const jsonBody = jsonBodyUpTo('10kb')

const changedMessage = 'This changed since you reviewed it. Check it again.'

export interface NoShowHooks {
  /** After a save: drop cached pages, then tell the screens. */
  saved(change: { tournamentId: string; sessionIds: string[]; payoutNotes: number }): void
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId`, behind
 * `entries.override` (NSH-01). Web only. `planNoShow` decides; this turns its answer into HTTP.
 */
export function createNoShowRouter(
  deps: NoShowDeps,
  store: NoShowStore,
  hooks: NoShowHooks,
  logger: Logger,
): Router {
  const router = Router({ mergeParams: true })

  async function plan(res: Parameters<typeof requestLogger>[0], request: PlanRequest) {
    try {
      return await planNoShow(deps, request)
    } catch (error) {
      if (error instanceof FieldErrorsError) {
        requestLogger(res, logger).warn(
          {
            actorId: callerOf(res).user?.id,
            tournamentId: request.tournamentId,
            squadId: request.squadId,
            registrationId: request.registrationId,
            reasons: Object.keys(error.errors),
          },
          'No-show change refused',
        )
      }
      throw error
    }
  }

  router.post('/preview', jsonBody, async (req, res) => {
    const { id, sessionId, registrationId } = params.parse(req.params)
    const choice = previewRequestSchema.parse(req.body)
    const { preview } = await plan(res, {
      tournamentId: id,
      squadId: sessionId,
      registrationId,
      choice,
    })
    res.json({ preview })
  })

  router.post('/', jsonBody, async (req, res) => {
    const { id, sessionId, registrationId } = params.parse(req.params)
    const { version, ...choice } = applyRequestSchema.parse(req.body)
    const actorId = callerOf(res).user?.id
    // `entries.override` is never an API key permission, so there is always a user.
    if (!actorId) throw new HttpError(403, 'You do not have permission to do this.')
    const request = { tournamentId: id, squadId: sessionId, registrationId, choice }
    const planned = await plan(res, request)
    if (planned.preview.version !== version) {
      throw new ConflictError(changedMessage, { preview: planned.preview })
    }
    if ((await store.apply({ ...planned.command, actorId })) === 'changed') {
      throw new ConflictError(changedMessage, { preview: (await plan(res, request)).preview })
    }

    const { command, sessionIds } = planned
    // There is no audit table: this line is the trail (NSH-14). Ids and counts only.
    requestLogger(res, logger).info(
      {
        actorId,
        tournamentId: id,
        squadId: sessionId,
        targetSquadId: command.targetSquadId,
        registrationId,
        registrationDeleted: command.deleteRegistration,
        keptAdvancing: command.keepAdvancing,
        payoutIds: planned.preview.payouts.map((item) => item.payoutId),
        notesWritten: command.notes.length,
      },
      choice.action === 'move' ? 'No-show moved' : 'No-show refunded',
    )
    hooks.saved({ tournamentId: id, sessionIds, payoutNotes: command.notes.length })
    res.json({ deletedRegistration: command.deleteRegistration })
  })

  return router
}
