import { Router } from 'express'
import { z } from 'zod'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { callerOf } from '../../shared/auth/caller.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { deleteField } from './deletePlan.ts'
import type { TournamentWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })
// A `DELETE` takes no body (D-134), so confirming rides in the query string. Only `true` is valid.
const deleteQuery = z.object({ confirmWarnings: z.literal('true').optional() })

const confirmMessage = 'Confirm to delete this tournament.'

/**
 * Mounted at `/v1/tournaments` for `DELETE` only, behind `tournaments.delete` (D-132). Web only: the
 * legacy API has no such route, so the vendor sees no change (D-09). What may be deleted, and when
 * to ask first, is `planDelete` (D-133, D-134); this route only turns its answer into HTTP.
 */
export function createTournamentDeleteRouter(writer: TournamentWriter, logger: Logger): Router {
  const router = Router()

  router.delete('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const { confirmWarnings } = deleteQuery.parse(req.query)

    const outcome = await writer.remove(id, { confirmWarnings: confirmWarnings === 'true' })
    if ('notFound' in outcome) throw new HttpError(404, 'Tournament not found')
    if ('refused' in outcome) {
      // `refused` is never empty. The message is the first reason; `errors` holds them all.
      // Stryker disable next-line StringLiteral: the fallback never shows, since a refusal has a reason.
      throw new FieldErrorsError(409, outcome.refused[0] ?? '', {
        [deleteField]: outcome.refused.join('\n'),
      })
    }
    if ('warnings' in outcome) throw new WarningsError(409, confirmMessage, outcome.warnings)

    // Who deleted what, in counts. Names and amounts stay out of the log.
    const { registrations, divisions, squads, sweepers } = outcome.deleted
    requestLogger(res, logger).info(
      {
        actorId: callerOf(res).user?.id,
        tournamentId: id,
        registrations,
        divisions,
        squads,
        sweepers,
      },
      'Tournament deleted',
    )
    res.status(204).end()
  })

  return router
}
