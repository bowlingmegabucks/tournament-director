import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import { createTournamentRouter } from './features/tournaments/routes.ts'
import type { TournamentRepository } from './features/tournaments/repository.ts'
import { errorHandler, notFound } from './shared/middleware.ts'

export interface AppDependencies {
  config: Config
  tournaments: TournamentRepository
}

/** Build the app without starting it, so tests can call it with fake dependencies. */
export function createApp({ config, tournaments }: AppDependencies): express.Express {
  const app = express()

  // helmet also removes x-powered-by.
  app.use(helmet())
  // An empty list allows no cross-origin caller.
  app.use(cors({ origin: config.corsOrigins }))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.use('/api/tournaments', createTournamentRouter(tournaments))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
