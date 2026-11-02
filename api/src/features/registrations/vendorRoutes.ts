import express, { Router, type ErrorRequestHandler, type Response } from 'express'
import { z, ZodError } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestIdHeader, requestLogger } from '../../shared/requestLogging.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import { toVendorDivision } from '../divisions/types.ts'
import type { SquadRepository } from '../squads/repository.ts'
import { toVendorSquad } from '../squads/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import { toVendorSweeper } from '../sweepers/types.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { notFoundProblem, toProblem, validation } from './problem.ts'
import { register } from './register.ts'
import { parseCreateRequest } from './request.ts'
import { updateRegistration } from './update.ts'
import { parseUpdateRequest } from './updateRequest.ts'
import type { RegistrationDetailResponse } from './vendorTypes.ts'
import type { RegistrationWriter } from './writer.ts'

const idParams = z.object({ id: z.uuid() })

export interface VendorRegistrationDependencies {
  tournaments: TournamentRepository
  divisions: DivisionRepository
  squads: SquadRepository
  sweepers: SweeperRepository
  writer: RegistrationWriter
  logger: Logger
}

// The trace id in a problem body is the request id the caller also sees in `x-request-id`.
function traceIdOf(res: Response): string {
  const header = res.getHeader(requestIdHeader)
  return typeof header === 'string' ? header : ''
}

// Errors on these routes. A body that is not JSON is the caller's mistake: 400 with the problem
// body. An error we meant to send (`HttpError`, such as a database outage) or a bad id (`ZodError`)
// goes on to the app's handler. Anything else is a crash: log it and answer with the legacy text
// (API-13). The cause never reaches the caller.
function routeErrors(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    const type = typeof err === 'object' && err !== null && 'type' in err ? err.type : undefined
    if (type === 'entity.parse.failed') {
      const failures = [validation('Registration.Required', 'The request body is not valid JSON.')]
      const detail = 'An error occurred while creating the registration.'
      res
        .status(400)
        .type('application/problem+json')
        .json(toProblem(failures, detail, traceIdOf(res)))
      return
    }
    if (type === 'entity.too.large') {
      const failures = [validation('Registration.Required', 'The request body is too large.')]
      res
        .status(413)
        .type('application/problem+json')
        .json({
          ...toProblem(failures, 'The request body is too large.', traceIdOf(res)),
          status: 413,
        })
      return
    }
    if (err instanceof HttpError || err instanceof ZodError) {
      next(err)
      return
    }
    requestLogger(res, logger).error({ err }, 'Unhandled error')
    res
      .status(500)
      .type('application/problem+json')
      .json({
        status: 500,
        detail: 'An unexpected error occurred while processing your request.',
        traceId: traceIdOf(res),
        message: 'Internal server error',
      })
  }
}

/**
 * Mounted at `/v1/registrations`: the routes the registration site calls (API-05, API-06). Create
 * and read accept the API key or a signed-in user with `registrations.write` or `.read` (D-105).
 * Vendor-visible: paths, bodies, and status codes follow `integration-api.md` (D-09).
 */
export function createVendorRegistrationRouter(deps: VendorRegistrationDependencies): Router {
  const { tournaments, divisions, squads, sweepers, writer, logger } = deps
  const router = Router()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.post('/', express.json({ limit: '100kb' }), async (req, res) => {
    const parsed = parseCreateRequest(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .type('application/problem+json')
        .json(
          toProblem(
            parsed.failures,
            'An error occurred while creating the registration.',
            traceIdOf(res),
          ),
        )
      return
    }

    const result = await register(
      { tournaments, divisions, sweepers, writer },
      parsed.data.registration,
    )
    const log = requestLogger(res, logger)
    if (!result.ok) {
      // Codes only: the request holds personal data (SEC-13).
      log.info({ codes: result.failures.map((failure) => failure.code) }, 'Registration refused')
      const problem = toProblem(
        result.failures,
        result.mode === 'append'
          ? 'An error occurred while appending the registration.'
          : 'An error occurred while creating the registration.',
        traceIdOf(res),
      )
      res.status(problem.status).type('application/problem+json').json(problem)
      return
    }
    log.info({ registrationId: result.registrationId, mode: result.mode }, 'Registration saved')
    res
      .status(201)
      .location(`/v1/registrations/${result.registrationId}`)
      .json({ registrationId: result.registrationId })
  })

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const detail = await writer.getDetail(id)
    if (!detail) {
      res
        .status(404)
        .type('application/problem+json')
        .json(notFoundProblem(traceIdOf(res)))
      return
    }
    const [tournamentDivisions, tournamentSquads, tournamentSweepers] = await Promise.all([
      divisions.listByTournament(detail.tournamentId),
      squads.listByTournament(detail.tournamentId),
      sweepers.listByTournament(detail.tournamentId),
    ])
    const division = tournamentDivisions.find((candidate) => candidate.id === detail.divisionId)
    // A division that breaks the read shape is skipped (D-39); the registration cannot be shown whole.
    if (!division) throw new Error(`Registration ${id} has no readable division`)

    const { bowler } = detail
    const body: RegistrationDetailResponse = {
      registration: {
        id: detail.id,
        tournamentId: detail.tournamentId,
        average: detail.average,
        superSweeper: detail.superSweeper,
        bowler: {
          id: bowler.id,
          firstName: bowler.firstName,
          middleInitial: bowler.middleInitial,
          lastName: bowler.lastName,
          suffix: bowler.suffix,
          address: {
            street: bowler.street,
            city: bowler.city,
            state: bowler.state,
            zipCode: bowler.zipCode,
          },
          email: bowler.email,
          phoneNumber: bowler.phoneNumber,
          usbcId: bowler.usbcId,
          dateOfBirth: bowler.dateOfBirth,
          gender: bowler.gender,
        },
        division: toVendorDivision(division),
        squads: tournamentSquads
          .filter((squad) => detail.sessionIds.includes(squad.id))
          .map(toVendorSquad),
        sweepers: tournamentSweepers
          .filter((sweeper) => detail.sessionIds.includes(sweeper.id))
          .map(toVendorSweeper),
      },
    }
    res.json(body)
  })

  router.patch('/:id', express.json({ limit: '100kb' }), async (req, res) => {
    const { id } = idParams.parse(req.params)
    const detail = 'An error occurred while updating the registration.'
    const parsed = parseUpdateRequest(req.body)
    const failures = parsed.success
      ? parsed.data.registration.registrationId === id
        ? []
        : [
            validation(
              'Registration.IdMismatch',
              'The registration ID in the body does not match the route.',
            ),
          ]
      : parsed.failures
    if (!parsed.success || failures.length > 0) {
      const problem = toProblem(failures, detail, traceIdOf(res))
      res.status(problem.status).type('application/problem+json').json(problem)
      return
    }

    const result = await updateRegistration(
      { tournaments, divisions, sweepers, writer },
      id,
      parsed.data.registration,
    )
    const log = requestLogger(res, logger)
    if (!result.ok) {
      log.info({ codes: result.failures.map((failure) => failure.code) }, 'Update refused')
      const problem = toProblem(result.failures, detail, traceIdOf(res))
      res.status(problem.status).type('application/problem+json').json(problem)
      return
    }
    log.info({ registrationId: id, mode: result.mode }, 'Registration updated')
    res.status(204).end()
  })

  router.use(routeErrors(logger))
  return router
}
