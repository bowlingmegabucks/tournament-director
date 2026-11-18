import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import { jsonBodyUpTo } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { averageInUse, averageStatus } from './inUse.ts'
import { planCheck, planRemove, type CheckPlan } from './savePlan.ts'
import type { AverageStore, CheckReading } from './store.ts'
import { checkBodySchema } from './types.ts'

/** Told after a save, a removal, or a clearing, so the caller can drop caches and tell the screens (AVG-19, D-298). */
export interface AverageHooks {
  changed(event: { tournamentId: string; registrationId: string; sessionIds: string[] }): void
}

export interface AverageRouterDeps {
  averages: AverageStore
  logger: Logger
}

const tournamentParams = z.object({ id: z.uuid() })
const checkParams = z.object({ id: z.uuid(), registrationId: z.uuid() })
// A `DELETE` takes no body, so confirming rides in the query string (D-210).
const removeQuery = z.object({ confirmWarnings: z.literal('true').optional() })

/**
 * Mounted at `/v1/tournaments/:id/averages` for `GET`, behind `registrations.read` (AVG-02,
 * AVG-10). The registrations of handicap divisions with their check. Web only (D-09). Holds a name
 * and an average, never an SSN or contact detail.
 */
export function createAverageReadRouter({ averages }: AverageRouterDeps): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    const listing = await averages.list(id)
    if (!listing) throw new HttpError(404, 'Tournament not found')
    res.json({ rows: listing.rows, tournamentComplete: listing.tournamentComplete })
  })

  return router
}

const jsonBody = jsonBodyUpTo('10kb')

/** The one thing a refused or confirming plan turns into; a plan that saves or removes returns. */
function throwUnlessDone(
  plan: CheckPlan,
): asserts plan is Extract<CheckPlan, { kind: 'save' | 'remove' }> {
  switch (plan.kind) {
    case 'refused':
      throw new HttpError(plan.status, plan.message)
    case 'invalid': {
      const [first = 'Check the average.'] = Object.values(plan.errors)
      throw new FieldErrorsError(400, first, plan.errors)
    }
    case 'confirm':
      throw new WarningsError(
        409,
        plan.warnings[0]?.message ?? 'Confirm the change.',
        plan.warnings,
      )
    default:
  }
}

/**
 * Mounted at `/v1/tournaments/:id/registrations` for `PUT` and `DELETE /:registrationId/average-check`,
 * behind `averages.verify` (AVG-10, D-292). `PUT` verifies or adjusts, `DELETE` takes the check away.
 * What may be saved is `planCheck` and `planRemove`; this router turns their answer into HTTP.
 */
export function createAverageWriteRouter(
  { averages, logger }: AverageRouterDeps,
  hooks: AverageHooks,
): Router {
  const router = Router({ mergeParams: true })

  async function load(tournamentId: string, registrationId: string): Promise<CheckReading> {
    const reading = await averages.read(tournamentId, registrationId)
    if (!reading) throw new HttpError(404, 'Registration not found')
    return reading
  }

  router.put('/:registrationId/average-check', jsonBody, async (req, res) => {
    const { id, registrationId } = checkParams.parse(req.params)
    const body = checkBodySchema.parse(req.body)
    const log = requestLogger(res, logger)
    const actorId = callerOf(res).user?.id ?? 'unknown'
    const reading = await load(id, registrationId)

    const plan = planCheck(reading, body)
    if (plan.kind === 'refused' || plan.kind === 'invalid') {
      log.warn(
        { actorId, tournamentId: id, registrationId, action: body.action },
        'Average check refused',
      )
    }
    throwUnlessDone(plan)
    if (plan.kind !== 'save') throw new HttpError(500, 'Unexpected plan')

    await averages.save(registrationId, plan.check, actorId)
    log.info(
      {
        actorId,
        tournamentId: id,
        registrationId,
        action: body.action,
        was: averageInUse(reading.providedAverage, reading.existing),
        now: plan.check.verifiedAverage,
      },
      'Average check saved',
    )
    hooks.changed({ tournamentId: id, registrationId, sessionIds: reading.sessionIds })
    res.json({
      registrationId,
      status: averageStatus(plan.check),
      providedAverage: plan.check.providedAverage,
      averageInUse: plan.check.verifiedAverage,
      note: plan.check.note,
    })
  })

  router.delete('/:registrationId/average-check', async (req, res) => {
    const { id, registrationId } = checkParams.parse(req.params)
    const query = removeQuery.parse(req.query)
    const log = requestLogger(res, logger)
    const actorId = callerOf(res).user?.id ?? 'unknown'
    const reading = await load(id, registrationId)

    const plan = planRemove(reading, query.confirmWarnings === 'true')
    if (plan.kind === 'refused') {
      log.warn(
        { actorId, tournamentId: id, registrationId, action: 'remove' },
        'Average check refused',
      )
    }
    throwUnlessDone(plan)

    await averages.remove(registrationId)
    log.info(
      {
        actorId,
        tournamentId: id,
        registrationId,
        action: 'remove',
        was: averageInUse(reading.providedAverage, reading.existing),
        now: reading.providedAverage,
      },
      'Average check removed',
    )
    hooks.changed({ tournamentId: id, registrationId, sessionIds: reading.sessionIds })
    res.json({
      registrationId,
      status: 'unverified',
      providedAverage: reading.providedAverage,
      averageInUse: reading.providedAverage,
      note: null,
    })
  })

  return router
}
