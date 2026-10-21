import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createRandomTournamentRepository } from './features/tournaments/randomRepository.ts'
import { createLogger } from './shared/logger.ts'
import { shutdownTelemetry } from './telemetry.ts'

const config = loadConfig()
const logger = createLogger(config)
const app = createApp({
  config,
  logger,
  tournaments: createRandomTournamentRepository(),
})

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening')
})

// Finish open requests and send buffered telemetry before exit, so a deploy does not cut them off.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void shutdownTelemetry().finally(() => process.exit(0))
    })
  })
}
