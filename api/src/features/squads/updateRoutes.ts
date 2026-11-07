import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { SessionNotFound } from '../../shared/sessionEdit.ts'
import { parseUpdateSquad } from './updateRequest.ts'
import type { SquadWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid(), sessionId: z.uuid() })

const confirmMessage = 'Confirm these changes to save them.'

/** The first message, for clients that show only one line. */
// Stryker disable next-line StringLiteral: a refusal always carries a message, so the fallback never shows.
const firstOf = (errors: Record<string, string>) => Object.values(errors)[0] ?? ''

function notFound(outcome: SessionNotFound): HttpError {
  return new HttpError(
    404,
    outcome.notFound === 'tournament' ? 'Tournament not found' : 'Squad not found',
  )
}

/**
 * Mounted at `/v1/tournaments/:id/squads` for `PATCH /:sessionId` only, behind `squads.write` (D-184). Web only: the legacy API has no such
 * routes, so the vendor sees no change (D-09). Which fields may change, and when, is `planSquadEdit` (D-180 to D-182);
 * this router only turns its answer into HTTP.
 */
export function createSquadUpdateRouter(writer: SquadWriter, logger: Logger): Router {
  const router = Router({ mergeParams: true })

  router.patch('/:sessionId', jsonBody, async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const parsed = parseUpdateSquad(req.body)
    if (!parsed.success) throw new FieldErrorsError(400, parsed.message, parsed.errors)

    const outcome = await writer.update(id, sessionId, parsed.changes, {
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

    // Who changed which fields; the new values need no place in the log (D-184).
    if (outcome.changed.length > 0) {
      requestLogger(res, logger).info(
        {
          actorId: callerOf(res).user?.id,
          tournamentId: id,
          squadId: sessionId,
          fields: outcome.changed,
        },
        'Squad updated',
      )
    }
    res.json({ squad: outcome.updated })
  })

  return router
}

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/edit-info` for `GET`, behind `squads.write`
 * (D-185). It gets its own path so the group's permission check cannot reach the public
 * `squads/:sessionId/...` reads (lanes, scores, results).
 */
export function createSquadEditInfoRouter(writer: SquadWriter): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = idParams.parse(req.params)
    const info = await writer.getEditInfo(id, sessionId)
    if ('notFound' in info) throw notFound(info)
    res.json({ editInfo: info })
  })

  return router
}
