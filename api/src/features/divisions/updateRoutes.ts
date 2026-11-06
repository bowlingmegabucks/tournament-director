import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseUpdateDivision } from './updateRequest.ts'
import type { DivisionWriter, NotFound } from './writer.ts'

const idParams = z.object({ id: z.uuid(), divisionId: z.uuid() })

const confirmMessage = 'Confirm these changes to save them.'

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

function notFound(outcome: NotFound): HttpError {
  return new HttpError(
    404,
    outcome.notFound === 'tournament' ? 'Tournament not found' : 'Division not found',
  )
}

/**
 * Mounted at `/v1/tournaments/:id/divisions` for `PATCH /:divisionId` and
 * `GET /:divisionId/edit-info`, behind `divisions.write` (D-150). Web only: the legacy API has no
 * such routes, so the vendor sees no change (D-09). Which fields may change, and when, is
 * `planEdit` (D-147 to D-149); this router only turns its answer into HTTP.
 */
export function createDivisionUpdateRouter(writer: DivisionWriter, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  router.patch('/:divisionId', jsonBody, async (req, res) => {
    const { id, divisionId } = idParams.parse(req.params)
    const parsed = parseUpdateDivision(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.update(id, divisionId, parsed.changes, {
      confirmWarnings: parsed.confirmWarnings,
    })
    if ('notFound' in outcome) throw notFound(outcome)
    if ('invalid' in outcome) {
      throw new FieldErrorsError(
        400,
        `Check the highlighted fields. ${firstOf(outcome.invalid)}`,
        outcome.invalid,
      )
    }
    if ('refused' in outcome) {
      throw new FieldErrorsError(409, firstOf(outcome.refused), outcome.refused)
    }
    if ('warnings' in outcome) throw new WarningsError(409, confirmMessage, outcome.warnings)

    // Who changed which fields; the new values need no place in the log.
    if (outcome.changed.length > 0) {
      requestLogger(res, logger).info(
        {
          actorId: callerOf(res).user?.id,
          tournamentId: id,
          divisionId,
          fields: outcome.changed,
        },
        'Division updated',
      )
    }
    res.json({ division: outcome.updated })
  })

  router.get('/:divisionId/edit-info', async (req, res) => {
    const { id, divisionId } = idParams.parse(req.params)
    const info = await writer.getEditInfo(id, divisionId)
    if ('notFound' in info) throw notFound(info)
    res.json({ editInfo: info })
  })

  return router
}
