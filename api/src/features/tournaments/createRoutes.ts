import { Router } from 'express'
import { FieldErrorsError } from '../../shared/errors.ts'
import { callerOf } from '../../shared/auth/caller.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseCreateTournament } from './createRequest.ts'
import type { TournamentWriter } from './writer.ts'

const duplicateMessage = 'A tournament with this name and start date already exists'

/**
 * Mounted at `/v1/tournaments` for `POST` only, behind `tournaments.write` (D-121). Web only: the
 * legacy API has no such route, so the vendor sees no change (D-09).
 */
export function createTournamentCreateRouter(writer: TournamentWriter, logger: Logger): Router {
  const router = Router()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', jsonBody, async (req, res) => {
    const parsed = parseCreateTournament(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.create(parsed.data)
    if ('duplicate' in outcome) {
      throw new FieldErrorsError(409, duplicateMessage, { name: duplicateMessage })
    }
    // Who made it and which tournament; names and dates need no place in the log.
    requestLogger(res, logger).info(
      { actorId: callerOf(res).user?.id, tournamentId: outcome.created.id },
      'Tournament created',
    )
    res
      .status(201)
      .location(`/v1/tournaments/${outcome.created.id}`)
      .json({ tournament: outcome.created })
  })

  return router
}
