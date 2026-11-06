import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { DivisionWriter, NotFound } from './writer.ts'

const idParams = z.object({ id: z.uuid(), divisionId: z.uuid() })

function notFound(outcome: NotFound): HttpError {
  return new HttpError(
    404,
    outcome.notFound === 'tournament' ? 'Tournament not found' : 'Division not found',
  )
}

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments/:id/divisions` for `DELETE /:divisionId` and
 * `GET /:divisionId/delete-info`, behind `divisions.write` (D-150, D-151). Web only: the legacy API
 * has no such routes, so the vendor sees no change (D-09). What may be deleted is `planDelete`
 * (D-151); this router only turns its answer into HTTP.
 */
export function createDivisionDeleteRouter(writer: DivisionWriter, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  router.delete('/:divisionId', async (req, res) => {
    const { id, divisionId } = idParams.parse(req.params)
    const outcome = await writer.remove(id, divisionId)
    if ('notFound' in outcome) throw notFound(outcome)
    if ('refused' in outcome) {
      requestLogger(res, logger).warn(
        {
          actorId: callerOf(res).user?.id,
          tournamentId: id,
          divisionId,
          reasons: Object.keys(outcome.refused).length,
        },
        'Division delete refused',
      )
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }

    // Who deleted what. The name stays out of the log (D-155).
    requestLogger(res, logger).info(
      {
        actorId: callerOf(res).user?.id,
        tournamentId: id,
        divisionId,
        number: outcome.deleted.number,
      },
      'Division deleted',
    )
    res.status(204).end()
  })

  router.get('/:divisionId/delete-info', async (req, res) => {
    const { id, divisionId } = idParams.parse(req.params)
    const info = await writer.getDeleteInfo(id, divisionId)
    if ('notFound' in info) throw notFound(info)
    res.json({ deleteInfo: info })
  })

  return router
}
