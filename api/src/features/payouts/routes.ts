import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { jsonBodyUpTo } from '../../shared/jsonBody.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { RegistrationRepository } from '../registrations/repository.ts'
import { buildRows } from './listView.ts'
import { formatCents, parseAmount } from './money.ts'
import { gateReason, lockedMessage } from './savePlan.ts'
import { loadSheet, namesOf, workOutEvent, type SheetDeps } from './sheet.ts'
import { summarize, totalsByBowler } from './totals.ts'
import { paidBodySchema, saveBodySchema, type PayoutSource, type PayoutView } from './types.ts'

/** Told after a save, so the caller can drop caches and tell the screens (PAY-21, D-285). */
export interface PayoutHooks {
  saved(event: { tournamentId: string; source: PayoutSource; eventId: string }): void
}

export interface PayoutRouterDeps extends SheetDeps {
  registrations: RegistrationRepository
  logger: Logger
}

const tournamentParams = z.object({ id: z.uuid() })
const sessionParams = z.object({ id: z.uuid(), sessionId: z.uuid() })
const divisionParams = z.object({ id: z.uuid(), divisionId: z.uuid() })
const payoutParams = z.object({ id: z.uuid(), payoutId: z.uuid() })
const totalsQuery = z.object({ min: z.string().optional() })

/** A route of one event: where its id comes from (D-267). */
interface EventRoute {
  path: string
  source: PayoutSource
  /** The event id, from the request. The super sweeper's is the tournament's. */
  eventId: (params: Record<string, unknown>) => { tournamentId: string; eventId: string }
}

const eventRoutes: EventRoute[] = [
  {
    path: '/squad/:sessionId',
    source: 'squad',
    eventId: (params) => {
      const { id, sessionId } = sessionParams.parse(params)
      return { tournamentId: id, eventId: sessionId }
    },
  },
  {
    path: '/sweeper/:sessionId',
    source: 'sweeper',
    eventId: (params) => {
      const { id, sessionId } = sessionParams.parse(params)
      return { tournamentId: id, eventId: sessionId }
    },
  },
  {
    path: '/super-sweeper',
    source: 'superSweeper',
    eventId: (params) => {
      const { id } = tournamentParams.parse(params)
      return { tournamentId: id, eventId: id }
    },
  },
  {
    path: '/finals/:divisionId',
    source: 'finals',
    eventId: (params) => {
      const { id, divisionId } = divisionParams.parse(params)
      return { tournamentId: id, eventId: divisionId }
    },
  },
]

const notFoundMessage = (source: PayoutSource) =>
  ({
    squad: 'Squad not found',
    sweeper: 'Sweeper not found',
    superSweeper: 'Tournament not found',
    finals: 'Division not found',
  })[source]

/**
 * Mounted at `/v1/tournaments/:id/payouts` for `GET`, behind `payouts.read` (PAY-16, D-275). The
 * list, the by-bowler totals, and the entry sheet of each event. Web only (D-09), and never an SSN:
 * the totals name a bowler and add up money, nothing more (D-282).
 */
export function createPayoutReadRouter(deps: PayoutRouterDeps): Router {
  const router = Router({ mergeParams: true })
  // A bad stored row stays bad on every request. Say so once per process (D-51).
  const reported = new Set<string>()

  router.get('/', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    const settings = await deps.tournaments.getSettings(id)
    if (!settings) throw new HttpError(404, 'Tournament not found')
    const [records, squads, sweepers, divisions, registrations] = await Promise.all([
      deps.payouts.list(id),
      deps.squads.listByTournament(id),
      deps.sweepers.listByTournament(id),
      deps.divisions.listByTournament(id),
      deps.registrations.listByTournament(id),
    ])
    res.json({
      payouts: buildRows(records, { squads, sweepers, divisions, registrations }),
      summary: summarize(records),
      tournamentComplete: settings.completed,
    })
  })

  router.get('/totals', async (req, res) => {
    const { id } = tournamentParams.parse(req.params)
    const { min } = totalsQuery.parse(req.query)
    const parsed = parseAmount(min)
    if (parsed.kind === 'invalid') {
      throw new FieldErrorsError(400, parsed.message, { min: parsed.message })
    }
    if (!(await deps.tournaments.getSettings(id))) throw new HttpError(404, 'Tournament not found')
    const [records, registrations] = await Promise.all([
      deps.payouts.list(id),
      deps.registrations.listByTournament(id),
    ])
    const registrationBy = new Map(registrations.map((item) => [item.id, item]))
    const bowlers = totalsByBowler(
      records.map((record) => ({
        registrationId: record.registrationId,
        name: registrationBy.get(record.registrationId)?.bowler.name ?? 'Unknown bowler',
        divisionName: registrationBy.get(record.registrationId)?.divisionName ?? '',
        amountCents: record.amountCents,
        paid: record.paid,
      })),
      parsed.kind === 'amount' ? parsed.cents : 0,
    )
    res.json({ bowlers })
  })

  for (const route of eventRoutes) {
    router.get(route.path, async (req, res) => {
      const { tournamentId, eventId } = route.eventId(req.params)
      const logger = requestLogger(res, deps.logger)
      const sheet = await loadSheet(deps, { logger, reported }, route.source, tournamentId, eventId)
      if (!sheet) throw new HttpError(404, notFoundMessage(route.source))
      res.json({ sheet })
    })
  }

  return router
}

