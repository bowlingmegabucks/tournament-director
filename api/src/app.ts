import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import type { Logger } from './shared/logger.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { createErrorHandler, notFound } from './shared/middleware.ts'

export interface AppDependencies {
  config: Config
  logger: Logger
  tournaments: TournamentRepository
}

/** Build the app without starting it, so tests can call it with fake dependencies. */
export function createApp({ config, logger, tournaments }: AppDependencies): express.Express {
  const app = express()

  // helmet also removes x-powered-by.
  app.use(helmet())
  // An empty list allows no cross-origin caller.
  app.use(cors({ origin: config.corsOrigins }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.use('/tournaments', createTournamentRouter(tournaments))

  app.use(notFound)
  app.use(createErrorHandler(logger))
  return app
}
