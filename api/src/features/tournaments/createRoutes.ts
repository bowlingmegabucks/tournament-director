import express, { Router, type ErrorRequestHandler } from 'express'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { parseCreateTournament } from './createRequest.ts'
import type { TournamentWriter } from './writer.ts'

const duplicateMessage = 'A tournament with this name and start date already exists'

// A body that is not JSON is a 400 in the same shape as any other bad body (D-121). Anything else
// goes on to the app's handler.
const badJson: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const type = typeof err === 'object' && err !== null && 'type' in err ? err.type : undefined
  if (type === 'entity.parse.failed') {
    res.status(400).json({ message: 'The request body is not valid JSON.', errors: {} })
    return
  }
  next(err)
}

/**
 * Mounted at `/v1/tournaments` for `POST` only, behind `tournaments.write` (D-121). Web only: the
 * legacy API has no such route, so the vendor sees no change (D-09).
 */
export function createTournamentCreateRouter(writer: TournamentWriter, logger: Logger): Router {
  const router = Router()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', express.json({ limit: '10kb' }), async (req, res) => {
    const parsed = parseCreateTournament(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: parsed.message, errors: parsed.errors })
      return
    }
    const outcome = await writer.create(parsed.data)
    if ('duplicate' in outcome) {
      res.status(409).json({ message: duplicateMessage, errors: { name: duplicateMessage } })
      return
    }
    // The id only: names and dates need no place in the log.
    requestLogger(res, logger).info({ tournamentId: outcome.created.id }, 'Tournament created')
    res
      .status(201)
      .location(`/v1/tournaments/${outcome.created.id}`)
      .json({ tournament: outcome.created })
  })

  // After the route, so it catches what `express.json()` throws.
  router.use(badJson)

  return router
}
