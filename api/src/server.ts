import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createPrismaDivisionRepository } from './features/divisions/prismaRepository.ts'
import { createPrismaTournamentRepository } from './features/tournaments/prismaRepository.ts'
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
  tournaments: createPrismaTournamentRepository(database, logger),
  divisions: createPrismaDivisionRepository(database, logger),
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
