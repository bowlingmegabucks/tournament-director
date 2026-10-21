import { metrics, type Meter } from '@opentelemetry/api'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import type { Logger } from './shared/logger.ts'
import { createRateLimiter } from './shared/rateLimit.ts'
import { requestIdHeader, requestLogging } from './shared/requestLogging.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { createErrorHandler, notFound } from './shared/middleware.ts'

export interface AppDependencies {
  config: Config
  logger: Logger
  tournaments: TournamentRepository
  /** Where custom metrics go. The default sends to the OpenTelemetry SDK, or nowhere if it is off. */
  meter?: Meter
}

/** Build the app without starting it, so tests can call it with fake dependencies. */
export function createApp({
  config,
  logger,
  tournaments,
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.use('/tournaments', createTournamentRouter(tournaments))

  app.use(notFound)
  app.use(createErrorHandler(logger))
  return app
}
