import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createDemoTournamentRepository } from './features/tournaments/demoRepository.ts'
import { createLogger } from './shared/logger.ts'
import { handleProcessEvents } from './shared/processEvents.ts'
import { shutdownTelemetry } from './telemetry.ts'

const config = loadConfig()
const logger = createLogger(config)
const app = createApp({
  config,
  logger,
  tournaments: createDemoTournamentRepository(),
})

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API listening')
})

// Finish open requests and send buffered telemetry before exit, so a deploy does not cut them off.
// Also logs a crash before the process dies.
handleProcessEvents(process, {
  logger,
  server,
  flush: shutdownTelemetry,
  exit: (code) => process.exit(code),
  forceExitMs: 10_000,
})
