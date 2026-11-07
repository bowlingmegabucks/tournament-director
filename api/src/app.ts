import { metrics, type Meter } from '@opentelemetry/api'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import type { Logger } from './shared/logger.ts'
import { createRateLimiter } from './shared/rateLimit.ts'
import { requestIdHeader, requestLogging } from './shared/requestLogging.ts'
import { createDivisionCreateRouter } from './features/divisions/createRoutes.ts'
import { createDivisionDeleteRouter } from './features/divisions/deleteRoutes.ts'
import { createDivisionUpdateRouter } from './features/divisions/updateRoutes.ts'
import { createDivisionRouter } from './features/divisions/routes.ts'
import type { DivisionRepository } from './features/divisions/repository.ts'
import type { DivisionWriter } from './features/divisions/writer.ts'
import { createMeRouter } from './features/me/routes.ts'
import { createLaneRouter, findSquad, findSweeper } from './features/lanes/routes.ts'
import type { LaneRepository } from './features/lanes/repository.ts'
import { createRecapSheetRouter } from './features/recapSheets/routes.ts'
import { createRegistrationRouter } from './features/registrations/routes.ts'
import type { RegistrationRepository } from './features/registrations/repository.ts'
import { createVendorRegistrationRouter } from './features/registrations/vendorRoutes.ts'
import type { RegistrationWriter } from './features/registrations/writer.ts'
import { createFinalsRouter, createResultsRouter } from './features/results/routes.ts'
import { createScoreRouter } from './features/scores/routes.ts'
import type { ScoreRepository } from './features/scores/repository.ts'
import { createSquadRouter } from './features/squads/routes.ts'
import type { SquadRepository } from './features/squads/repository.ts'
import { createSquadCreateRouter } from './features/squads/createRoutes.ts'
import { createSquadUpdateRouter } from './features/squads/updateRoutes.ts'
import type { SquadWriter } from './features/squads/writer.ts'
import { createSweeperRouter } from './features/sweepers/routes.ts'
import type { SweeperRepository } from './features/sweepers/repository.ts'
import { createSweeperCreateRouter } from './features/sweepers/createRoutes.ts'
import type { SweeperWriter } from './features/sweepers/writer.ts'
import { createTournamentDeleteRouter } from './features/tournaments/deleteRoutes.ts'
import { createEditInfoRouter } from './features/tournaments/editInfoRoutes.ts'
import { createTournamentCreateRouter } from './features/tournaments/createRoutes.ts'
import { createTournamentUpdateRouter } from './features/tournaments/updateRoutes.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentWriter } from './features/tournaments/writer.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { createErrorHandler, notFound } from './shared/middleware.ts'
import { createHealthRouter } from './shared/healthRoutes.ts'
import { createReadyRouter } from './shared/readyRoutes.ts'
import { createRootRouter } from './shared/rootRoutes.ts'
import { createOpenApiRouter } from './openapi/openapi.ts'
import { createAuthRouter } from './features/auth/routes.ts'
import type { InviteMailer } from './features/users/inviteMail.ts'
import { createAccountRouter } from './features/account/routes.ts'
import { createUserRouter } from './features/users/routes.ts'
import type { Auth } from './shared/auth/createAuth.ts'
import { identifyCaller } from './shared/auth/caller.ts'
import { mountRoutes } from './shared/mountRoutes.ts'

export interface AppDependencies {
  config: Config
  logger: Logger
  /** Sign-in (Better Auth). Built in `server.ts`; tests pass one on a memory database. */
  auth: Auth
  /** Mails the set-password link to a new user. `undefined` when the API has no mail settings. */
  invites?: InviteMailer
  tournaments: TournamentRepository
  /** Creates tournaments for the web app (TRN-19). */
  tournamentWriter: TournamentWriter
  divisions: DivisionRepository
  /** Creates and edits divisions for the web app (DIV-12). */
  divisionWriter: DivisionWriter
  registrations: RegistrationRepository
  /** Creates registrations for the registration site and the desk (API-05, D-112). */
  registrationWriter: RegistrationWriter
  lanes: LaneRepository
  scores: ScoreRepository
  squads: SquadRepository
  /** Adds squads (SQD-01 to SQD-08, D-167). */
  squadWriter: SquadWriter
  sweepers: SweeperRepository
  /** Adds sweepers (SQD-10 to SQD-13, D-174). */
  sweeperWriter: SweeperWriter
  /** Resolves when the database answers; rejects (a 503) when it does not. Feeds `GET /ready`. */
  checkDatabase: () => Promise<void>
  /** Where custom metrics go. The default sends to the OpenTelemetry SDK, or nowhere if it is off. */
  meter?: Meter
}

