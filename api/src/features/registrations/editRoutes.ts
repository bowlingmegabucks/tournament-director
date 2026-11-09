import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { ConflictError, FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { toBowlerValues } from './bowlerValues.ts'
import { toFieldErrors } from './deskRegister.ts'
import { editRegistration } from './editRegister.ts'
import { parseEditRequest } from './editRequest.ts'
import { sessionIdsByKind } from './held.ts'
import type { RegisterDependencies } from './register.ts'

const params = z.object({ id: z.uuid(), registrationId: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/registrations` for `GET /:registrationId/edit-info` and
 * `PATCH /:registrationId`, behind `registrations.write` (D-197, D-198). Web only: the vendor
 * `PATCH /v1/registrations/{id}` is untouched (D-09). The rules are `editRegistration`.
 */
export function createEditRegistrationRouter(deps: RegisterDependencies, logger: Logger): Router {
  const router = Router({ mergeParams: true })
  const { tournaments, writer } = deps

  router.get('/:registrationId/edit-info', async (req, res) => {
    const { id, registrationId } = params.parse(req.params)
    if (!(await tournaments.get(id))) throw new HttpError(404, 'Tournament not found')
    const stored = await writer.getDetail(registrationId)
    if (stored?.tournamentId !== id) throw new HttpError(404, 'Registration not found')

    const scoredIds = await writer.findScoredSessionIds(stored.bowlerId)
    const [held, scored] = await Promise.all([
      sessionIdsByKind(writer, stored.sessionIds),
      writer.findSessions(scoredIds),
    ])
    const scoredHere = scored.filter((session) => session.tournamentId === id)
    // The detail holds contact details: record who read whose, by id only.
    requestLogger(res, logger).info(
      { actorId: callerOf(res).user?.id, bowlerId: stored.bowlerId, tournamentId: id },
      'Registration read for edit at the desk',
    )
    res.json({
      bowler: toBowlerValues(stored.bowler),
      registration: {
        id: stored.id,
        divisionId: stored.divisionId,
        average: stored.average,
        superSweeper: stored.superSweeper,
        ...held,
      },
      locks: {
        scoredSessionIds: scoredHere.map((session) => session.id),
        hasScores: scoredHere.length > 0,
        hasSweeperScores: scoredHere.some((session) => session.kind === 'sweeper'),
      },
    })
  })

  router.patch('/:registrationId', jsonBody, async (req, res) => {
    const { id, registrationId } = params.parse(req.params)
    const parsed = parseEditRequest(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const result = await editRegistration(deps, id, registrationId, parsed.data)
    if (!result.ok) {
      switch (result.kind) {
        case 'tournamentNotFound':
          throw new HttpError(404, 'Tournament not found')
        case 'registrationNotFound':
          throw new HttpError(404, 'Registration not found')
        case 'complete':
          throw new FieldErrorsError(409, 'This tournament is complete.', {
            form: 'This tournament is complete.',
          })
        case 'changed':
          throw new ConflictError('This registration changed. Review and save again.', {
            conflict: 'changed',
            existing: result.existing,
          })
        case 'warnings':
          throw new WarningsError(409, 'Confirm these changes to save them.', result.warnings)
        case 'failures': {
          const errors = toFieldErrors(result.failures)
          // Stryker disable next-line StringLiteral: a refusal always carries a failure, so the fallback never shows.
          throw new FieldErrorsError(400, Object.values(errors)[0] ?? 'Invalid request', errors)
        }
      }
    }

    // Who edited, which registration, and how much changed. No name, email, or USBC ID.
    requestLogger(res, logger).info(
      {
        actorId: callerOf(res).user?.id,
        tournamentId: id,
        registrationId,
        added: result.added,
        removed: result.removed,
      },
      'Registration edited',
    )
    res.json({ registrationId, added: result.added, removed: result.removed })
  })

  return router
}