/** A save holds up to 500 rows of about 120 bytes each. */
const saveBody = jsonBodyUpTo('100kb')
const jsonBody = jsonBodyUpTo('10kb')

const confirmMessage = 'Confirm to change payouts that are already marked paid.'

/**
 * Mounted at `/v1/tournaments/:id/payouts` for `PUT` and `PATCH`, behind `payouts.write` (PAY-16).
 * `PUT` saves the whole event in one transaction (D-278); `PATCH /:payoutId` sets the paid flag
 * (D-274). What may be saved is `planSave` (D-269 to D-273); this router turns its answer into HTTP.
 */
export function createPayoutWriteRouter(deps: PayoutRouterDeps, hooks: PayoutHooks): Router {
  const router = Router({ mergeParams: true })
  const reported = new Set<string>()

  for (const route of eventRoutes) {
    router.put(route.path, saveBody, async (req, res) => {
      const { tournamentId, eventId } = route.eventId(req.params)
      const body = saveBodySchema.parse(req.body)
      const logger = requestLogger(res, deps.logger)
      const ids = { actorId: callerOf(res).user?.id, tournamentId, source: route.source, eventId }

      const facts = await deps.payouts.eventFacts(tournamentId, route.source, eventId)
      if ('notFound' in facts) throw new HttpError(404, notFoundMessage(route.source))
      // A locked tournament or a closed gate needs no results (D-272, D-273).
      const closed = facts.tournamentComplete ? lockedMessage : gateReason(facts.gate)
      if (closed) {
        logger.warn(ids, 'Payouts save refused')
        throw new FieldErrorsError(409, closed, { event: closed })
      }

      const worked = await workOutEvent(
        deps,
        { logger, reported },
        route.source,
        tournamentId,
        eventId,
      )
      const outcome = await deps.payouts.save({
        tournamentId,
        source: route.source,
        eventId,
        rows: body.payouts,
        confirmPaid: body.confirmPaid === true,
        actorId: callerOf(res).user?.id ?? 'unknown',
        inferred: new Set(worked.payees.map((payee) => payee.registrationId)),
        entered: namesOf(worked.entered),
      })

      if ('notFound' in outcome) throw new HttpError(404, notFoundMessage(route.source))
      if ('refused' in outcome) {
        logger.warn(ids, 'Payouts save refused')
        throw new FieldErrorsError(409, outcome.refused, { event: outcome.refused })
      }
      if ('invalid' in outcome) {
        logger.warn({ ...ids, rows: Object.keys(outcome.invalid).length }, 'Payouts save refused')
        throw new FieldErrorsError(400, 'Fix the rows marked and save again.', outcome.invalid)
      }
      if ('confirm' in outcome) {
        const count = outcome.confirm.length
        throw new WarningsError(
          409,
          confirmMessage,
          [
            {
              field: 'paid',
              message: `${count} of these payouts ${count === 1 ? 'is' : 'are'} marked paid.`,
            },
          ],
          { paidChanges: outcome.confirm },
        )
      }

      // Who saved what, in counts and money. A name or a note stays out (PAY-12).
      logger.info({ ...ids, ...outcome.saved }, 'Payouts saved')
      hooks.saved({ tournamentId, source: route.source, eventId })
      const sheet = await loadSheet(deps, { logger, reported }, route.source, tournamentId, eventId)
      res.json({ sheet })
    })
  }

  router.patch('/:payoutId', jsonBody, async (req, res) => {
    const { id, payoutId } = payoutParams.parse(req.params)
    const { paid } = paidBodySchema.parse(req.body)
    const logger = requestLogger(res, deps.logger)
    const outcome = await deps.payouts.setPaid(
      id,
      payoutId,
      paid,
      callerOf(res).user?.id ?? 'unknown',
    )
    if ('notFound' in outcome) throw new HttpError(404, 'Payout not found')
    if ('refused' in outcome) {
      logger.warn({ actorId: callerOf(res).user?.id, tournamentId: id }, 'Payout paid flag refused')
      throw new FieldErrorsError(409, outcome.refused, { event: outcome.refused })
    }
    if (outcome.changed) {
      logger.info(
        { actorId: callerOf(res).user?.id, tournamentId: id, payoutId, paid },
        'Payout paid flag set',
      )
    }
    const { payout } = outcome
    const view: PayoutView = {
      id: payout.id,
      amount: formatCents(payout.amountCents),
      note: payout.note,
      paid: payout.paid,
    }
    res.json({ payout: view })
  })

  return router
}
