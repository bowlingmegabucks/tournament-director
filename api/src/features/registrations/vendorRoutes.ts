import express, { Router, type ErrorRequestHandler, type Response } from 'express'
import { z } from 'zod'
import type { Logger } from '../../shared/logger.ts'
import { requestIdHeader, requestLogger } from '../../shared/requestLogging.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import { toVendorDivision } from '../divisions/types.ts'
import type { SquadRepository } from '../squads/repository.ts'
import { toVendorSquad } from '../squads/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import { toVendorSweeper } from '../sweepers/types.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { notFoundProblem, toProblem, type Failure } from './problem.ts'
import { register } from './register.ts'
import { parseCreateRequest } from './request.ts'
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

// A body that is not JSON, or too large, is the caller's mistake: 400 with the problem body.
const badBody: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const type = typeof err === 'object' && err !== null && 'type' in err ? err.type : undefined
  if (type !== 'entity.parse.failed') {
    next(err)
    return
  }
  const failures: Failure[] = [
    {
      kind: 'validation',
      code: 'Registration.Required',
      description: 'The request body is not valid JSON.',
    },
  ]
  res
    .status(400)
    .type('application/problem+json')
    .json(toProblem(failures, 'An error occurred while creating the registration.', traceIdOf(res)))
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

  router.use(badBody)
  return router
}
