import { Router } from 'express'
import { z } from 'zod'
import { callerOf } from '../../shared/auth/caller.ts'
import { FieldErrorsError, HttpError, WarningsError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { deleteField, deskDeleteInfo, planDeskDelete } from './deskDelete.ts'
import type { RegisterDependencies } from './register.ts'

const params = z.object({ id: z.uuid(), registrationId: z.uuid() })

// A `DELETE` takes no body, so confirming rides in the query string (D-210). Confirming carries the
// total paid the director saw, so a payment that arrived since is warned about again.
const money = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,2})?$/)
  .transform(Number)
const deleteQuery = z
  .object({ confirmWarnings: z.literal('true').optional(), paid: money.optional() })
  .refine((query) => query.confirmWarnings === undefined || query.paid !== undefined, {
    message: 'Confirming needs the total paid that the warning showed.',
  })

/**
 * Mounted at `/v1/tournaments/:id/registrations` for `GET /:registrationId/delete-info` and
 * `DELETE /:registrationId`, behind `registrations.write` (D-209). Web only: the vendor
 * `DELETE /v1/registrations/{id}` is untouched (D-09). The rules are `planDeskDelete`; this route
 * only turns its answer into HTTP.
 */
export function createDeskDeleteRouter(deps: RegisterDependencies, logger: Logger): Router {
  const router = Router({ mergeParams: true })
  const { tournaments, writer } = deps

  router.get('/:registrationId/delete-info', async (req, res) => {
    const { id, registrationId } = params.parse(req.params)
    if (!(await tournaments.get(id))) throw new HttpError(404, 'Tournament not found')
    const facts = await writer.getDeskDeleteFacts(registrationId, id)
    if (!facts) throw new HttpError(404, 'Registration not found')
    // The reply holds a name and amounts, never a code: log who looked, by id only.
    requestLogger(res, logger).info(
      { actorId: callerOf(res).user?.id, tournamentId: id, registrationId },
      'Registration read for delete at the desk',
    )
    res.json({ deleteInfo: deskDeleteInfo(facts) })
  })

  router.delete('/:registrationId', async (req, res) => {
    const { id, registrationId } = params.parse(req.params)
    const query = deleteQuery.parse(req.query)
    if (!(await tournaments.get(id))) throw new HttpError(404, 'Tournament not found')

    const confirmedPaid = query.confirmWarnings === 'true' ? query.paid : undefined
    let facts: ReturnType<typeof deskDeleteInfo> | undefined
    const plan = await writer.removeForDesk(registrationId, id, (read) => {
      facts = deskDeleteInfo(read)
      return planDeskDelete(read, confirmedPaid)
    })
    if (!plan || !facts) throw new HttpError(404, 'Registration not found')

    const log = requestLogger(res, logger)
    const actorId = callerOf(res).user?.id
    if (plan.kind === 'refused') {
      log.warn(
        { actorId, tournamentId: id, registrationId, reasons: Object.keys(plan.errors) },
        'Registration delete at the desk refused',
      )
      // Stryker disable next-line StringLiteral: a refusal always has a reason, so the fallback never shows.
      const message = plan.errors.tournament ?? plan.errors.scores ?? ''
      throw new FieldErrorsError(409, message, plan.errors)
    }
    if (plan.kind === 'warn') {
      throw new WarningsError(
        409,
        'Confirm to delete this registration.',
        [{ field: deleteField, message: plan.message }],
        { paid: plan.paid },
      )
    }

    // The payment records go with the registration, so this line is the trail (D-214): ids and
    // counts only, never a name, email, USBC ID, or confirmation code.
    log.info(
      {
        actorId,
        tournamentId: id,
        registrationId,
        squads: facts.entries.filter((entry) => entry.kind === 'squad').length,
        sweepers: facts.entries.filter((entry) => entry.kind === 'sweeper').length,
        realPayments: facts.payments.length,
        paidTotal: facts.paidTotal,
      },
      'Registration deleted at the desk',
    )
    res.status(204).end()
  })

  return router
}
