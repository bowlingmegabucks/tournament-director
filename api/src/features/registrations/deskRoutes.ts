import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { ConflictError, FieldErrorsError, HttpError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { deskRegister, toFieldErrors } from './deskRegister.ts'
import { parseDeskRequest } from './deskRequest.ts'
import type { RegisterDependencies } from './register.ts'

const idParams = z.object({ id: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/registrations` for `POST` only, behind `registrations.write`
 * (D-157). Web only: the legacy API has no such route, so the vendor sees no change (D-09). The
 * rules are `deskRegister`; this route turns its answer into HTTP.
 */
export function createDeskRegistrationRouter(deps: RegisterDependencies, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', jsonBody, async (req, res) => {
    const { id } = idParams.parse(req.params)
    const parsed = parseDeskRequest(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const result = await deskRegister(deps, id, parsed.data)
    if (!result.ok) {
      switch (result.kind) {
        case 'tournamentNotFound':
          throw new HttpError(404, 'Tournament not found')
        case 'bowlerNotFound':
          throw new HttpError(404, 'Bowler not found')
        case 'complete':
          throw new FieldErrorsError(409, 'This tournament is complete.', {
            form: 'This tournament is complete.',
          })
        case 'alreadyRegistered':
          throw new ConflictError('Bowler is already registered for this tournament.', {
            conflict: 'alreadyRegistered',
            existing: result.existing,
          })
        case 'usbcIdOnFile':
          throw new ConflictError('A bowler with this USBC ID is on file.', {
            conflict: 'usbcIdOnFile',
            bowler: result.bowler,
          })
        case 'failures': {
          const errors = toFieldErrors(result.failures)
          throw new FieldErrorsError(400, Object.values(errors)[0] ?? 'Invalid request', errors)
        }
      }
    }

    // Who added it, where, and whether it was new or an append. No name, email, or USBC ID.
    requestLogger(res, logger).info(
      {
        actorId: callerOf(res).user?.id,
        tournamentId: id,
        registrationId: result.registrationId,
        mode: result.mode,
      },
      'Registration added at the desk',
    )
    res
      .status(201)
      .location(`/v1/registrations/${result.registrationId}`)
      .json({ registrationId: result.registrationId, mode: result.mode })
  })

  return router
}
