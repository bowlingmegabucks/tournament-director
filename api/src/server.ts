import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createPrismaDivisionRepository } from './features/divisions/prismaRepository.ts'
import { createPrismaLaneRepository } from './features/lanes/prismaRepository.ts'
import { createPrismaRegistrationRepository } from './features/registrations/prismaRepository.ts'
import { createPrismaScoreRepository } from './features/scores/prismaRepository.ts'
import { createPrismaSquadRepository } from './features/squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from './features/sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from './features/tournaments/prismaRepository.ts'
import { createAuth } from './shared/auth/createAuth.ts'
import { createDatabaseClient, pingDatabase } from './shared/database.ts'
import { createLogger } from './shared/logger.ts'
import { handleProcessEvents } from './shared/processEvents.ts'
import { shutdownTelemetry } from './telemetry.ts'

const config = loadConfig()
const logger = createLogger(config)
const database = createDatabaseClient(config.databaseUrl)
const app = createApp({
  config,
  logger,
  auth: createAuth({
    config: config.auth,
    database: prismaAdapter(database, { provider: 'mysql' }),
    // The pages that may call sign-in from a browser are the same ones CORS lets in.
    trustedOrigins: config.corsOrigins,
    logger,
  }),
  tournaments: createPrismaTournamentRepository(database, logger),
  divisions: createPrismaDivisionRepository(database, logger),
  registrations: createPrismaRegistrationRepository(database, logger),
  lanes: createPrismaLaneRepository(database, logger),
  scores: createPrismaScoreRepository(database, logger),
  squads: createPrismaSquadRepository(database, logger),
  sweepers: createPrismaSweeperRepository(database, logger),
  checkDatabase: () => pingDatabase(database, logger),
})

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening')
})

// Finish open requests, close the database, and send buffered telemetry before exit, so a deploy
// does not cut them off. Also logs a crash before the process dies.
handleProcessEvents(process, {
  logger,
  server,
  flush: async () => {
    try {
      await database.$disconnect()
    } finally {
      await shutdownTelemetry()
    }
  },
  exit: (code) => process.exit(code),
  forceExitMs: 10_000,
})
