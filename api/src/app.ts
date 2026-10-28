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
import { createRegistrationRouter } from './features/registrations/routes.ts'
import type { RegistrationRepository } from './features/registrations/repository.ts'
import { createSquadRouter } from './features/squads/routes.ts'
import type { SquadRepository } from './features/squads/repository.ts'
import { createSweeperRouter } from './features/sweepers/routes.ts'
import type { SweeperRepository } from './features/sweepers/repository.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { createErrorHandler, notFound } from './shared/middleware.ts'
import { createHealthRouter } from './shared/healthRoutes.ts'
import { createReadyRouter } from './shared/readyRoutes.ts'
import { mountRoutes } from './shared/mountRoutes.ts'

export interface AppDependencies {
  config: Config
  logger: Logger
  tournaments: TournamentRepository
  divisions: DivisionRepository
  registrations: RegistrationRepository
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
  tournaments,
  divisions,
  registrations,
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
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: [requestIdHeader] }))

  // After CORS, so a 429 still carries the CORS headers and the browser can read it.
  app.use(createRateLimiter(config.rateLimit, meter))

  // Every group declares its access (D-27). Anything not mounted here is a 404.
  mountRoutes(app, [
    { path: '/health', access: 'public', router: createHealthRouter() },
    { path: '/ready', access: 'public', router: createReadyRouter(checkDatabase) },
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
      path: '/v1/tournaments/:id/registrations',
      access: 'public', // D-46: locked down right after 0.3.0 (D-52)
      router: createRegistrationRouter(registrations, tournaments, divisions, squads, sweepers),
    },
    {
      path: '/v1/tournaments',
      access: 'public',
      router: createTournamentRouter(tournaments, divisions, squads, sweepers),
    },
  ])

  app.use(notFound)
  app.use(createErrorHandler(logger))
  return app
}
