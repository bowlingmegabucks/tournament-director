import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseCreateSweeper } from './createRequest.ts'
import type { SweeperWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments/:id/sweepers` for `POST` only, behind `squads.write` (D-174). Web
 * only: the legacy API has no such route, so the vendor sees no change (D-09). What a create may
 * do is `planCreate` (D-171, D-177); this route only turns its answer into HTTP.
 */
export function createSweeperCreateRouter(writer: SweeperWriter, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', jsonBody, async (req, res) => {
    const { id } = idParams.parse(req.params)
    const parsed = parseCreateSweeper(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.create(id, parsed.data)
    if ('notFound' in outcome) throw new HttpError(404, 'Tournament not found')
    if ('refused' in outcome) {
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }

    // Who made it, in which tournament, and which sweeper; nothing else needs a place in the log (D-178).
    requestLogger(res, logger).info(
      { actorId: callerOf(res).user?.id, tournamentId: id, sweeperId: outcome.created.id },
      'Sweeper created',
    )
    res.status(201).location(`/v1/tournaments/${id}/sweepers`).json({ sweeper: outcome.created })
  })

  return router
}
