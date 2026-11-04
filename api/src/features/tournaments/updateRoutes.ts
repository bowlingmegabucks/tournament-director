import { Router } from 'express'
import { z } from 'zod'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { callerOf } from '../../shared/auth/caller.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseUpdateTournament } from './updateRequest.ts'
import type { TournamentWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })

const duplicateMessage = 'A tournament with this name and start date already exists'
const confirmMessage = 'Confirm these changes to save them.'

/** The first message, for clients that show only one line. */
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

/**
 * Mounted at `/v1/tournaments` for `PATCH` only, behind `tournaments.write` (D-127). Web only: the
 * legacy API has no such route, so the vendor sees no change (D-09). Which fields may change, and
 * when, is `planEdit` (D-128 to D-130); this route only turns its answer into HTTP.
 */
export function createTournamentUpdateRouter(writer: TournamentWriter, logger: Logger): Router {
  const router = Router()

  router.patch('/:id', jsonBody, async (req, res) => {
    const { id } = idParams.parse(req.params)
    const parsed = parseUpdateTournament(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.update(id, parsed.data)
    if ('notFound' in outcome) throw new HttpError(404, 'Tournament not found')
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
    if ('duplicate' in outcome) {
      throw new FieldErrorsError(409, duplicateMessage, { name: duplicateMessage })
    }
    if ('warnings' in outcome) throw new WarningsError(409, confirmMessage, outcome.warnings)

    // Who changed which fields; the new values need no place in the log.
    if (outcome.changed.length > 0) {
      requestLogger(res, logger).info(
        { actorId: callerOf(res).user?.id, tournamentId: id, fields: outcome.changed },
        'Tournament updated',
      )
    }
    res.json({ tournament: outcome.updated })
  })

  return router
}
