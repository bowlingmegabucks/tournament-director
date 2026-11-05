import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseCreateDivision } from './createRequest.ts'
import type { DivisionWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })

const confirmMessage = 'Confirm to add this division.'

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments/:id/divisions` for `POST` only, behind `divisions.create` (D-138).
 * Web only: the legacy API has no such route, so the vendor sees no change (D-09). What a create
 * may do is `planCreate` (D-139 to D-143); this route only turns its answer into HTTP.
 */
export function createDivisionCreateRouter(writer: DivisionWriter, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', jsonBody, async (req, res) => {
    const { id } = idParams.parse(req.params)
    const parsed = parseCreateDivision(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.create(id, parsed.data, {
      confirmWarnings: parsed.confirmWarnings,
    })
    if ('notFound' in outcome) throw new HttpError(404, 'Tournament not found')
    if ('refused' in outcome) {
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }
    if ('warnings' in outcome) throw new WarningsError(409, confirmMessage, outcome.warnings)

    // Who made it, in which tournament, and which division; the name and limits need no place in the log.
    requestLogger(res, logger).info(
      { actorId: callerOf(res).user?.id, tournamentId: id, divisionId: outcome.created.id },
      'Division created',
    )
    res.status(201).location(`/v1/tournaments/${id}/divisions`).json({ division: outcome.created })
  })

  return router
}