/** Build the app without starting it, so tests can call it with fake dependencies. */
export function createApp({
  config,
  logger,
  auth,
  invites,
  tournaments,
  tournamentWriter,
  divisions,
  divisionWriter,
  registrations,
  registrationWriter,
  lanes,
  scores,
  squads,
  squadWriter,
  sweepers,
  sweeperWriter,
  checkDatabase,
  // Stryker disable next-line StringLiteral: the scope name only labels the metrics.
  meter = metrics.getMeter('tournament-director-api'),
}: AppDependencies): express.Express {
  const app = express()
  // Without this, req.ip is the proxy's address.
  app.set('trust proxy', config.trustProxy)

  // First, so every request gets an id and a log line, even one that CORS or a 404 turns away.
  app.use(requestLogging(logger))
  // helmet also removes x-powered-by.
  app.use(helmet())
  // An empty list allows no cross-origin caller.
  // `credentials` lets the browser send the sign-in cookie to an allowed origin (D-99).
  app.use(
    cors({ origin: config.corsOrigins, credentials: true, exposedHeaders: [requestIdHeader] }),
  )

  // After CORS, so a 429 still carries the CORS headers and the browser can read it.
  app.use(createRateLimiter(config.rateLimit, meter))
  // Before the routes, so each one's access label can see who is calling (D-95, D-96).
  app.use(identifyCaller({ apiKey: config.apiKey, auth, logger }))

  // The five results routes (squad, sweeper, at-large, seeding, super sweeper) read the same data.
  const resultsDeps = { tournaments, divisions, squads, sweepers, lanes, scores, logger }

  // One router serves every method; the two groups below give each its own access.
  const vendorRegistrations = createVendorRegistrationRouter({
    tournaments,
    divisions,
    squads,
    sweepers,
    writer: registrationWriter,
    logger,
  })

  // Every group declares its access (D-27). Anything not mounted here is a 404.
  mountRoutes(
    app,
    [
      // Stryker disable next-line StringLiteral: '' and '/' match the same path.
      { path: '/', access: 'public', router: createRootRouter() },
      { path: '/openapi/v1.json', access: 'public', router: createOpenApiRouter() },
      { path: '/health', access: 'public', router: createHealthRouter() },
      { path: '/ready', access: 'public', router: createReadyRouter(checkDatabase) },
      // Public: a caller with no key learns it is anonymous (D-95).
      { path: '/v1/me', access: 'public', router: createMeRouter() },
      // Public: this is how someone proves who they are. Better Auth reads the body itself, so no
      // express.json() may run before it.
      {
        path: '/v1/auth',
        access: 'public',
        router: createAuthRouter(auth, meter, logger, invites),
      },
      {
        path: '/v1/account',
        access: 'signedIn', // any signed-in user, even with no role; the API key cannot reach it
        router: createAccountRouter({ auth, meter, logger }),
      },
      {
        path: '/v1/users',
        access: { permission: 'users.manage' }, // D-101, D-103: admins only; the API key cannot reach it
        router: createUserRouter({ auth, invites, logger }),
      },
      {
        path: '/v1/tournaments/:id/divisions',
        access: 'public',
        router: createDivisionRouter(divisions, tournaments),
      },
      {
        path: '/v1/tournaments/:id/divisions',
        access: { permission: 'divisions.write' }, // DIV-12, D-138: the API key cannot reach it
        methods: ['POST'],
        router: createDivisionCreateRouter(divisionWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/divisions',
        access: { permission: 'divisions.write' }, // DIV-12, D-150: edit and its edit-info read; no API key
        methods: ['PATCH', 'GET'],
        router: createDivisionUpdateRouter(divisionWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/divisions',
        access: { permission: 'divisions.write' }, // DIV-12, D-151: delete and its delete-info read; no API key
        methods: ['DELETE', 'GET'],
        router: createDivisionDeleteRouter(divisionWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/squads',
        access: 'public',
        router: createSquadRouter(squads, tournaments),
      },
      {
        path: '/v1/tournaments/:id/squads',
        access: { permission: 'squads.write' }, // SQD-01 to SQD-08, D-167: the API key cannot reach it
        methods: ['POST'],
        router: createSquadCreateRouter(squadWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/squads',
        access: { permission: 'squads.write' }, // SQD-23, D-184, D-185: edit and its edit-info read; no API key
        methods: ['PATCH', 'GET'],
        router: createSquadUpdateRouter(squadWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/sweepers',
        access: 'public',
        router: createSweeperRouter(sweepers, tournaments),
      },
      {
        path: '/v1/tournaments/:id/sweepers',
        access: { permission: 'squads.write' }, // SQD-10 to SQD-13, D-174: the API key cannot reach it
        methods: ['POST'],
        router: createSweeperCreateRouter(sweeperWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/squads/:sessionId/lanes',
        access: { permission: 'lanes.read' }, // D-59, D-52: signed in; the API key cannot reach it
        router: createLaneRouter('squad', findSquad(squads), {
          lanes,
          tournaments,
          divisions,
          logger,
        }),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/lanes',
        access: { permission: 'lanes.read' }, // D-59, D-52: signed in; the API key cannot reach it
        router: createLaneRouter('sweeper', findSweeper(sweepers), {
          lanes,
          tournaments,
          divisions,
          logger,
        }),
      },
      {
        path: '/v1/tournaments/:id/squads/:sessionId/scores',
        access: 'public', // D-70: public for good, so viewers who are not signed in watch scores
        router: createScoreRouter('squad', findSquad(squads), {
          lanes,
          tournaments,
          divisions,
          scores,
          logger,
        }),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/scores',
        access: 'public', // D-70
        router: createScoreRouter('sweeper', findSweeper(sweepers), {
          lanes,
          tournaments,
          divisions,
          scores,
          logger,
        }),
      },
      {
        path: '/v1/tournaments/:id/squads/:sessionId/results',
        access: 'public', // D-74: public for good, so bowlers check the standings
        router: createResultsRouter('squad', resultsDeps),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/results',
        access: 'public', // D-74
        router: createResultsRouter('sweeper', resultsDeps),
      },
      {
        path: '/v1/tournaments/:id/at-large',
        access: 'public', // D-85: public for good, so bowlers check the finals field
        router: createFinalsRouter('at-large', resultsDeps),
      },
      {
        path: '/v1/tournaments/:id/seeding',
        access: 'public', // D-85: public for good, so bowlers check the finals field
        router: createFinalsRouter('seeding', resultsDeps),
      },
      {
        path: '/v1/tournaments/:id/super-sweeper',
        access: 'public', // D-85: public for good, so bowlers check the finals field
        router: createFinalsRouter('super-sweeper', resultsDeps),
      },
      {
        path: '/v1/tournaments/:id/squads/:sessionId/recap-sheets',
        access: { permission: 'lanes.read' }, // D-66, D-52: signed in; the API key cannot reach it
        router: createRecapSheetRouter('squad', findSquad(squads), {
          lanes,
          tournaments,
          divisions,
        }),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/recap-sheets',
        access: { permission: 'lanes.read' }, // D-66, D-52: signed in; the API key cannot reach it
        router: createRecapSheetRouter('sweeper', findSweeper(sweepers), {
          lanes,
          tournaments,
          divisions,
        }),
      },
      {
        path: '/v1/tournaments/:id/registrations',
        access: { permission: 'registrations.read' }, // D-46, D-52: signed in; the API key cannot reach it
        router: createRegistrationRouter(registrations, tournaments, divisions, squads, sweepers),
      },
      {
        path: '/v1/registrations',
        access: { permission: 'registrations.write', apiKey: true }, // API-05, API-07, API-08, D-105
        methods: ['POST', 'PATCH', 'DELETE'],
        router: vendorRegistrations,
      },
      {
        path: '/v1/registrations',
        access: { permission: 'registrations.read', apiKey: true }, // API-06, D-105
        methods: ['GET'],
        router: vendorRegistrations,
      },
      {
        path: '/v1/tournaments',
        access: { permission: 'tournaments.write' }, // TRN-19, D-121: the API key cannot reach it
        methods: ['POST'],
        router: createTournamentCreateRouter(tournamentWriter, logger),
      },
      {
        path: '/v1/tournaments',
        access: { permission: 'tournaments.write' }, // TRN-24, D-127: the API key cannot reach it
        methods: ['PATCH'],
        router: createTournamentUpdateRouter(tournamentWriter, logger),
      },
      {
        path: '/v1/tournaments',
        access: { permission: 'tournaments.delete' }, // TRN-32, D-132: admin only; the key cannot reach it
        methods: ['DELETE'],
        router: createTournamentDeleteRouter(tournamentWriter, logger),
      },
      {
        path: '/v1/tournaments/:id/edit-info',
        access: { permission: 'tournaments.write' }, // TRN-28, D-131: the API key cannot reach it
        router: createEditInfoRouter(tournaments),
      },
      {
        path: '/v1/tournaments',
        access: 'public',
        router: createTournamentRouter(tournaments, divisions, squads, sweepers),
      },
    ],
    meter,
  )

  app.use(notFound)
  app.use(createErrorHandler(logger))
  return app
}
