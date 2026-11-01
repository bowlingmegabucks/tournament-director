import { metrics, type Meter } from '@opentelemetry/api'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import type { Logger } from './shared/logger.ts'
import { createRateLimiter } from './shared/rateLimit.ts'
import { requestIdHeader, requestLogging } from './shared/requestLogging.ts'
import { createDivisionRouter } from './features/divisions/routes.ts'
import type { DivisionRepository } from './features/divisions/repository.ts'
import { createMeRouter } from './features/me/routes.ts'
import { createLaneRouter, findSquad, findSweeper } from './features/lanes/routes.ts'
import type { LaneRepository } from './features/lanes/repository.ts'
import { createRecapSheetRouter } from './features/recapSheets/routes.ts'
import { createRegistrationRouter } from './features/registrations/routes.ts'
import type { RegistrationRepository } from './features/registrations/repository.ts'
import { createFinalsRouter, createResultsRouter } from './features/results/routes.ts'
import { createScoreRouter } from './features/scores/routes.ts'
import type { ScoreRepository } from './features/scores/repository.ts'
import { createSquadRouter } from './features/squads/routes.ts'
import type { SquadRepository } from './features/squads/repository.ts'
import { createSweeperRouter } from './features/sweepers/routes.ts'
import type { SweeperRepository } from './features/sweepers/repository.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { createErrorHandler, notFound } from './shared/middleware.ts'
import { createHealthRouter } from './shared/healthRoutes.ts'
import { createReadyRouter } from './shared/readyRoutes.ts'
import { createAuthRouter } from './features/auth/routes.ts'
import type { Auth } from './shared/auth/createAuth.ts'
import { identifyCaller } from './shared/auth/caller.ts'
import { mountRoutes } from './shared/mountRoutes.ts'

export interface AppDependencies {
  config: Config
  logger: Logger
  /** Sign-in (Better Auth). Built in `server.ts`; tests pass one on a memory database. */
  auth: Auth
  tournaments: TournamentRepository
  divisions: DivisionRepository
  registrations: RegistrationRepository
  lanes: LaneRepository
  scores: ScoreRepository
  squads: SquadRepository
  sweepers: SweeperRepository
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
  tournaments,
  divisions,
  registrations,
  lanes,
  scores,
  squads,
  sweepers,
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
  app.use(identifyCaller(config.apiKey))

  // The five results routes (squad, sweeper, at-large, seeding, super sweeper) read the same data.
  const resultsDeps = { tournaments, divisions, squads, sweepers, lanes, scores, logger }

  // Every group declares its access (D-27). Anything not mounted here is a 404.
  mountRoutes(
    app,
    [
      { path: '/health', access: 'public', router: createHealthRouter() },
      { path: '/ready', access: 'public', router: createReadyRouter(checkDatabase) },
      // Public: a caller with no key learns it is anonymous (D-95).
      { path: '/v1/me', access: 'public', router: createMeRouter() },
      // Public: this is how someone proves who they are. Better Auth reads the body itself, so no
      // express.json() may run before it.
      { path: '/v1/auth', access: 'public', router: createAuthRouter(auth, meter, logger) },
      {
        path: '/v1/tournaments/:id/divisions',
        access: 'public',
        router: createDivisionRouter(divisions, tournaments),
      },
      {
        path: '/v1/tournaments/:id/squads',
        access: 'public',
        router: createSquadRouter(squads, tournaments),
      },
      {
        path: '/v1/tournaments/:id/sweepers',
        access: 'public',
        router: createSweeperRouter(sweepers, tournaments),
      },
      {
        path: '/v1/tournaments/:id/squads/:sessionId/lanes',
        access: 'public', // D-59: locked down right after 0.3.0 (D-52)
        router: createLaneRouter('squad', findSquad(squads), {
          lanes,
          tournaments,
          divisions,
          logger,
        }),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/lanes',
        access: 'public', // D-59: locked down right after 0.3.0 (D-52)
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
        access: 'public', // D-66: locked down right after 0.3.0 (D-52)
        router: createRecapSheetRouter('squad', findSquad(squads), {
          lanes,
          tournaments,
          divisions,
        }),
      },
      {
        path: '/v1/tournaments/:id/sweepers/:sessionId/recap-sheets',
        access: 'public', // D-66: locked down right after 0.3.0 (D-52)
        router: createRecapSheetRouter('sweeper', findSweeper(sweepers), {
          lanes,
          tournaments,
          divisions,
        }),
      },
      {
        path: '/v1/tournaments/:id/registrations',
        access: 'public', // D-46: locked down right after 0.3.0 (D-52)
        router: createRegistrationRouter(registrations, tournaments, divisions, squads, sweepers),
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
